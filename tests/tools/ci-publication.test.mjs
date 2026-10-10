import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { payload, buildConfiguration, verifyBuild } from '../../scripts/ci-build-manifest.mjs';
import { sealSite, verifySite, restoreSite, selectPublishedRun, publicationRuns, consumedPagesArtifact, extractPagesTar, readPublicationLog } from '../../scripts/ci-published-site.mjs';
import { browserPlan, FULL_SUITES, SAFETY_SUITES } from '../../scripts/ci-browser-plan.mjs';
import { browserShards } from '../../scripts/ci-browser-shards.mjs';
import { proseOnly, resolveDocFollowup } from '../../scripts/ci-doc-followup.mjs';
const sha = 'a'.repeat(40), tree = 'b'.repeat(40);
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml'), deploy = read('.github/workflows/deploy.yml');
test('publication log reader captures ANSI bytes with modern and legacy gh', () => {
  const path = 'repos/owner/demo/actions/jobs/3/logs';
  const log = '\u001b[36;1mcheckout\u001b[0m\nraw authenticated log';
  for (const modern of [true, false]) {
    const calls = [];
    const result = readPublicationLog(path, (command, args, options) => {
      assert.equal(command, 'gh'); assert.equal(options.stdio, 'pipe');
      calls.push(args);
      if (args.includes('--help')) return modern ? '--allow-escape-sequences' : 'legacy help';
      assert.deepEqual(args, ['api', path, ...(modern ? ['--allow-escape-sequences'] : [])]);
      return log;
    });
    assert.equal(result, log); assert.equal(calls.length, 2);
  }
});
test('publication log reader propagates authentication and transport failure', () => {
  const failure = new Error('HTTP 403 \u001b]0;untrusted-title\u0007'); let calls = 0;
  assert.throws(() => readPublicationLog('repos/owner/demo/actions/jobs/3/logs', (_command, args) => {
    calls++;
    if (args.includes('--help')) return '--allow-escape-sequences';
    throw failure;
  }), { message: 'Cannot read authenticated Pages deployment log' });
  assert.equal(calls, 2, 'no retry or unverified receipt fallback');
});
function directory(t) { const dir = mkdtempSync(join(tmpdir(), 'publication-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function put(dir, path, data) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), typeof data === 'string' ? data : JSON.stringify(data)); }
function site(dir, legacy = false) {
  put(dir, 'index.html', '<html>exact game</html>'); put(dir, 'assets/game.js', 'original();');
  put(dir, 'ci-source.txt', sha); put(dir, 'lab/index.html', '<html>exact lab</html>');
  put(dir, 'lab/lab-source.json', { sha }); put(dir, '.nojekyll', '');
  put(dir, 'ci-release.json', { buildOrigin: { sha, tree }, releaseTarget: { sha, tree } });
  if (!legacy) sealSite(dir);
}
const run = (id = 4) => ({ id, path: '.github/workflows/deploy.yml', event: 'push', head_branch: 'main', head_sha: sha,
  run_attempt: 1, created_at: '2026-10-08T10:00:00Z', run_started_at: '2026-10-08T10:00:00Z', status: 'completed', conclusion: 'success', repository: { id: 1 }, head_repository: { id: 1 } });
const jobs = (state = 'success', published = 'success') => [{ id: 42, name: 'deploy', run_attempt: 1, conclusion: state,
  steps: [{ name: 'Run actions/deploy-pages@v4', conclusion: published, started_at: '2026-10-08T10:04:00Z', completed_at: '2026-10-08T10:05:00Z' }] }];

test('bounded routing covers explicit high-risk families and never expands every shared file to full', () => {
  const cases = [
    ['src/core/ai.js', ['combat', 'monster-identity']], ['data/world.json', ['world', 'smoke']],
    ['src/save.js', ['save', 'journal-upgrade']], ['src/core/skills.js', ['save', 'skill-lines']],
    ['data/items.json', ['items', 'weapons', 'monster-identity']], ['src/core/crafting.js', ['equipment-focus', 'items']],
    ['src/ui/new-panel.js', ['menu', 'hud', 'overlays']], ['src/main.js', ['combat', 'smoke', 'menu']],
    ['package-lock.json', ['combat', 'smoke']], ['new-runtime.js', ['combat', 'smoke']],
  ];
  for (const [path, expected] of cases) {
    const plan = browserPlan([path]);
    for (const suite of [...SAFETY_SUITES, ...expected]) assert.ok(plan.suites.includes(suite), `${path}: ${suite}`);
    assert.ok(plan.suites.length <= 8, path);
  }
  assert.deepEqual(browserPlan([], { full: true }).suites, FULL_SUITES);
  assert.match(ci, /Full exploration regression/); assert.match(ci, /frontier-published.mjs/);
  assert.doesNotMatch(deploy, /npm run build|test:dreamloop|frontier-published.mjs/);
});

test('manifest rejects changed payload, marker, source, tree, runtime or build configuration', t => {
  const dir = directory(t); put(dir, 'index.html', '<html>built</html>'); put(dir, 'ci-source.txt', sha);
  const manifest = { version: 1, source: sha, tree, node: '22.16.0', configuration: buildConfiguration(), files: payload(dir) };
  const verify = () => verifyBuild(dir, { source: sha, tree });
  put(dir, 'ci-build.json', manifest); assert.doesNotThrow(verify);
  for (const mutate of [m => m.source = tree, m => m.tree = sha, m => m.node = '24.0.0', m => m.version = 2,
    m => m.configuration['vite.config.js'] = 'bad', m => delete m.files['index.html']]) {
    const changed = structuredClone(manifest); mutate(changed); put(dir, 'ci-build.json', changed); assert.throws(verify);
  }
  put(dir, 'ci-build.json', manifest); put(dir, 'index.html', '<html>unvalidated</html>'); assert.throws(verify);
  put(dir, 'index.html', '<html>built</html>'); put(dir, 'ci-source.txt', tree); assert.throws(verify);
  put(dir, 'ci-source.txt', sha); symlinkSync('/tmp', join(dir, 'link')); assert.throws(verify);
});

test('Pages snapshot seals every site byte including Lab and hidden files', t => {
  const dir = directory(t); site(dir);
  const expected = verifySite(dir); assert.ok(expected.files['.nojekyll']); assert.ok(expected.files['lab/index.html']);
  put(dir, 'lab/index.html', 'different lab'); assert.throws(() => verifySite(dir));
});

test('rollback selection rejects failed live verification, forks by caller, PRs and unpublished attempts', () => {
  const current = run();
  assert.equal(selectPublishedRun([current], () => jobs(), { rollback: true }).id, 4);
  assert.throws(() => selectPublishedRun([current], () => jobs('failure'), { rollback: true }));
  assert.equal(selectPublishedRun([current], () => jobs('failure')).id, 4, 'preserve actual site despite postcheck failure');
  for (const patch of [{ head_branch: 'feature' }, { event: 'pull_request' }, { path: '.github/workflows/ci.yml' }, { conclusion: 'failure' }, { run_attempt: 2 }])
    assert.throws(() => selectPublishedRun([{ ...current, ...patch }], () => jobs(), { rollback: true }));
  assert.throws(() => selectPublishedRun([current], () => jobs('success', 'failure'), { rollback: true }));
  assert.throws(() => selectPublishedRun([current], () => jobs(), { skipId: 4 }));
});

function restoreFixture(t, { legacy = false } = {}) {
  const dir = directory(t), input = join(dir, 'original'), zipped = join(dir, 'pages.zip'); site(input, legacy);
  execFileSync('tar', ['-cf', join(dir, 'artifact.tar'), '-C', input, '.']);
  execFileSync('python3', ['-c', 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w") as z:z.write(sys.argv[2],"artifact.tar")', zipped, join(dir, 'artifact.tar')]);
  const bytes = readFileSync(zipped), candidate = run();
  const artifact = { id: 7, name: 'github-pages', expired: false, created_at: '2026-10-08T10:03:00Z', digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    workflow_run: { id: 4, head_sha: sha, repository_id: 1, head_repository_id: 1 } };
  const responses = {
    'repos/owner/demo': { id: 1 }, 'repos/owner/demo/actions/runs/4': candidate,
    'repos/owner/demo/actions/runs/4/attempts/1': candidate,
    'repos/owner/demo/actions/workflows/deploy.yml/runs?per_page=100': { total_count: 1, workflow_runs: [candidate] },
    'repos/owner/demo/actions/runs/4/attempts/1/jobs?per_page=100': { total_count: 1, jobs: jobs() },
    'repos/owner/demo/actions/runs/4/artifacts?per_page=100': { total_count: 1, artifacts: [artifact] },
  };
  const options = { repository: 'owner/demo', directory: join(dir, 'restored'), runId: '4', mode: 'rollback',
    readLog: async path => { assert.equal(path, 'repos/owner/demo/actions/jobs/42/logs'); return deploymentLog(); },
    api: async path => { assert.ok(path in responses, path); return responses[path]; },
    download: async (path, destination) => { assert.equal(path, 'repos/owner/demo/actions/artifacts/7/zip'); writeFileSync(destination, bytes); } };
  return { dir, input, options, responses, artifact, candidate };
}
for (const legacy of [false, true]) test(`real archive restores identical site without rebuilding (legacy=${legacy})`, async t => {
  const { input, options } = restoreFixture(t, { legacy });
  const result = await restoreSite(options); assert.equal(result.source, sha);
  assert.deepEqual(payload(options.directory, []), payload(input, []));
  t.after(() => rmSync('restored-site.json', { force: true }));
});
for (const kind of ['digest', 'expired', 'wrong source', 'fork', 'failed publish', 'red live check', 'missing artifact', 'wrong run', 'wrong attempt'])
  test(`restore rejects ${kind} without a rebuild fallback`, async t => {
    const { options, artifact, responses, candidate } = restoreFixture(t);
    if (kind === 'digest') artifact.digest = 'sha256:' + '0'.repeat(64);
    if (kind === 'expired') artifact.expired = true;
    if (kind === 'wrong source') artifact.workflow_run.head_sha = tree;
    if (kind === 'fork') candidate.head_repository.id = 2;
    if (kind === 'failed publish') responses['repos/owner/demo/actions/runs/4/attempts/1/jobs?per_page=100'].jobs = jobs('failure', 'failure');
    if (kind === 'red live check') responses['repos/owner/demo/actions/runs/4/attempts/1/jobs?per_page=100'].jobs = jobs('failure');
    if (kind === 'missing artifact') artifact.name = 'other';
    if (kind === 'wrong run') artifact.workflow_run.id = 5;
    if (kind === 'wrong attempt') candidate.run_attempt = 2;
    await assert.rejects(restoreSite(options));
  });

test('checkpoint retains a successful legacy site; rollback previous selects exact authenticated bytes', async t => {
  const { dir, input, options, responses, artifact } = restoreFixture(t, { legacy: true });
  await restoreSite({ ...options, mode: 'checkpoint' });
  assert.deepEqual(payload(join(options.directory, 'site'), []), payload(input, []));
  const checkpoint = join(dir, 'checkpoint.zip');
  execFileSync('python3', ['-c', 'import sys,pathlib,zipfile\nr=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w") as z:\n for p in r.rglob("*"):\n  if p.is_file():z.write(p,p.relative_to(r))', options.directory, checkpoint]);
  const bytes = readFileSync(checkpoint); artifact.name = 'previous-site'; artifact.digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const destination = join(dir, 'rollback');
  const result = await restoreSite({ ...options, directory: destination, previous: true, download: async (_, path) => writeFileSync(path, bytes) });
  assert.equal(result.previous, true); assert.deepEqual(payload(destination, []), payload(input, []));
  t.after(() => rmSync('restored-site.json', { force: true }));
  put(options.directory, 'origin.json', { repository: 'attacker/repo', run: 4 });
  assert.equal(responses['repos/owner/demo/actions/runs/4'].conclusion, 'success');
});

test('tar extractor rejects traversal, symlinks and hardlinks', t => {
  const dir = directory(t);
  for (const kind of ['traversal', 'symlink', 'hardlink']) {
    const tar = join(dir, `${kind}.tar`);
    execFileSync('python3', ['-c', 'import sys,tarfile\nwith tarfile.open(sys.argv[1],"w") as t:\n e=tarfile.TarInfo("../escape" if sys.argv[2]=="traversal" else "link")\n if sys.argv[2]!="traversal":e.type=tarfile.SYMTYPE if sys.argv[2]=="symlink" else tarfile.LNKTYPE;e.linkname="../escape"\n t.addfile(e)', tar, kind]);
    assert.throws(() => extractPagesTar(tar, join(dir, 'out')));
  }
});

test('actual publication DAG blocks PR/branch/failed validation and permits only explicit main rollback', () => {
  const expr = deploy.split('\n  build:\n')[1].match(/^    if: (.+)$/m)[1];
  const evaluate = ({ event = 'push', ref = 'refs/heads/main', rollback = '', validation = 'failure', evidence = 'failure', reuse = 'false', cancelled = false, lab = 'failure', repo = 1 } = {}) => runInNewContext(expr, {
    always: () => true, cancelled: () => cancelled, inputs: { rollback_run: rollback },
    github: { ref, event_name: event, repository_id: '1', event: { workflow_run: { conclusion: lab, head_repository: { id: repo } } } },
    needs: { validate: { result: validation }, evidence: { result: evidence, outputs: { reuse } } },
  });
  assert.equal(evaluate({ validation: 'success', evidence: 'success' }), true);
  assert.equal(evaluate({ validation: 'success', evidence: 'failure' }), false, 'missing checkpoint/baseline blocks publication');
  assert.equal(evaluate({ evidence: 'success', reuse: 'true', validation: 'skipped' }), true);
  for (const validation of ['failure', 'skipped', 'cancelled']) assert.equal(evaluate({ validation }), false);
  assert.equal(evaluate({ event: 'workflow_dispatch', rollback: '4' }), true);
  assert.equal(evaluate({ event: 'workflow_run', lab: 'success', evidence: 'success' }), true);
  assert.equal(evaluate({ event: 'workflow_run', lab: 'success', repo: 2 }), false);
  for (const event of ['pull_request', 'push', 'workflow_dispatch']) {
    assert.equal(evaluate({ event, ref: 'refs/heads/feature', validation: 'success', rollback: '4' }), false);
    assert.equal(evaluate({ event, validation: 'success', cancelled: true }), false);
  }
  assert.doesNotMatch(deploy, /\n  pull_request:|pull_request_target/);
  assert.match(deploy, /cancel-in-progress: false/); assert.match(ci, /group: ci-.*github.run_id/);
  assert.doesNotMatch(ci, /pages: write|id-token: write/);
});

test('prose reuse excludes runtime/config/test/asset edits and refuses missing authoritative evidence', async () => {
  assert.equal(proseOnly(['docs/HANDOFF.md', 'README.md']), true);
  for (const paths of [[], ['docs/icon-assets-manifest.json'], ['src/save.js'], ['tests/tools/new.test.mjs'], ['.github/workflows/ci.yml'], ['docs/a.md', 'src/deleted.js']]) assert.equal(proseOnly(paths), false);
  assert.equal(await resolveDocFollowup({ event: {}, environment: { GITHUB_EVENT_NAME: 'push' }, api: () => { throw Error('unexpected'); } }), null);
});

async function proseFixture(t) {
  const { validationPlan } = await import('../../scripts/ci-browser-plan.mjs');
  const dir = directory(t), original = join(dir, 'build'), archive = join(dir, 'build.zip');
  const before = sha, target = 'c'.repeat(40), merge = 'd'.repeat(40), base = 'e'.repeat(40), workflowSha = 'f'.repeat(40);
  const files = ['src/ui/menu.js'], plan = validationPlan(files), repository = 'owner/demo';
  const context = { version: 2, source: before, tree, plan, repository, runId: 4, attempt: 1,
    eventName: 'pull_request', workflowRef: `${repository}/.github/workflows/ci.yml@refs/pull/9/merge`, workflowSha,
    pr: { number: 9, base: { ref: 'main', sha: base, repositoryId: 1 }, head: { sha: before, repositoryId: 1 } } };
  put(original, 'index.html', '<html>tested</html>'); put(original, 'ci-source.txt', before); put(original, 'ci-context.json', context);
  put(original, 'ci-build.json', { version: 1, source: before, tree, node: '22.16.0', configuration: buildConfiguration(), files: payload(original) });
  execFileSync('python3', ['-c', 'import sys,pathlib,zipfile\nr=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w") as z:\n for p in r.rglob("*"):\n  if p.is_file():z.write(p,p.relative_to(r))', original, archive]);
  const bytes = readFileSync(archive);
  const prior = { ...run(), path: '.github/workflows/ci.yml', workflow_id: 7, event: 'pull_request', head_branch: 'feature', pull_requests: [{ number: 9 }] };
  const job = (name, names) => ({ name, status: 'completed', conclusion: 'success', run_id: 4, run_attempt: 1,
    steps: names.map(name => ({ name, conclusion: 'success' })) });
  const reports = [job('Build, core and CI tools', ['Run npm run test:tools', 'Run npm test', 'Run npm run build', 'Bind CI event and workflow to build', 'Bind build to the tested source', 'Run actions/upload-artifact@v4']),
    ...['chromium', 'webkit'].flatMap(browser => [
      job(`test (${browser})`, ['Verify complete selected browser evidence', 'Report gate outcome at exact source']),
      job(`review (${browser})`, ['Verify shared UI evidence at head or merge tree']),
      job(`field-hud (${browser})`, ['Verify shared HUD evidence at head or merge tree']),
      ...plan.suites.flatMap(browserShards).map(({ shard }) => job(`Quick affected (${browser}, ${shard})`, ['Verify downloaded build source', 'Run complete selected shard with timings', 'Upload selected browser report', 'Run actions/upload-artifact@v4']))])];
  const artifact = { id: 7, name: `ci-dist-${before}-4-1`, expired: false,
    digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), workflow_run: { id: 4, head_sha: before, repository_id: 1, head_repository_id: 1 } };
  const responses = {
    'repos/owner/demo/actions/workflows/ci.yml': { id: 7 },
    'repos/owner/demo/actions/workflows/7/runs?event=pull_request&branch=feature&per_page=100': { workflow_runs: [prior] },
    'repos/owner/demo/actions/runs/4/artifacts?per_page=100': { total_count: 1, artifacts: [artifact] },
    'repos/owner/demo/actions/runs/4/attempts/1/jobs?per_page=100': { total_count: reports.length, jobs: reports },
  };
  const event = { action: 'synchronize', before, number: 9, pull_request: { head: { sha: target, ref: 'feature', repo: { id: 1, full_name: repository } }, base: { sha: base, repo: { id: 1 } } } };
  const options = { event, environment: { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '5', GITHUB_SHA: merge }, log() {},
    api: async path => { assert.ok(path in responses, path); return responses[path]; },
    download: async (_, path) => writeFileSync(path, bytes),
    git: (...args) => {
      if (args[0] === 'diff') return args.at(-2) === base ? files.join('\0') : 'docs/HANDOFF.md\0';
      if (args[0] === 'show') return args.at(-1) === merge ? `${base} ${target}` : `${base} ${before}`;
      if (args[0] === 'merge-base') return '';
      if (args[0] === 'rev-parse') return args[1].endsWith('^{tree}') ? tree : '9'.repeat(40);
      throw Error('Unexpected git command');
    } };
  return { options, prior, reports, artifact, target };
}
test('prose-only followup reuses real prior complete source/config/artifact evidence without relabelling', async t => {
  const { options, target } = await proseFixture(t);
  const evidence = await resolveDocFollowup(options);
  assert.equal(evidence?.source, sha); assert.equal(evidence?.target, target);
  assert.equal(evidence?.runId, 4); assert.deepEqual(evidence?.suites, ['boot', 'menu', 'save']);
});
for (const kind of ['new base runtime drift', 'failed latest run', 'wrong PR', 'fork', 'changed bytes', 'missing save job', 'failed assertion', 'config revision'])
  test(`prose reuse fails closed: ${kind}`, async t => {
    const { options, prior, artifact, reports } = await proseFixture(t);
    if (kind === 'new base runtime drift') { const git = options.git; options.git = (...args) => args[0] === 'diff' && args.at(-1) === options.environment.GITHUB_SHA ? 'src/save.js\0' : git(...args); }
    if (kind === 'failed latest run') prior.conclusion = 'failure';
    if (kind === 'wrong PR') prior.pull_requests = [{ number: 10 }];
    if (kind === 'fork') prior.head_repository.id = 2;
    if (kind === 'changed bytes') artifact.digest = 'sha256:' + '0'.repeat(64);
    if (kind === 'missing save job') reports.find(j => j.name === 'Quick affected (webkit, save)').name = 'other';
    if (kind === 'failed assertion') reports.find(j => j.name === 'Quick affected (webkit, save)').steps[1].conclusion = 'failure';
    if (kind === 'config revision') { const git = options.git; options.git = (...args) => args[0] === 'rev-parse' && args[1].startsWith('f'.repeat(40)) ? '0'.repeat(40) : git(...args); }
    assert.equal(await resolveDocFollowup(options), null);
  });

test('stale PR base is resolved through executed merge parents and proven ancestry, never ignored', async () => {
  const { prExecutionRange } = await import('../../scripts/ci-pr-source.mjs');
  const event = { pull_request: { base: { sha }, head: { sha: tree } } }, merge = 'c'.repeat(40), actual = 'd'.repeat(40);
  const calls = [];
  const git = (...args) => { calls.push(args); return args[0] === 'show' ? `${actual} ${tree}` : ''; };
  assert.deepEqual(prExecutionRange(event, merge, git), { base: actual, head: tree, declaredBase: sha });
  assert.deepEqual(calls[1], ['merge-base', '--is-ancestor', sha, actual]);
  assert.throws(() => prExecutionRange(event, merge, (...args) => args[0] === 'show' ? `${actual} ${sha}` : ''));
  assert.throws(() => prExecutionRange(event, merge, (...args) => { if (args[0] === 'show') return `${actual} ${tree}`; throw Error('unrelated base'); }));
  assert.throws(() => prExecutionRange(event, merge, () => tree));
});

test('older run deployed later wins over creation order for Lab preservation and checkpoint baseline', () => {
  const newer = run(5), olderRollback = { ...run(4), event: 'workflow_dispatch', run_attempt: 2 };
  const olderJobs = jobs(); olderJobs[0].run_attempt = 2; olderJobs[0].steps[0].completed_at = '2026-10-08T11:00:00Z';
  for (const rollback of [false, true]) {
    const selected = selectPublishedRun([newer, olderRollback], r => r.id === 4 ? olderJobs : jobs(), { rollback });
    assert.equal(selected.id, 4); assert.equal(selected.run_attempt, 2);
  }
  olderJobs[0].steps[0].completed_at = '2026-10-08T10:05:00Z';
  assert.throws(() => selectPublishedRun([newer, olderRollback], r => r.id === 4 ? olderJobs : jobs()), /Ambiguous/);
});

test('publication history follows pagination so an older rerun cannot disappear beyond page one', async () => {
  const first = Array.from({ length: 100 }, (_, n) => run(200 - n)), older = run(4);
  const reads = [];
  const found = await publicationRuns(async path => { reads.push(path); return { total_count: 101, workflow_runs: path.includes('page=2') ? [older] : first }; }, 'repos/owner/demo');
  assert.equal(found.length, 101); assert.equal(found.at(-1).id, 4); assert.equal(reads.length, 2);
  await assert.rejects(publicationRuns(async () => ({ total_count: 101, workflow_runs: first.slice(0, 99) }), 'repos/owner/demo'));
});

test('later failed retry cannot hide a published earlier attempt or substitute its untested archive', async t => {
  const { options, responses, artifact, candidate, dir } = restoreFixture(t);
  const successful = structuredClone(candidate);
  responses['repos/owner/demo/actions/runs/4/attempts/1'] = successful;
  candidate.run_attempt = 2; candidate.conclusion = 'failure'; candidate.run_started_at = '2026-10-08T11:00:00Z';
  responses['repos/owner/demo/actions/runs/4/attempts/2/jobs?per_page=100'] = { total_count: 1, jobs: [{ name: 'build', run_attempt: 2, conclusion: 'failure', steps: [] }] };
  const restored = await restoreSite(options);
  assert.equal(restored.attempt, 1);
  artifact.created_at = '2026-10-08T11:02:00Z';
  await assert.rejects(restoreSite({ ...options, directory: join(dir, 'untested') }), /selected published attempt/);
  t.after(() => rmSync('restored-site.json', { force: true }));
});

function deploymentLog(id = 7, at = '2026-10-08T10:04:01.1234567Z', source = sha) {
  return [`Creating Pages deployment with payload:`, '{', `"artifact_id": ${id},`, `"pages_build_version": "${source}"`, '}']
    .map(line => `${at} ${line}`).join('\n');
}

test('deploy-only retry consumes the prior-attempt artifact while rejecting later or different archives', async t => {
  const { options, responses, candidate, artifact, dir } = restoreFixture(t);
  const failed = structuredClone(candidate); failed.conclusion = 'failure';
  responses['repos/owner/demo/actions/runs/4/attempts/1'] = failed;
  responses['repos/owner/demo/actions/runs/4/attempts/1/jobs?per_page=100'].jobs = jobs('failure', 'failure');
  candidate.run_attempt = 2; candidate.run_started_at = '2026-10-08T11:00:00Z';
  const retried = jobs(); retried[0].run_attempt = 2;
  Object.assign(retried[0].steps[0], { started_at: '2026-10-08T11:01:00Z', completed_at: '2026-10-08T11:02:00Z' });
  responses['repos/owner/demo/actions/runs/4/attempts/2/jobs?per_page=100'] = { total_count: 1, jobs: retried };
  options.readLog = async () => deploymentLog(7, '2026-10-08T11:01:01.1234567Z');
  // Artifact 7 was uploaded at 10:03 in attempt 1; attempt 2 successfully consumes it.
  const restored = await restoreSite(options); assert.equal(restored.attempt, 2); assert.equal(restored.artifact, 7);
  assert.ok(Date.parse(artifact.created_at) < Date.parse(candidate.run_started_at));
  const another = { ...options, directory: join(dir, 'other') };
  artifact.id = 8; await assert.rejects(restoreSite(another), /actually published/); artifact.id = 7;
  artifact.created_at = '2026-10-08T11:01:30Z';
  await assert.rejects(restoreSite(another), /selected published attempt/);
  artifact.created_at = '2026-10-08T11:03:00Z';
  await assert.rejects(restoreSite(another), /selected published attempt/);
  t.after(() => rmSync('restored-site.json', { force: true }));
});

test('consumed artifact receipt is bound to the selected deploy step and workflow source', () => {
  const selected = selectPublishedRun([run()], () => jobs());
  assert.equal(consumedPagesArtifact(deploymentLog(), selected), 7);
  const controls = '2026-10-08T10:04:00Z \u001b[36;1mRun deployment\u001b[0m\n' +
    '2026-10-08T10:04:00Z \u001b]0;untrusted-title\u0007\n';
  assert.equal(consumedPagesArtifact(controls + deploymentLog(), selected), 7);
  assert.throws(() => consumedPagesArtifact(deploymentLog().replace('artifact_id', 'artifact_\u001b[0mid'), selected));
  assert.throws(() => consumedPagesArtifact(deploymentLog().replace('{', '{\u001b]0;title\u0007'), selected),
    { message: 'Invalid Pages artifact receipt JSON' });
  for (const text of ['', deploymentLog() + '\n' + deploymentLog(8), deploymentLog(7, '2026-10-08T10:06:00Z'),
    deploymentLog(7, '2026-10-08T10:03:00Z'), deploymentLog(7, '2026-10-08T10:04:01Z', tree), deploymentLog(-1)])
    assert.throws(() => consumedPagesArtifact(text, selected));
});
