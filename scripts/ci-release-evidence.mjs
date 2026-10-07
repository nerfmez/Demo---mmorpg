// Reuse only a complete, successful same-repository PR CI at an identical tree.
// Any missing/invalid evidence, including download failure, selects normal CI.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validationPlan } from './ci-browser-plan.mjs';

const SHA = /^[a-f0-9]{40}$/;
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const successfulSteps = (job, names) => names.every(name => job.steps?.some(step => step.name === name && step.conclusion === 'success'));

function validateIdentity({ repository, repositoryId, target, targetTree, pr, sourceTree, workflow, run, artifact }) {
  requireThat(SHA.test(target) && SHA.test(targetTree), 'Invalid release identity');
  requireThat(pr.merged_at && pr.merge_commit_sha === target && pr.base?.ref === 'main' &&
    pr.base.repo?.full_name === repository && pr.head?.repo?.full_name === repository &&
    pr.base.repo.id === repositoryId && pr.head.repo.id === repositoryId, 'Not this same-repository merged PR');
  const source = pr.head.sha;
  requireThat(SHA.test(source) && sourceTree === targetTree, 'Tested tree differs from release tree');
  requireThat(workflow.path === '.github/workflows/ci.yml' && run.workflow_id === workflow.id &&
    run.path === workflow.path && run.event === 'pull_request' && run.head_sha === source &&
    run.repository?.id === repositoryId && run.head_repository?.id === repositoryId &&
    run.status === 'completed' && run.conclusion === 'success' && Number.isSafeInteger(run.id) &&
    Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0, 'CI run is not a trusted successful attempt');
  const artifactName = `ci-dist-${source}-${run.id}-${run.run_attempt}`;
  requireThat(artifact?.name === artifactName && Number.isSafeInteger(artifact.id) && artifact.expired === false &&
    artifact.size_in_bytes > 0 && /^sha256:[a-f0-9]{64}$/.test(artifact.digest) &&
    artifact.workflow_run?.id === run.id && artifact.workflow_run.head_sha === source &&
    artifact.workflow_run.repository_id === repositoryId && artifact.workflow_run.head_repository_id === repositoryId,
  'Missing immutable source/run/attempt build artifact');
  return { version: 2, source, tree: targetTree, target, runId: run.id, attempt: run.run_attempt,
    artifactId: artifact.id, artifactName, digest: artifact.digest };
}

// `files` comes from GitHub-owned base/head trees, NEVER from the downloaded
// artifact's claims. Recompute with the exact release tree's routing policy.
export function validateEvidence(input) {
  const evidence = validateIdentity(input), { jobs, run, files } = input;
  requireThat(Array.isArray(files) && files.every(file => typeof file === 'string'), 'Missing authoritative changed paths');
  const plan = validationPlan(files);
  requireThat(plan.suites.includes('boot'), 'Release reuse requires real boot/save/reload/Continue');
  const expected = ['Build, core and CI tools', 'test (chromium)', 'test (webkit)',
    ...['chromium', 'webkit'].flatMap(browser => plan.suites.map(suite => `Quick affected (${browser}, ${suite})`))];
  requireThat(jobs.length === expected.length && new Set(jobs.map(job => job.name)).size === expected.length, 'Incomplete or ambiguous CI coverage');
  for (const name of expected) {
    const job = jobs.find(job => job.name === name);
    requireThat(job?.conclusion === 'success' && job.status === 'completed' && job.run_id === run.id &&
      job.run_attempt === run.run_attempt, `Missing successful current-attempt job: ${name}`);
    const steps = name === 'Build, core and CI tools'
      ? ['Run npm run test:tools', 'Run npm test', 'Run npm run build', 'Bind CI event and workflow to build', 'Bind build to the tested source', 'Run actions/upload-artifact@v4']
      : name.startsWith('test (') ? ['Verify complete selected browser evidence', 'Report gate outcome at exact source']
      : ['Verify downloaded build source', 'Run complete selected shard with timings', 'Upload selected browser report', 'Run actions/upload-artifact@v4'];
    requireThat(successfulSteps(job, steps), `Incomplete mandatory steps: ${name}`);
  }
  return { ...evidence, plan };
}

export function verifyExtractedBuild(directory, evidence) {
  requireThat(readFileSync(join(directory, 'ci-source.txt'), 'utf8').trim() === evidence.source, 'Artifact source marker differs');
  requireThat(readFileSync(join(directory, 'index.html')).length > 0, 'Artifact has no built entrypoint');
}

export function ciContext({ environment, event, source, tree, files = [] }) {
  const pr = event.pull_request;
  return { version: 2, source, tree, plan: validationPlan(files, { full: environment.GITHUB_EVENT_NAME !== 'pull_request' }), repository: environment.GITHUB_REPOSITORY,
    runId: Number(environment.GITHUB_RUN_ID), attempt: Number(environment.GITHUB_RUN_ATTEMPT),
    eventName: environment.GITHUB_EVENT_NAME, workflowRef: environment.GITHUB_WORKFLOW_REF,
    workflowSha: environment.GITHUB_WORKFLOW_SHA,
    pr: pr ? { number: event.number, base: { ref: pr.base.ref, sha: pr.base.sha, repositoryId: pr.base.repo.id },
      head: { sha: pr.head.sha, repositoryId: pr.head.repo.id } } : null };
}

export function verifyCiContext(context, evidence, pr, repository, repositoryId) {
  requireThat(context.version === 2 && context.source === evidence.source && context.tree === evidence.tree &&
    context.runId === evidence.runId && context.attempt === evidence.attempt && context.repository === repository &&
    context.eventName === 'pull_request' && context.pr?.number === pr.number && context.pr.base.ref === 'main' &&
    context.pr.base.repositoryId === repositoryId && context.pr.head.repositoryId === repositoryId &&
    context.pr.head.sha === evidence.source && SHA.test(context.pr.base.sha) && SHA.test(context.workflowSha) &&
    context.workflowRef === `${repository}/.github/workflows/ci.yml@refs/pull/${pr.number}/merge`,
  'CI event/workflow receipt does not certify this merged main PR');
  if (evidence.plan) requireThat(JSON.stringify(context.plan) === JSON.stringify(evidence.plan),
    'Artifact plan differs from authoritative diff/routing policy');
}

export function changedTreePaths(base, head) {
  requireThat(base.truncated === false && head.truncated === false && Array.isArray(base.tree) && Array.isArray(head.tree),
    'Missing/truncated authoritative source trees');
  const entries = tree => new Map(tree.tree.filter(entry => entry.type !== 'tree').map(entry => {
    requireThat(typeof entry.path === 'string' && SHA.test(entry.sha) && typeof entry.mode === 'string', 'Invalid tree entry');
    return [entry.path, `${entry.mode}:${entry.type}:${entry.sha}`];
  }));
  const before = entries(base), after = entries(head);
  return [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path)).sort();
}

export function verifyPrAssociation(run, pr, branchPrs, timeline, repositoryId) {
  requireThat(run.head_branch === pr.head.ref && run.head_repository?.id === repositoryId &&
    Date.parse(run.created_at) >= Date.parse(pr.created_at) && Date.parse(run.created_at) <= Date.parse(pr.merged_at),
  'CI run is outside this PR branch/lifetime');
  requireThat(Array.isArray(branchPrs) && branchPrs.length === 1 && branchPrs[0].number === pr.number &&
    branchPrs[0].base?.ref === 'main' && branchPrs[0].head?.repo?.id === repositoryId,
  'Branch has ambiguous originating PRs');
  requireThat(Array.isArray(timeline) && timeline.length < 100 && !timeline.some(event => ['base_ref_changed', 'automatic_base_change_succeeded'].includes(event.event)),
    'Missing/truncated or retargeted PR history');
  // GitHub may omit closed PRs from run.pull_requests. Unique all-state branch
  // history plus a never-retargeted main PR provides the authoritative fallback.
  requireThat(!run.pull_requests?.length || run.pull_requests.some(item => item.number === pr.number),
    'CI belongs to another PR');
}

export async function resolveRelease({ repository, target, eventName, ref, api, download, extract, directory, log = console.log }) {
  if (eventName !== 'push' || ref !== 'refs/heads/main') return null;
  const scratch = mkdtempSync(join(tmpdir(), 'ci-release-evidence-'));
  try {
    requireThat(/^[\w.-]+\/[\w.-]+$/.test(repository) && SHA.test(target), 'Invalid repository/source');
    const prefix = `repos/${repository}`;
    const repo = await api(prefix);
    const targetCommit = await api(`${prefix}/git/commits/${target}`);
    const prs = await api(`${prefix}/commits/${target}/pulls?per_page=100`);
    requireThat(prs.length < 100, 'Possibly truncated merged-PR evidence');
    const candidates = prs.filter(pr => pr.merge_commit_sha === target && pr.merged_at && pr.head?.repo?.id === repo.id);
    requireThat(candidates.length === 1, 'No unique same-repository merged PR');
    const pr = await api(`${prefix}/pulls/${candidates[0].number}`);
    const sourceCommit = await api(`${prefix}/git/commits/${pr.head.sha}`);
    requireThat(sourceCommit.tree.sha === targetCommit.tree.sha, 'No identical tested source tree');
    const workflow = await api(`${prefix}/actions/workflows/ci.yml`);
    const list = await api(`${prefix}/actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`);
    // Never reach past a newer failed/cancelled/incomplete run to an older pass.
    const candidate = list.workflow_runs.find(run => run.head_sha === pr.head.sha);
    requireThat(candidate?.conclusion === 'success' && candidate.status === 'completed', 'Latest CI run for PR source is not successful');
    const run = await api(`${prefix}/actions/runs/${candidate.id}`);
    const branchPrs = await api(`${prefix}/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + pr.head.ref)}&per_page=100`);
    const timeline = await api(`${prefix}/issues/${pr.number}/timeline?per_page=100`);
    verifyPrAssociation(run, pr, branchPrs, timeline, repo.id);
    const jobs = await api(`${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    requireThat(jobs.total_count === jobs.jobs.length, 'Truncated CI jobs');
    const artifacts = await api(`${prefix}/actions/runs/${run.id}/artifacts?per_page=100`);
    requireThat(artifacts.total_count === artifacts.artifacts.length, 'Truncated build artifacts');
    const matching = artifacts.artifacts.filter(artifact => artifact.name === `ci-dist-${pr.head.sha}-${run.id}-${run.run_attempt}`);
    requireThat(matching.length === 1, 'Missing or ambiguous build artifact');
    const identity = { repository, repositoryId: repo.id, target, targetTree: targetCommit.tree.sha,
      pr, sourceTree: sourceCommit.tree.sha, workflow, run, jobs: jobs.jobs, artifact: matching[0] };
    let evidence = validateIdentity(identity);
    const archive = join(scratch, 'dist.zip'), extracted = join(scratch, 'dist');
    await download(`${prefix}/actions/artifacts/${evidence.artifactId}/zip`, archive);
    const digest = `sha256:${createHash('sha256').update(readFileSync(archive)).digest('hex')}`;
    requireThat(digest === evidence.digest, 'Downloaded build digest differs');
    await extract(archive, extracted);
    verifyExtractedBuild(extracted, evidence);
    const context = JSON.parse(readFileSync(join(extracted, 'ci-context.json'), 'utf8'));
    verifyCiContext(context, evidence, pr, repository, repo.id);
    // The receipt names the executed merge revision, but GitHub owns its parents.
    // Bind its base/head before reading the two trees that reproduce git diff
    // --no-renames BASE HEAD, including deletions, renames and mode changes.
    const executedCommit = await api(`${prefix}/git/commits/${context.workflowSha}`);
    requireThat(executedCommit.parents?.length === 2 && executedCommit.parents[0].sha === context.pr.base.sha &&
      executedCommit.parents[1].sha === evidence.source, 'Executed PR revision does not bind this base/head');
    const baseCommit = await api(`${prefix}/git/commits/${executedCommit.parents[0].sha}`);
    requireThat(SHA.test(baseCommit.tree?.sha), 'Invalid CI base tree');
    const baseTree = await api(`${prefix}/git/trees/${baseCommit.tree.sha}?recursive=1`);
    const headTree = await api(`${prefix}/git/trees/${sourceCommit.tree.sha}?recursive=1`);
    const files = changedTreePaths(baseTree, headTree);
    evidence = validateEvidence({ ...identity, files });
    verifyCiContext(context, evidence, pr, repository, repo.id);
    // PR workflows execute their event-ref configuration, while checkout tests
    // the explicit head. Both workflow blobs must match before reusing the build.
    const sourceWorkflow = await api(`${prefix}/contents/.github/workflows/ci.yml?ref=${evidence.source}`);
    const executedWorkflow = await api(`${prefix}/contents/.github/workflows/ci.yml?ref=${context.workflowSha}`);
    requireThat(SHA.test(sourceWorkflow.sha) && sourceWorkflow.sha === executedWorkflow.sha,
      'Executed PR workflow configuration differs from release source');
    evidence.workflowSha = context.workflowSha;
    evidence.workflowBlob = sourceWorkflow.sha;
    evidence.prNumber = pr.number;
    writeFileSync(join(extracted, 'ci-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    cpSync(extracted, directory, { recursive: true });
    log(`Verified same-tree affected CI ${evidence.runId}/${evidence.attempt}: suites=${evidence.plan.suites.join(',')}; build ${evidence.source}; release ${evidence.target}; tree ${evidence.tree}; full postmerge regression remains separate`);
    return evidence; // Never expose reuse=true before archive and marker validation.
  } catch (error) {
    log(`Use normal release CI: ${error.message}`);
    return null;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function verifyReleaseBuild({ directory, source, target, tree = '', evidenceRun = '' }) {
  requireThat(SHA.test(source) && SHA.test(target), 'Invalid build/release SHA');
  requireThat(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === target, 'Release checkout differs');
  const actualTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  verifyExtractedBuild(directory, { source });
  let receipt = null;
  if (evidenceRun) {
    receipt = JSON.parse(readFileSync(join(directory, 'ci-evidence.json'), 'utf8'));
    requireThat(SHA.test(tree) && tree === actualTree && receipt.source === source && receipt.target === target &&
      receipt.tree === tree && String(receipt.runId) === evidenceRun, 'Reused build provenance differs');
  } else requireThat(source === target, 'Cross-SHA build requires verified evidence');
  const provenance = { version: 1, buildOrigin: { sha: source, tree: actualTree }, releaseTarget: { sha: target, tree: actualTree }, evidence: receipt };
  writeFileSync(join(directory, 'ci-release.json'), JSON.stringify(provenance, null, 2) + '\n');
  return provenance;
}

export const extractBuildArchive = (archive, destination) => execFileSync('python3', ['-c',
      'import pathlib,stat,sys,zipfile\nroot=pathlib.Path(sys.argv[2]).resolve()\nwith zipfile.ZipFile(sys.argv[1]) as z:\n entries=z.infolist()\n assert len(entries)<=5000 and sum(e.file_size for e in entries)<=500*1024*1024, "Oversized build archive"\n for e in entries:\n  p=(root/e.filename).resolve()\n  assert p.is_relative_to(root) and not stat.S_ISLNK(e.external_attr>>16), "Unsafe archive entry"\n z.extractall(root)', archive, destination]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--write-context') {
    const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    requireThat(source === process.env.CI_SOURCE_SHA, 'Context source differs from CI checkout');
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const files = event.pull_request ? execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', event.pull_request.base.sha, source],
      { encoding: 'utf8' }).split('\0').filter(Boolean) : [];
    const context = ciContext({ environment: process.env, event, files,
      source, tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim() });
    writeFileSync('dist/ci-context.json', JSON.stringify(context, null, 2) + '\n');
    console.log(`CI context: ${context.eventName}; PR ${context.pr?.number || 'none'}; workflow ${context.workflowRef}; workflow source ${context.workflowSha}`);
  } else if (process.argv[2] === '--verify-build') {
    verifyReleaseBuild({ directory: 'dist', source: process.env.BUILD_ORIGIN, target: process.env.RELEASE_TARGET,
      tree: process.env.RELEASE_TREE, evidenceRun: process.env.EVIDENCE_RUN });
  } else {
    const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
    const download = (path, destination) => {
      const fd = openSync(destination, 'w');
      try {
        const result = spawnSync('gh', ['api', path], { stdio: ['ignore', fd, 'pipe'] });
        requireThat(result.status === 0, 'Build artifact download failed');
      } finally { closeSync(fd); }
    };
    const evidence = await resolveRelease({ repository: process.env.GITHUB_REPOSITORY, target: process.env.GITHUB_SHA,
      eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, api, download, extract: extractBuildArchive, directory: 'release-dist' });
    const artifact = evidence ? `release-ci-dist-${evidence.target}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}` : '';
    const outputs = { reuse: !!evidence, source: evidence?.source || '', target: evidence?.target || '', tree: evidence?.tree || '',
      run: evidence?.runId || '', artifact };
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      evidence ? `Reused successful affected CI ${evidence.runId}/${evidence.attempt}; suites=${evidence.plan.suites.join(',')}; build origin ${evidence.source}; release target ${evidence.target}; tree ${evidence.tree}. This is not full-regression certification; main full CI runs separately.\n`
        : 'No verified reusable complete CI build; normal release gate remains required.\n');
  }
}
