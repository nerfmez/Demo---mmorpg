// Restore retained Pages bytes. Never rebuild and never touch player storage.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { payload } from './ci-build-manifest.mjs';
import { extractBuildArchive, runArtifacts } from './ci-release-evidence.mjs';
const sha = /^[a-f0-9]{40}$/;
export function selectPublishedRun(runs, jobsByRun, { rollback = false, skipId } = {}) {
  const candidates = [];
  for (const run of runs) {
    if (String(run.id) === String(skipId) || run.path !== '.github/workflows/deploy.yml' ||
        run.head_branch !== 'main' || !['push', 'workflow_dispatch', 'workflow_run'].includes(run.event)) continue;
    for (const job of jobsByRun(run)) {
      if (job.name !== 'deploy' || job.run_attempt !== run.run_attempt) continue;
      const publication = job.steps?.find(step => step.name === 'Run actions/deploy-pages@v4' && step.conclusion === 'success');
      if (!publication || (rollback && (run.status !== 'completed' || run.conclusion !== 'success' || job.conclusion !== 'success'))) continue;
      const publishedAt = Date.parse(publication.completed_at);
      assert.ok(Number.isFinite(publishedAt), 'Missing authoritative publication timestamp');
      const publicationStartedAt = Date.parse(publication.started_at);
      assert.ok(Number.isFinite(publicationStartedAt) && publicationStartedAt <= publishedAt, 'Missing publication start');
      candidates.push({ ...run, publishedAt, publicationStartedAt, publicationJob: job.id });
    }
  }
  candidates.sort((a, b) => b.publishedAt - a.publishedAt);
  assert.ok(candidates.length, 'No eligible retained Pages publication; select a successful main release run.');
  assert.ok(candidates.length === 1 || candidates[0].publishedAt !== candidates[1].publishedAt,
    'Ambiguous simultaneous publications; refusing to guess the live site');
  return candidates[0];
}
// Read only the authenticated successful deploy step's log interval. The action
// records the immutable artifact ID sent to Pages, including deploy-only retries.
export function consumedPagesArtifact(log, run) {
  assert.equal(typeof log, 'string');
  const lines = log.split('\n').flatMap(line => {
    const match = /^\uFEFF?(\d{4}-\d{2}-\d{2}T\S+Z) (.*)$/.exec(line);
    if (!match) return [];
    const time = Date.parse(match[1]);
    // Jobs API times have second precision; log timestamps have subsecond precision.
    return time >= run.publicationStartedAt && time < run.publishedAt + 1000 ? [match[2]] : [];
  }).join('\n');
  const matches = [...lines.matchAll(/Creating Pages deployment with payload:\s*(\{[\s\S]*?\})/g)];
  assert.equal(matches.length, 1, 'Missing or ambiguous successful Pages artifact receipt');
  const receipt = JSON.parse(matches[0][1]);
  assert.equal(receipt.pages_build_version, run.head_sha, 'Published workflow source differs');
  assert.notEqual(receipt.preview, true, 'Preview is not a production publication');
  const id = Number(receipt.artifact_id);
  assert.ok(Number.isSafeInteger(id) && id > 0, 'Invalid consumed artifact ID');
  return id;
}
export async function publicationRuns(api, prefix) {
  const runs = [], ids = new Set();
  let total;
  for (let page = 1; ; page++) {
    const result = await api(`${prefix}/actions/workflows/deploy.yml/runs?per_page=100${page === 1 ? '' : `&page=${page}`}`);
    assert.ok(Number.isSafeInteger(result.total_count) && result.total_count >= 0 && result.total_count <= 10000);
    if (total === undefined) total = result.total_count;
    assert.equal(result.total_count, total, 'Publication history changed during lookup');
    assert.equal(result.workflow_runs.length, Math.min(100, total - runs.length), 'Truncated publication history');
    for (const run of result.workflow_runs) { assert.ok(!ids.has(run.id)); ids.add(run.id); runs.push(run); }
    if (runs.length === total) return runs;
  }
}
export function sealSite(directory = 'dist') {
  const release = JSON.parse(readFileSync(join(directory, 'ci-release.json')));
  assert.match(release.releaseTarget.sha, sha);
  const manifest = { version: 1, source: release.releaseTarget.sha,
    files: payload(directory, ['site-manifest.json']) };
  writeFileSync(join(directory, 'site-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function verifySite(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'site-manifest.json')));
  assert.equal(manifest.version, 1);
  assert.match(manifest.source, sha);
  assert.deepEqual(payload(directory, ['site-manifest.json']), manifest.files, 'Published bytes changed');
  assert.equal(JSON.parse(readFileSync(join(directory, 'ci-release.json'))).releaseTarget.sha, manifest.source);
  return manifest;
}
export function extractPagesTar(archive, destination) {
  execFileSync('python3', ['-c', `import pathlib,sys,tarfile
root=pathlib.Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1]) as t:
 entries=t.getmembers()
 assert len(entries)<=10000 and sum(e.size for e in entries)<=1024*1024*1024, 'Oversized Pages archive'
 for e in entries:
  p=(root/e.name).resolve()
  assert p.is_relative_to(root) and (e.isfile() or e.isdir()), 'Unsafe Pages entry'
 t.extractall(root,filter='data')`, archive, destination]);
}
export async function restoreSite({ repository, directory, runId, skipId, mode, previous = false, api, download,
  readLog = path => execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }) }) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.ok(['rollback', 'lab', 'preserve-lab', 'checkpoint'].includes(mode));
  const prefix = `repos/${repository}`, repo = await api(prefix);
  let runs;
  if (mode === 'rollback') {
    assert.match(String(runId), /^[1-9][0-9]*$/);
    runs = [await api(`${prefix}/actions/runs/${runId}`)];
  } else {
    // Include in-progress runs: publication may have succeeded before a cancelled
    // postcheck. Serialization ensures this run is the only writer now.
    runs = await publicationRuns(api, prefix);
  }
  assert.ok(Array.isArray(runs));
  const jobs = new Map(), attempts = [];
  const key = run => `${run.id}/${run.run_attempt}`;
  for (const listed of runs) {
    if (String(listed.id) === String(skipId) || listed.path !== '.github/workflows/deploy.yml' || listed.head_branch !== 'main') continue;
    assert.equal(listed.repository.id, repo.id);
    assert.equal(listed.head_repository.id, repo.id);
    assert.ok(Number.isSafeInteger(listed.run_attempt) && listed.run_attempt > 0 && listed.run_attempt <= 100);
    // Inspect every attempt: a later failed retry must not hide an earlier
    // successful deployment, and an old run may have published most recently.
    for (let attempt = 1; attempt <= listed.run_attempt; attempt++) {
      const run = attempt === listed.run_attempt ? listed : await api(`${prefix}/actions/runs/${listed.id}/attempts/${attempt}`);
      assert.equal(run.id, listed.id); assert.equal(run.run_attempt, attempt); assert.equal(run.head_sha, listed.head_sha);
      const response = await api(`${prefix}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`);
      assert.equal(response.total_count, response.jobs.length, 'Truncated publication jobs');
      attempts.push(run); jobs.set(key(run), response.jobs);
    }
  }
  const run = selectPublishedRun(attempts, r => jobs.get(key(r)), { rollback: ['rollback', 'checkpoint'].includes(mode), skipId });
  const artifacts = await runArtifacts(api, `${prefix}/actions/runs/${run.id}/artifacts`);
  const matches = artifacts.filter(a => a.name === (previous ? 'previous-site' : 'github-pages') && !a.expired);
  assert.equal(matches.length, 1, 'Missing/ambiguous retained Pages archive; no rebuild fallback');
  const artifact = matches[0];
  assert.equal(artifact.workflow_run.id, run.id);
  assert.equal(artifact.workflow_run.head_sha, run.head_sha);
  assert.equal(artifact.workflow_run.repository_id, repo.id);
  assert.equal(artifact.workflow_run.head_repository_id, repo.id);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  const created = Date.parse(artifact.created_at), runCreated = Date.parse(run.created_at);
  assert.ok(Number.isFinite(created) && Number.isFinite(runCreated) && created >= runCreated && created <= run.publicationStartedAt,
    'Archive was not available to the selected published attempt; no newer unpublished replacement is allowed');
  if (!previous) {
    assert.ok(Number.isSafeInteger(run.publicationJob) && run.publicationJob > 0);
    const consumed = consumedPagesArtifact(await readLog(`${prefix}/actions/jobs/${run.publicationJob}/logs`), run);
    assert.equal(artifact.id, consumed, 'Retained archive differs from the artifact actually published');
  }
  const scratch = mkdtempSync(join(tmpdir(), 'pages-restore-'));
  try {
    const zip = join(scratch, 'pages.zip'), unpacked = join(scratch, 'archive'), site = join(scratch, 'site');
    await download(`${prefix}/actions/artifacts/${artifact.id}/zip`, zip);
    assert.equal('sha256:' + createHash('sha256').update(readFileSync(zip)).digest('hex'), artifact.digest);
    extractBuildArchive(zip, unpacked);
    let manifest, origin, originalRun;
    if (previous) {
      assert.equal(mode, 'rollback');
      origin = JSON.parse(readFileSync(join(unpacked, 'origin.json')));
      assert.equal(origin.repository, repository);
      assert.match(String(origin.run), /^[1-9][0-9]*$/);
      assert.ok(Number.isSafeInteger(origin.attempt) && origin.attempt > 0);
      originalRun = await api(`${prefix}/actions/runs/${origin.run}/attempts/${origin.attempt}`);
      assert.equal(originalRun.run_attempt, origin.attempt);
      assert.equal(originalRun.repository.id, repo.id);
      assert.equal(originalRun.head_repository.id, repo.id);
      const originalJobs = await api(`${prefix}/actions/runs/${origin.run}/attempts/${originalRun.run_attempt}/jobs?per_page=100`);
      assert.equal(originalJobs.total_count, originalJobs.jobs.length);
      selectPublishedRun([originalRun], () => originalJobs.jobs, { rollback: true });
      cpSync(join(unpacked, 'site'), site, { recursive: true });
      assert.deepEqual(payload(site, []), origin.files, 'Previous-site checkpoint bytes differ');
    } else {
      mkdirSync(site);
      extractPagesTar(join(unpacked, 'artifact.tar'), site);
    }
    if (existsSync(join(site, 'site-manifest.json'))) manifest = verifySite(site);
    else if (mode !== 'preserve-lab') {
      // Existing pre-policy main archives are authenticated by GitHub's archive
      // digest and successful deployment, with their original release receipt.
      const release = JSON.parse(readFileSync(join(site, 'ci-release.json')));
      assert.match(release.releaseTarget.sha, sha);
      assert.match(release.buildOrigin.sha, sha);
      assert.equal(readFileSync(join(site, 'ci-source.txt'), 'utf8').trim(), release.buildOrigin.sha);
      const owner = previous ? originalRun : run;
      assert.equal(owner.event, 'push', 'Legacy Lab archive has no authenticated game source');
      assert.equal(release.releaseTarget.sha, owner.head_sha);
      manifest = { source: release.releaseTarget.sha };
    }
    const lab = join(site, 'lab');
    assert.match(JSON.parse(readFileSync(join(lab, 'lab-source.json'))).sha, sha);
    assert.ok(existsSync(join(lab, 'index.html')));
    assert.ok(!existsSync(directory), 'Destination already exists');
    if (mode === 'checkpoint') {
      cpSync(site, join(directory, 'site'), { recursive: true });
      writeFileSync(join(directory, 'origin.json'), JSON.stringify({ repository, run: run.id, attempt: run.run_attempt, source: manifest.source,
        digest: artifact.digest, files: payload(site, []) }, null, 2));
    } else cpSync(mode === 'preserve-lab' ? lab : site, directory, { recursive: true });
    // External receipt lets a legacy rollback retain every original site byte,
    // including the absence of new metadata. Never relabel or reseal a rollback.
    if (mode === 'rollback' || mode === 'lab') writeFileSync('restored-site.json', JSON.stringify({ source: manifest.source, files: payload(site, []) }));
    return { source: manifest?.source, run: run.id, attempt: run.run_attempt, artifact: artifact.id, digest: artifact.digest, previous };

  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === 'seal') sealSite();
  else if (mode === 'verify') {
    if (existsSync('dist/site-manifest.json')) verifySite('dist');
    else {
      const restored = JSON.parse(readFileSync('restored-site.json'));
      assert.match(restored.source, sha);
      assert.deepEqual(payload('dist', []), restored.files);
    }
  }
  else {
    const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
    const download = (path, destination) => {
      const fd = openSync(destination, 'w');
      try { assert.equal(spawnSync('gh', ['api', path], { stdio: ['ignore', fd, 'pipe'] }).status, 0); }
      finally { closeSync(fd); }
    };
    const result = await restoreSite({ repository: process.env.GITHUB_REPOSITORY, directory: mode === 'checkpoint' ? 'previous-site' : mode === 'preserve-lab' ? 'lab-out' : 'dist',
      runId: process.env.ROLLBACK_RUN, previous: process.env.ROLLBACK_PREVIOUS === 'true', skipId: process.env.GITHUB_RUN_ID, mode, api, download });
    if (process.env.GITHUB_OUTPUT && result.source) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${result.source}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Restored exact Pages bytes: ${JSON.stringify(result)}\n`);
  }
}
