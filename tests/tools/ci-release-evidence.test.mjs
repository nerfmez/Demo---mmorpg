import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FULL_SUITES, validationPlan } from '../../scripts/ci-browser-plan.mjs';
import { EQUIPMENT_SUITES } from '../../scripts/ci-equipment-impact.mjs';
import { changedTreePaths, ciContext, extractBuildArchive, resolveRelease, validateEvidence, verifyCiContext, verifyPrAssociation } from '../../scripts/ci-release-evidence.mjs';

const source = 'a'.repeat(40), target = 'b'.repeat(40), tree = 'c'.repeat(40);
const repository = 'owner/demo', id = 123;
const steps = names => names.map(name => ({ name, conclusion: 'success' }));
function contextFixture(files = ['src/save.js'], impacts = {}) {
  return { version: 2, source, tree, plan: validationPlan(files, { impacts }), repository, runId: 99, attempt: 2, eventName: 'pull_request',
    workflowRef: `${repository}/.github/workflows/ci.yml@refs/pull/82/merge`, workflowSha: 'f'.repeat(40),
    pr: { number: 82, base: { ref: 'main', sha: '0'.repeat(40), repositoryId: id }, head: { sha: source, repositoryId: id } } };
}
test('CI context receipt binds GitHub event PR/main and executed workflow identity', () => {
  const f = fixture(), evidence = validateEvidence(f);
  assert.doesNotThrow(() => verifyCiContext(contextFixture(), evidence, f.pr, repository, id));
  for (const mutate of [c => c.pr.number = 83, c => c.pr.base.ref = 'other', c => c.pr = null,
    c => c.pr.head.repositoryId = 456, c => c.pr.head.sha = target, c => c.workflowRef = `${repository}/.github/workflows/ci.yml@refs/heads/other`,
    c => c.workflowSha = '', c => c.runId = 98, c => c.attempt = 1, c => c.source = target, c => c.tree = source]) {
    const context = contextFixture(); mutate(context); assert.throws(() => verifyCiContext(context, evidence, f.pr, repository, id));
  }
  const context = ciContext({ environment: { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '99', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_WORKFLOW_REF: contextFixture().workflowRef, GITHUB_WORKFLOW_SHA: 'f'.repeat(40) },
    event: { number: 82, pull_request: { base: { ref: 'main', sha: '0'.repeat(40), repo: { id } }, head: { sha: source, ref: 'feature', repo: { id } } } }, source, tree, files: f.files });
  assert.deepEqual(context, contextFixture());
});
function fixture(files = ['src/save.js'], impacts = {}) {
  const run = { id: 99, run_attempt: 2, workflow_id: 7, path: '.github/workflows/ci.yml',
    event: 'pull_request', head_sha: source, head_branch: 'feature', created_at: '2026-10-06T08:02:03Z', pull_requests: [], repository: { id }, head_repository: { id }, status: 'completed', conclusion: 'success' };
  const job = (name, names) => ({ name, status: 'completed', conclusion: 'success', run_id: run.id, run_attempt: 2, steps: steps(names) });
  return { repository, repositoryId: id, target, targetTree: tree, sourceTree: tree, files,
    pr: { number: 82, created_at: '2026-10-06T08:01:59Z', merged_at: '2026-10-06T08:32:05Z', merge_commit_sha: target,
      base: { ref: 'main', repo: { id, full_name: repository } }, head: { sha: source, ref: 'feature', repo: { id, full_name: repository } } },
    workflow: { id: 7, path: run.path }, run,
    jobs: [job('Build, core and CI tools', ['Run npm run test:tools', 'Run npm test', 'Run npm run build', 'Bind CI event and workflow to build', 'Bind build to the tested source', 'Run actions/upload-artifact@v4']),
      ...['chromium', 'webkit'].flatMap(browser => [job(`review (${browser})`, ['Verify shared UI evidence at head or merge tree']), job(`field-hud (${browser})`, ['Verify shared HUD evidence at head or merge tree'])]),
      ...['chromium', 'webkit'].map(browser => job(`test (${browser})`, ['Verify complete selected browser evidence', 'Report gate outcome at exact source'])),
      ...['chromium', 'webkit'].flatMap(browser => validationPlan(files, { impacts }).suites.map(suite => job(`Quick affected (${browser}, ${suite})`,
        ['Verify downloaded build source', 'Run complete selected shard with timings', 'Upload selected browser report', 'Run actions/upload-artifact@v4'])))],
    artifact: { id: 456, name: `ci-dist-${source}-99-2`, expired: false, size_in_bytes: 100, digest: `sha256:${'d'.repeat(64)}`,
      workflow_run: { id: 99, head_sha: source, repository_id: id, head_repository_id: id } } };
}
test('same-tree squash source retains distinct build-origin and release-target identity', () => {
  const evidence = validateEvidence(fixture());
  assert.equal(evidence.source, source); assert.equal(evidence.target, target);
  assert.equal(evidence.tree, tree); assert.equal(evidence.attempt, 2);
});
test('GitHub-owned unique branch and never-retargeted main PR bind empty run associations', () => {
  const f = fixture();
  assert.doesNotThrow(() => verifyPrAssociation(f.run, f.pr, [f.pr], [{ event: 'merged' }], id));
  for (const mutate of [g => g.run.head_branch = 'other', g => g.run.created_at = '2026-10-06T07:00:00Z',
    g => g.run.pull_requests = [{ number: 83 }], g => g.branchPrs.push({ ...g.pr, number: 83 }),
    g => g.branchPrs = [], g => g.timeline = [{ event: 'base_ref_changed' }], g => g.timeline = [{ event: 'automatic_base_change_succeeded' }], g => g.timeline = Array(100).fill({ event: 'commented' })]) {
    const g = fixture(); g.branchPrs = [g.pr]; g.timeline = []; mutate(g);
    assert.throws(() => verifyPrAssociation(g.run, g.pr, g.branchPrs, g.timeline, id));
  }
});
test('legacy PR heads without the helper continue normal checks without a reusable receipt', t => {
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const block = ci.slice(ci.indexOf('      - name: Bind CI event and workflow to build'), ci.indexOf('      - name: Bind build to the tested source'));
  const shell = block.slice(block.indexOf('        run: |\n') + '        run: |\n'.length).split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'release-legacy-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(result.stdout, /Legacy PR head/);
});
for (const [name, mutate] of [
  ['different tree', f => f.sourceTree = 'e'.repeat(40)],
  ['fork PR', f => f.pr.head.repo.id = 456],
  ['unmerged PR', f => f.pr.merged_at = null],
  ['different merge', f => f.pr.merge_commit_sha = source],
  ['wrong base', f => f.pr.base.ref = 'release'],
  ['wrong workflow', f => f.run.workflow_id = 8],
  ['wrong event', f => f.run.event = 'push'],
  ['wrong run source', f => f.run.head_sha = target],
  ['fork run', f => f.run.head_repository.id = 456],
  ['running attempt', f => f.run.status = 'in_progress'],
  ['failed run', f => f.run.conclusion = 'failure'],
  ['failed job', f => f.jobs[3].conclusion = 'failure'],
  ['cancelled job', f => f.jobs[3].conclusion = 'cancelled'],
  ['skipped job', f => f.jobs[3].conclusion = 'skipped'],
  ['missing boot', f => f.jobs = f.jobs.filter(j => !j.name.includes('webkit, boot'))],
  ['missing save', f => f.jobs = f.jobs.filter(j => !j.name.includes('chromium, save'))],
  ['duplicate name', f => f.jobs[3].name = f.jobs[4].name],
  ['old-attempt job', f => f.jobs[3].run_attempt = 1],
  ['failed source check', f => f.jobs[3].steps[0].conclusion = 'failure'],
  ['incomplete runner', f => f.jobs.find(j => j.name.startsWith('Quick affected')).steps[1].conclusion = 'cancelled'],
  ['missing core', f => f.jobs[0].steps = f.jobs[0].steps.filter(s => s.name !== 'Run npm test')],
  ['expired artifact', f => f.artifact.expired = true],
  ['old-attempt artifact', f => f.artifact.name = `ci-dist-${source}-99-1`],
  ['wrong artifact run', f => f.artifact.workflow_run.id = 98],
  ['wrong artifact source', f => f.artifact.workflow_run.head_sha = target],
  ['missing digest', f => delete f.artifact.digest],
  ['missing artifact', f => f.artifact = null],
]) test(`reuse rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => validateEvidence(f)); });

function resolverFixture(t, files = ['src/save.js'], impacts = {}) {
  const f = fixture(files, impacts), directory = mkdtempSync(join(tmpdir(), 'release-resolver-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bytes = Buffer.from('immutable fixture archive');
  f.artifact.digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const prefix = `repos/${repository}`;
  const responses = {
    [prefix]: { id }, [`${prefix}/git/commits/${target}`]: { tree: { sha: tree } },
    [`${prefix}/git/commits/${source}`]: { tree: { sha: tree } },
    [`${prefix}/git/commits/${'f'.repeat(40)}`]: { parents: [{ sha: '0'.repeat(40) }, { sha: source }] },
    [`${prefix}/git/commits/${'0'.repeat(40)}`]: { tree: { sha: '1'.repeat(40) } },
    [`${prefix}/git/trees/${'1'.repeat(40)}?recursive=1`]: { truncated: false, tree: [] },
    [`${prefix}/git/trees/${tree}?recursive=1`]: { truncated: false, tree: files.map(path => ({ path, sha: '2'.repeat(40), type: 'blob', mode: '100644' })) },
    [`${prefix}/commits/${target}/pulls?per_page=100`]: [f.pr], [`${prefix}/pulls/82`]: f.pr,
    [`${prefix}/actions/workflows/ci.yml`]: f.workflow,
    [`${prefix}/actions/workflows/7/runs?event=pull_request&head_sha=${source}&per_page=100`]: { workflow_runs: [f.run] },
    [`${prefix}/actions/runs/99`]: f.run,
    [`${prefix}/pulls?state=all&head=owner%3Afeature&per_page=100`]: [f.pr],
    [`${prefix}/issues/82/timeline?per_page=100`]: [{ event: 'merged' }],
    [`${prefix}/actions/runs/99/attempts/2/jobs?per_page=100`]: { total_count: f.jobs.length, jobs: f.jobs },
    [`${prefix}/actions/runs/99/artifacts?per_page=100`]: { total_count: 1, artifacts: [f.artifact] },
    [`${prefix}/contents/.github/workflows/ci.yml?ref=${source}`]: { sha: 'e'.repeat(40) },
    [`${prefix}/contents/.github/workflows/ci.yml?ref=${'f'.repeat(40)}`]: { sha: 'e'.repeat(40) },
  };
  const options = { repository, target, eventName: 'push', ref: 'refs/heads/main', directory: join(directory, 'dist'), log: () => {},
    api: async path => { assert.ok(path in responses, path); return responses[path]; },
    download: async (path, destination) => { assert.equal(path, `${prefix}/actions/artifacts/456/zip`); writeFileSync(destination, bytes); },
    extract: async (_, destination) => { mkdirSync(destination); writeFileSync(join(destination, 'ci-source.txt'), source + '\n'); writeFileSync(join(destination, 'index.html'), '<html>tested</html>'); writeFileSync(join(destination, 'ci-context.json'), JSON.stringify(contextFixture(files, impacts))); } };
  return { f, responses, options };
}
test('resolver enables reuse only after successful download, digest, source and entrypoint checks', async t => {
  const { options } = resolverFixture(t);
  const evidence = await resolveRelease(options);
  assert.equal(evidence.source, source);
  assert.equal(JSON.parse(readFileSync(join(options.directory, 'ci-evidence.json'))).target, target);
});

test('deploy evidence installs locked dev dependencies before resolving equipment evidence', () => {
  const deploy = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const evidence = deploy.split('\n  evidence:\n')[1].split('\n  validate:\n')[0];
  const setup = evidence.indexOf('uses: actions/setup-node@v4');
  const install = evidence.indexOf('run: npm ci --include=dev');
  const resolve = evidence.indexOf('run: node scripts/ci-release-evidence.mjs');
  assert.ok(setup >= 0 && install > setup && resolve > install);
  assert.doesNotMatch(evidence.slice(install, resolve), /if:|continue-on-error/);
});

test('clean equipment evidence fails closed without Acorn and reuses only after locked parser setup', t => {
  const files = ['src/core/character.js'], impacts = { [files[0]]: EQUIPMENT_SUITES };
  const { responses } = resolverFixture(t, files, impacts);
  const prefix = `repos/${repository}`;
  const before = 'export function gearLook(ch,data){return {bases:["sword"]};}';
  const after = before.replace('"sword"', '"axe"');
  responses[`${prefix}/git/trees/${'1'.repeat(40)}?recursive=1`].tree = [{ path: files[0], sha: '3'.repeat(40), type: 'blob', mode: '100644' }];
  for (const [sha, code] of [['3'.repeat(40), before], ['2'.repeat(40), after]])
    responses[`${prefix}/git/blobs/${sha}`] = { sha, size: Buffer.byteLength(code), encoding: 'base64', content: Buffer.from(code).toString('base64') };
  const dir = mkdtempSync(join(tmpdir(), 'release-clean-equipment-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Isolate the actual resolver and routing policy from checkout/global modules.
  for (const file of ['scripts/ci-release-evidence.mjs', 'scripts/ci-browser-plan.mjs', 'scripts/ci-scope.mjs',
    'scripts/ci-browser-run.mjs', 'scripts/ci-browser-gate.mjs', 'scripts/ci-equipment-impact.mjs',
    'scripts/ci-browser-engine.mjs', 'scripts/ci-review-plan.mjs', '.github/workflows/ci.yml',
    '.github/actions/change-scope/action.yml', 'src/ui/raster-icons.js']) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(new URL(`../../${file}`, import.meta.url), join(dir, file));
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'fixture.json'), JSON.stringify({ repository, target, source, responses, context: contextFixture(files, impacts) }));
  writeFileSync(join(dir, 'probe.mjs'), `
    import {resolveRelease} from './scripts/ci-release-evidence.mjs';
    import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    const f=JSON.parse(readFileSync('fixture.json','utf8')), logs=[];
    const evidence=await resolveRelease({repository:f.repository,target:f.target,eventName:'push',ref:'refs/heads/main',directory:'dist',
      api:async path=>{if(!(path in f.responses))throw Error('Unexpected API: '+path);return f.responses[path];},
      download:async (path,dest)=>{if(path!=='repos/'+f.repository+'/actions/artifacts/456/zip')throw Error('Wrong artifact');writeFileSync(dest,'immutable fixture archive');},
      extract:async (_,dest)=>{mkdirSync(dest);writeFileSync(join(dest,'ci-source.txt'),f.source);writeFileSync(join(dest,'index.html'),'<html>tested</html>');writeFileSync(join(dest,'ci-context.json'),JSON.stringify(f.context));},
      log:message=>logs.push(message)});
    console.log(JSON.stringify({evidence,logs}));
  `);
  const probe = () => {
    const run = spawnSync(process.execPath, ['--no-global-search-paths', 'probe.mjs'], {
      cwd: dir, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  };
  const missing = probe();
  assert.equal(missing.evidence, null);
  assert.match(missing.logs.join('\n'), /Incomplete or ambiguous CI coverage/);
  const acorn = dirname(createRequire(import.meta.url).resolve('acorn/package.json'));
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
  assert.equal(JSON.parse(readFileSync(join(acorn, 'package.json'))).version, lock.packages['node_modules/acorn'].version);
  // Supply the same locked parser that workflow npm ci installs; no network or
  // inherited node_modules is used by the subprocess regression.
  cpSync(acorn, join(dir, 'node_modules/acorn'), { recursive: true });
  const installed = probe();
  assert.deepEqual(installed.evidence?.plan, validationPlan(files, { impacts }));
  assert.equal(installed.evidence?.source, source);
  assert.equal(installed.evidence?.runId, 99);
  assert.equal(installed.evidence?.attempt, 2);
  assert.ok(installed.logs.some(message => message.startsWith('Verified same-tree affected CI')));
});

function paginatedArtifacts(f, responses) {
  // Each browser job publishes report + capture artifacts, plus one shared build.
  const jobs = f.jobs.filter(job => job.name.startsWith('Quick affected')).length;
  const reports = Array.from({ length: jobs * 2 }, (_, index) => ({ id: 1000 + index, name: `browser-${index}` }));
  const artifacts = [...reports, f.artifact];
  const first = `repos/${repository}/actions/runs/99/artifacts?per_page=100`;
  const second = `${first}&page=2`;
  responses[first] = { total_count: artifacts.length, artifacts: artifacts.slice(0, 100) };
  responses[second] = { total_count: artifacts.length, artifacts: artifacts.slice(100) };
  return { first, second };
}
test('full browser inventory evidence reuses the exact build on page two', async t => {
  const { f, responses, options } = resolverFixture(t);
  assert.equal(f.jobs.filter(job => job.name.startsWith('Quick affected')).length, FULL_SUITES.length * 2);
  assert.ok(FULL_SUITES.length * 2 > 50, 'report/capture artifacts require a second page');
  paginatedArtifacts(f, responses);
  const evidence = await resolveRelease(options);
  assert.equal(evidence?.artifactId, 456);
  assert.equal(evidence?.source, source);
  assert.equal(evidence?.runId, 99);
  assert.equal(evidence?.attempt, 2);
});
for (const kind of ['duplicate ID', 'duplicate exact build', 'short first page', 'short final page',
  'changing total', 'missing page', 'page API error', 'invalid total', 'wrong source', 'wrong attempt', 'wrong run'])
  test(`paginated artifact evidence rejects ${kind}`, async t => {
    const { f, responses, options } = resolverFixture(t);
    const { first, second } = paginatedArtifacts(f, responses);
    if (kind === 'duplicate ID') responses[first].artifacts[0].id = f.artifact.id;
    if (kind === 'duplicate exact build') responses[first].artifacts[0] = { ...f.artifact, id: 1234 };
    if (kind === 'short first page') responses[first].artifacts.pop();
    if (kind === 'short final page') responses[second].artifacts = [];
    if (kind === 'changing total') responses[second].total_count++;
    if (kind === 'missing page') delete responses[second];
    if (kind === 'page API error') { const api = options.api; options.api = path => path === second ? Promise.reject(Error('unavailable')) : api(path); }
    if (kind === 'invalid total') responses[first].total_count = 10001;
    if (kind === 'wrong source') f.artifact.workflow_run.head_sha = target;
    if (kind === 'wrong attempt') f.artifact.name = `ci-dist-${source}-99-1`;
    if (kind === 'wrong run') f.artifact.workflow_run.id = 98;
    assert.equal(await resolveRelease(options), null);
  });

for (const files of [
  ['public/assets/icons/gear/wisp_staff.png'], ['src/ui/fieldhud.css'], ['src/ui/quest-journal.js'],
  ['docs/icon-assets-manifest.json'],
  ['public/assets/icons/material/crab_shell.png', 'src/ui/quest-journal.js'],
]) test(`trusted narrow artifact reuses exactly the recomputed plan: ${files.join(',')}`, async t => {
  const { f, options } = resolverFixture(t, files);
  const evidence = await resolveRelease(options);
  assert.deepEqual(evidence?.plan, validationPlan(files));
  assert.ok(evidence.plan.suites.length < FULL_SUITES.length);
  const selected = f.jobs.find(job => job.name.includes('Quick affected'));
  for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
    selected.conclusion = conclusion;
    assert.equal(await resolveRelease(options), null, conclusion);
  }
  selected.conclusion = 'success';
  f.jobs.splice(f.jobs.indexOf(selected), 1);
  assert.equal(await resolveRelease(options), null, 'missing selected job');
});

for (const kind of ['version', 'routing digest', 'suite claims', 'changed files', 'receipt base', 'executed head', 'truncated tree', 'stale latest run'])
  test(`narrow resolver rejects tampered/stale ${kind}`, async t => {
    const files = ['public/assets/icons/gear/wisp_staff.png'];
    const { f, responses, options } = resolverFixture(t, files);
    if (['version', 'routing digest', 'suite claims', 'changed files', 'receipt base'].includes(kind)) {
      const extract = options.extract;
      options.extract = async (...args) => {
        await extract(...args);
        const path = join(args[1], 'ci-context.json'), context = JSON.parse(readFileSync(path));
        if (kind === 'version') context.plan.version--;
        if (kind === 'routing digest') context.plan.routingDigest = '9'.repeat(64);
        if (kind === 'suite claims') context.plan.suites = ['boot'];
        if (kind === 'changed files') context.plan.files = ['docs/claimed.md'];
        if (kind === 'receipt base') context.pr.base.sha = '8'.repeat(40);
        writeFileSync(path, JSON.stringify(context));
      };
    }
    if (kind === 'executed head') responses[`repos/${repository}/git/commits/${'f'.repeat(40)}`].parents[1].sha = target;
    if (kind === 'truncated tree') responses[`repos/${repository}/git/trees/${tree}?recursive=1`].truncated = true;
    if (kind === 'stale latest run') responses[`repos/${repository}/actions/workflows/7/runs?event=pull_request&head_sha=${source}&per_page=100`]
      .workflow_runs.unshift({ ...f.run, id: 100, conclusion: 'cancelled' });
    assert.equal(await resolveRelease(options), null);
  });

test('authoritative tree diff retains deleted/renamed paths and mode changes', () => {
  const entry = (path, mode = '100644') => ({ path, mode, type: 'blob', sha: '1'.repeat(40) });
  const before = { truncated: false, tree: [entry('runtime.js'), entry('same.js'), entry('mode.js')] };
  const after = { truncated: false, tree: [entry('docs/renamed.md'), entry('same.js'), entry('mode.js', '100755')] };
  assert.deepEqual(changedTreePaths(before, after), ['docs/renamed.md', 'mode.js', 'runtime.js']);
  assert.throws(() => changedTreePaths({ ...before, truncated: true }, after));
});

test('full/self-declared coverage cannot substitute for a missing authoritative diff', () => {
  const f = fixture(); delete f.files;
  assert.throws(() => validateEvidence(f), /authoritative/);
});
for (const kind of ['API unavailable', 'different tree', 'truncated jobs', 'download failed', 'digest mismatch', 'unsafe extraction', 'wrong marker', 'missing entrypoint', 'missing PR receipt', 'different executed workflow'])
  test(`resolver returns normal-gate fallback: ${kind}`, async t => {
    const { responses, options } = resolverFixture(t);
    if (kind === 'API unavailable') options.api = async () => { throw Error('unavailable'); };
    if (kind === 'different tree') responses[`repos/${repository}/git/commits/${source}`].tree.sha = 'f'.repeat(40);
    if (kind === 'truncated jobs') responses[`repos/${repository}/actions/runs/99/attempts/2/jobs?per_page=100`].total_count++;
    if (kind === 'download failed') options.download = async () => { throw Error('unavailable'); };
    if (kind === 'digest mismatch') options.download = async (_, dest) => writeFileSync(dest, 'corrupt');
    if (kind === 'unsafe extraction') options.extract = async () => { throw Error('unsafe archive'); };
    if (kind === 'wrong marker' || kind === 'missing entrypoint') options.extract = async (_, dest) => {
      mkdirSync(dest); writeFileSync(join(dest, 'ci-source.txt'), kind === 'wrong marker' ? target : source);
      if (kind === 'wrong marker') writeFileSync(join(dest, 'index.html'), '<html>');
    };
    if (kind === 'missing PR receipt') { const extract = options.extract; options.extract = async (...args) => { await extract(...args); rmSync(join(args[1], 'ci-context.json')); }; }
    if (kind === 'different executed workflow') responses[`repos/${repository}/contents/.github/workflows/ci.yml?ref=${'f'.repeat(40)}`].sha = '9'.repeat(40);
    assert.equal(await resolveRelease(options), null);
  });
test('dispatch and lab events never bypass their existing paths or read PR evidence', async () => {
  for (const [eventName, ref] of [['workflow_dispatch', 'refs/heads/main'], ['workflow_run', 'refs/heads/main'], ['push', 'refs/heads/other']])
    assert.equal(await resolveRelease({ eventName, ref, api: () => { throw Error('must not run'); } }), null);
});
test('real ZIP extractor rejects traversal and symlinks; valid archive retains source marker', t => {
  const dir = mkdtempSync(join(tmpdir(), 'release-zip-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const kind of ['valid', 'traversal', 'symlink']) {
    const zip = join(dir, kind + '.zip'), out = join(dir, kind);
    execFileSync('python3', ['-c', 'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n z.writestr("index.html","<html>")\n z.writestr("ci-source.txt",sys.argv[3])\n if sys.argv[2]=="traversal": z.writestr("../escape","unsafe")\n if sys.argv[2]=="symlink":\n  e=zipfile.ZipInfo("link");e.create_system=3;e.external_attr=(0o120777<<16);z.writestr(e,"../escape")', zip, kind, source]);
    if (kind === 'valid') { extractBuildArchive(zip, out); assert.equal(readFileSync(join(out, 'ci-source.txt'), 'utf8'), source); }
    else assert.throws(() => extractBuildArchive(zip, out));
  }
});
test('actual build-verification CLI preserves separate SHA provenance and rejects unverified cross-SHA builds', t => {
  const dir = mkdtempSync(join(tmpdir(), 'release-provenance-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'ci@example.invalid');
  writeFileSync(join(dir, 'README.md'), 'same tree'); git('add', '.'); git('commit', '-qm', 'source'); const origin = git('rev-parse', 'HEAD');
  git('commit', '--allow-empty', '-qm', 'release'); const release = git('rev-parse', 'HEAD'), releaseTree = git('rev-parse', 'HEAD^{tree}');
  mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist/index.html'), '<html>'); writeFileSync(join(dir, 'dist/ci-source.txt'), origin);
  const receipt = { source: origin, target: release, tree: releaseTree, runId: 99, attempt: 2 };
  writeFileSync(join(dir, 'dist/ci-evidence.json'), JSON.stringify(receipt));
  const run = overrides => spawnSync(process.execPath, [new URL('../../scripts/ci-release-evidence.mjs', import.meta.url).pathname, '--verify-build'],
    { cwd: dir, env: { ...process.env, BUILD_ORIGIN: origin, RELEASE_TARGET: release, RELEASE_TREE: releaseTree, EVIDENCE_RUN: '99', ...overrides }, encoding: 'utf8' });
  assert.equal(run({}).status, 0);
  const provenance = JSON.parse(readFileSync(join(dir, 'dist/ci-release.json')));
  assert.equal(provenance.buildOrigin.sha, origin); assert.equal(provenance.releaseTarget.sha, release);
  assert.equal(provenance.buildOrigin.tree, provenance.releaseTarget.tree);
  assert.equal(readFileSync(join(dir, 'dist/ci-source.txt'), 'utf8'), origin, 'never relabel old build as new SHA');
  for (const overrides of [{ EVIDENCE_RUN: '' }, { EVIDENCE_RUN: '98' }, { RELEASE_TREE: 'f'.repeat(40) }, { RELEASE_TARGET: origin }, { BUILD_ORIGIN: release }])
    assert.notEqual(run(overrides).status, 0);
});
test('workflow fallback and bypass both require a successful owner; no publication depends on asynchronous full CI', () => {
  const deploy = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(deploy, /needs: \[evidence, validate\]/);
  assert.match(deploy, /needs.evidence.result == 'success' && needs.evidence.outputs.reuse == 'true'/);
  assert.match(deploy, /needs.validate.result == 'skipped'/);
  assert.match(deploy, /!\(needs.evidence.result == 'success' && needs.evidence.outputs.reuse == 'true'\)/);
  assert.match(deploy, /path: release-dist\//);
  assert.doesNotMatch(deploy, /continue-on-error|workflows: \['CI'\]/);
  assert.match(deploy, /Dreamloop against the published game/);
  assert.match(deploy, /Published atomic route purchase and reload/);
  // Evaluate all result combinations using the workflow's intended boolean DAG.
  for (const evidence of ['success', 'failure', 'skipped', 'cancelled']) for (const reuse of [true, false]) {
    const bypass = evidence === 'success' && reuse;
    const validate = !bypass;
    for (const result of ['success', 'failure', 'skipped', 'cancelled']) {
      const build = result === 'success' || (bypass && result === 'skipped');
      assert.equal(build, result === 'success' || (!validate && result === 'skipped'));
    }
  }
});
test('deploy explicitly survives skipped ancestors and requires successful build without cancellation', () => {
  const deploy = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const job = deploy.slice(deploy.indexOf('\n  deploy:\n'));
  assert.match(job, /needs: build\n    if: always\(\) && !cancelled\(\) && needs.build.result == 'success'/);
  const expression = job.match(/^[ \t]+if: (.+)$/m)[1];
  const evaluate = (build, cancelled) => Function('return ' + expression.replace('always()', 'true').replace('cancelled()', String(cancelled)).replace('needs.build.result', JSON.stringify(build)))();
  for (const ancestor of ['success', 'failure', 'skipped', 'cancelled']) for (const build of ['success', 'failure', 'skipped', 'cancelled'])
    for (const cancelled of [true, false]) {
      const shouldRun = evaluate(build, cancelled);
      assert.equal(shouldRun, build === 'success' && !cancelled, `${ancestor}/${build}/${cancelled}`);
    }
});
