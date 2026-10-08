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
  for (const run of runs) {
    if (String(run.id) === String(skipId) || run.path !== '.github/workflows/deploy.yml' ||
        run.head_branch !== 'main' || !['push', 'workflow_dispatch', 'workflow_run'].includes(run.event)) continue;
    const job = jobsByRun(run).find(job => job.name === 'deploy' && job.run_attempt === run.run_attempt &&
      job.steps?.some(step => step.name === 'Run actions/deploy-pages@v4' && step.conclusion === 'success'));
    // The live check is part of deploy. A red postrelease run is visible and is
    // not a successful rollback candidate, though it is the site to preserve.
    if (job && (!rollback || (run.conclusion === 'success' && job.conclusion === 'success'))) return run;
  }
  throw Error('No eligible retained Pages publication; select a successful main release run.');
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
export async function restoreSite({ repository, directory, runId, skipId, mode, previous = false, api, download }) {
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
    runs = (await api(`${prefix}/actions/workflows/deploy.yml/runs?per_page=100`)).workflow_runs;
  }
  assert.ok(Array.isArray(runs));
  const jobs = new Map();
  for (const run of runs) {
    if (String(run.id) === String(skipId)) continue;
    assert.equal(run.repository.id, repo.id);
    assert.equal(run.head_repository.id, repo.id);
    const response = await api(`${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    assert.equal(response.total_count, response.jobs.length, 'Truncated publication jobs');
    jobs.set(run.id, response.jobs);
    // API lists newest first; do not accidentally fall back past a deployed site.
    try { selectPublishedRun([run], r => jobs.get(r.id), { rollback: ['rollback', 'checkpoint'].includes(mode), skipId }); break; } catch {}
  }
  const run = selectPublishedRun(runs.filter(r => jobs.has(r.id)), r => jobs.get(r.id), { rollback: ['rollback', 'checkpoint'].includes(mode), skipId });
  const artifacts = await runArtifacts(api, `${prefix}/actions/runs/${run.id}/artifacts`);
  const matches = artifacts.filter(a => a.name === (previous ? 'previous-site' : 'github-pages') && !a.expired);
  assert.equal(matches.length, 1, 'Missing/ambiguous retained Pages archive; no rebuild fallback');
  const artifact = matches[0];
  assert.equal(artifact.workflow_run.id, run.id);
  assert.equal(artifact.workflow_run.head_sha, run.head_sha);
  assert.equal(artifact.workflow_run.repository_id, repo.id);
  assert.equal(artifact.workflow_run.head_repository_id, repo.id);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  const scratch = mkdtempSync(join(tmpdir(), 'pages-restore-'));
  try {
    const zip = join(scratch, 'pages.zip'), unpacked = join(scratch, 'archive'), site = join(scratch, 'site');
    await download(`${prefix}/actions/artifacts/${artifact.id}/zip`, zip);
    assert.equal('sha256:' + createHash('sha256').update(readFileSync(zip)).digest('hex'), artifact.digest);
    extractBuildArchive(zip, unpacked);
    let manifest, origin;
    if (previous) {
      assert.equal(mode, 'rollback');
      origin = JSON.parse(readFileSync(join(unpacked, 'origin.json')));
      assert.equal(origin.repository, repository);
      assert.match(String(origin.run), /^[1-9][0-9]*$/);
      const originalRun = await api(`${prefix}/actions/runs/${origin.run}`);
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
      const owner = previous ? await api(`${prefix}/actions/runs/${origin.run}`) : run;
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
      writeFileSync(join(directory, 'origin.json'), JSON.stringify({ repository, run: run.id, source: manifest.source,
        digest: artifact.digest, files: payload(site, []) }, null, 2));
    } else cpSync(mode === 'preserve-lab' ? lab : site, directory, { recursive: true });
    // External receipt lets a legacy rollback retain every original site byte,
    // including the absence of new metadata. Never relabel or reseal a rollback.
    if (mode === 'rollback' || mode === 'lab') writeFileSync('restored-site.json', JSON.stringify({ source: manifest.source, files: payload(site, []) }));
    return { source: manifest?.source, run: run.id, artifact: artifact.id, digest: artifact.digest, previous };

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
