// Narrow reuse: only prose followups with unchanged runtime, tests and policy.
// No relabelled build: record the original successful run/source explicitly.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBuild } from './ci-build-manifest.mjs';
import { extractBuildArchive, runArtifacts, validateCoverage, verifyCiContext } from './ci-release-evidence.mjs';
import { gitEquipmentImpacts } from './ci-equipment-impact.mjs';
const SHA = /^[a-f0-9]{40}$/;
export const proseOnly = paths => paths.length > 0 && paths.every(path =>
  /^(?:README|AGENTS|CLAUDE)\.md$/.test(path) || /^docs\/.+\.md$/.test(path));
export async function resolveDocFollowup({ event, environment, api, download, git, log = console.log }) {
  const pr = event.pull_request, repository = environment.GITHUB_REPOSITORY;
  if (environment.GITHUB_EVENT_NAME !== 'pull_request' || event.action !== 'synchronize' ||
      !SHA.test(event.before || '') || !pr || pr.head.repo.id !== pr.base.repo.id) return null;
  const paths = (base, head) => git('diff', '--name-only', '-z', '--no-renames', base, head).split('\0').filter(Boolean);
  const scratch = mkdtempSync(join(tmpdir(), 'ci-prose-'));
  try {
    assert.equal(pr.head.repo.full_name, repository);
    assert.ok(proseOnly(paths(event.before, pr.head.sha)));
    const merge = environment.GITHUB_SHA;
    assert.deepEqual(git('show', '-s', '--format=%P', merge).trim().split(' '), [pr.base.sha, pr.head.sha]);
    const workflow = await api(`repos/${repository}/actions/workflows/ci.yml`);
    const list = await api(`repos/${repository}/actions/workflows/${workflow.id}/runs?event=pull_request&branch=${encodeURIComponent(pr.head.ref)}&per_page=100`);
    for (const run of list.workflow_runs) {
      if (String(run.id) === String(environment.GITHUB_RUN_ID)) continue;
      assert.equal(run.status, 'completed'); assert.equal(run.conclusion, 'success');
      assert.equal(run.path, '.github/workflows/ci.yml'); assert.equal(run.workflow_id, workflow.id);
      assert.equal(run.event, 'pull_request'); assert.equal(run.head_branch, pr.head.ref);
      assert.equal(run.repository.id, pr.base.repo.id); assert.equal(run.head_repository.id, pr.head.repo.id);
      assert.ok(run.pull_requests.some(item => item.number === event.number));
      assert.match(run.head_sha, SHA);
      git('merge-base', '--is-ancestor', run.head_sha, pr.head.sha);
      // Include merge drift: a new base containing runtime changes cannot reuse.
      assert.ok(proseOnly(paths(run.head_sha, pr.head.sha)));
      assert.ok(paths(run.head_sha, merge).every(path => proseOnly([path])));
      const artifacts = await runArtifacts(api, `repos/${repository}/actions/runs/${run.id}/artifacts`);
      const name = `ci-dist-${run.head_sha}-${run.id}-${run.run_attempt}`;
      const matches = artifacts.filter(a => a.name === name);
      if (!matches.length) continue; // Successful earlier prose-only receipt; seek its original build.
      assert.equal(matches.length, 1);
      const artifact = matches[0];
      assert.equal(artifact.expired, false); assert.equal(artifact.workflow_run.id, run.id);
      assert.equal(artifact.workflow_run.head_sha, run.head_sha);
      assert.equal(artifact.workflow_run.repository_id, pr.base.repo.id);
      assert.equal(artifact.workflow_run.head_repository_id, pr.head.repo.id);
      const archive = join(scratch, 'build.zip'), directory = join(scratch, 'build');
      await download(`repos/${repository}/actions/artifacts/${artifact.id}/zip`, archive);
      assert.equal('sha256:' + createHash('sha256').update(readFileSync(archive)).digest('hex'), artifact.digest);
      extractBuildArchive(archive, directory);
      const tree = git('rev-parse', `${run.head_sha}^{tree}`).trim();
      verifyBuild(directory, { source: run.head_sha, tree });
      const context = JSON.parse(readFileSync(join(directory, 'ci-context.json')));
      const evidence = { source: run.head_sha, tree, runId: run.id, attempt: run.run_attempt };
      verifyCiContext(context, evidence, { number: event.number }, repository, pr.base.repo.id);
      assert.deepEqual(git('show', '-s', '--format=%P', context.workflowSha).trim().split(' '), [context.pr.base.sha, run.head_sha]);
      assert.equal(git('rev-parse', `${context.workflowSha}:.github/workflows/ci.yml`).trim(),
        git('rev-parse', `${run.head_sha}:.github/workflows/ci.yml`).trim());
      const files = paths(context.pr.base.sha, run.head_sha);
      const jobs = await api(`repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      assert.equal(jobs.total_count, jobs.jobs.length);
      const covered = validateCoverage({ jobs: jobs.jobs, run, files, impacts: gitEquipmentImpacts(files, context.pr.base.sha, run.head_sha) }, evidence);
      verifyCiContext(context, covered, { number: event.number }, repository, pr.base.repo.id);
      return { ...evidence, target: pr.head.sha, merge, artifact: artifact.id, suites: covered.plan.suites };
    }
    return null;
  } catch (error) { log(`Prose evidence unavailable; run affected checks: ${error.message}`); return null; }
  finally { rmSync(scratch, { recursive: true, force: true }); }
}
export async function docFollowup(event, environment = process.env) {
  const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  const download = (path, destination) => {
    const fd = openSync(destination, 'w');
    try { assert.equal(spawnSync('gh', ['api', path], { stdio: ['ignore', fd, 'pipe'] }).status, 0); }
    finally { closeSync(fd); }
  };
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  return resolveDocFollowup({ event, environment, api, download, git });
}
