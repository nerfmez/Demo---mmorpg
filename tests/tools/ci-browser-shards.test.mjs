import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserShards, openingSelection } from '../../scripts/ci-browser-shards.mjs';
import { verifyBrowserReports } from '../../scripts/ci-browser-gate.mjs';
import { reviewPlan } from '../../scripts/ci-review-plan.mjs';
import { browserPlan, SHARED_SUITES } from '../../scripts/ci-browser-plan.mjs';

const source = 'a'.repeat(40), merge = 'b'.repeat(40), tree = 'c'.repeat(40);
const expectedCases = ['desktop:sword', 'desktop:bow', 'desktop:staff', 'ipad:sword', 'ipad:bow',
  'ipad:staff', 'phone-landscape:staff', 'phone-portrait:staff'];

test('opening partitions exactly the existing eight cases and one v10 migration', () => {
  const ordinary = openingSelection();
  assert.deepEqual(ordinary.cases.map(c => `${c.view}:${c.kit}`), expectedCases);
  assert.equal(ordinary.migration, true, 'unfiltered manual invocation retains migration');
  const shards = browserShards('opening');
  assert.equal(shards.length, 9);
  assert.equal(new Set(shards.map(c => c.shard)).size, 9);
  const selections = shards.map(c => openingSelection(c.env));
  assert.deepEqual(selections.flatMap(s => s.cases.map(c => `${c.view}:${c.kit}`)), expectedCases);
  assert.equal(selections.filter(s => s.migration).length, 1);
  assert.ok(selections.slice(0, 8).every(s => s.cases.length === 1 && !s.migration));
  assert.deepEqual(selections.at(-1), { cases: [], migration: true });
  assert.deepEqual(openingSelection({ OPENING_VIEW: 'desktop', KIT: 'staff' }).cases.map(c => `${c.view}:${c.kit}`), ['desktop:staff']);
  assert.equal(openingSelection({ OPENING_VIEW: 'desktop', KIT: 'staff' }).migration, true);
  for (const env of [{ OPENING_VIEW: 'typo' }, { KIT: 'axe' }, { OPENING_VIEW: 'phone-portrait', KIT: 'bow' },
    { OPENING_MIGRATION: 'skip' }, { OPENING_MIGRATION: 'only', KIT: 'staff' }]) assert.throws(() => openingSelection(env));
});
test('changing the canonical case inventory retains shared infrastructure and opening coverage', () => {
  const plan = browserPlan(['scripts/ci-browser-shards.mjs']);
  for (const suite of [...SHARED_SUITES, 'opening']) assert.ok(plan.suites.includes(suite), suite);
});

test('affected, full and distinct merge UI execution retain all opening partitions in both engines', () => {
  for (const mode of ['quick', 'full']) for (const mergeTree of [tree, 'd'.repeat(40)]) {
    const plan = reviewPlan({ source, merge, sourceTree: tree, mergeTree, suites: ['opening'], mode });
    for (const sha of mergeTree === tree ? [source] : [source, merge]) for (const browser of ['chromium', 'webkit']) {
      const jobs = plan.matrix.include.filter(j => j.source === sha && j.browser === browser);
      assert.deepEqual(jobs.map(j => j.shard), browserShards('opening').map(s => s.shard));
      assert.ok(jobs.every(j => j.suite === 'opening'));
    }
    assert.deepEqual(plan.ui, ['opening']);
  }
});

test('opening report gate requires every exact case and migration at the selected source', t => {
  const directory = mkdtempSync(join(tmpdir(), 'opening-gate-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const browser of ['chromium', 'webkit']) for (const mode of ['quick', 'full', 'merge']) {
    const fixture = ({ shard, env }) => ({ source, sourceDirty: false, browser, mode, suite: 'opening', shard, selection: env,
      ok: true, complete: true, running: null, startedAt: 'start', finishedAt: 'finish',
      checks: [{ script: 'opening.mjs', startedAt: 'start', durationMs: 1, exitCode: 0, signal: null }] });
    const path = shard => join(directory, `${mode}-${browser}-${shard}.json`);
    const put = report => writeFileSync(path(report.shard), JSON.stringify(report));
    const shards = browserShards('opening');
    shards.forEach(s => put(fixture(s)));
    const verify = () => verifyBrowserReports({ directory, source, browser, mode, suites: ['opening'] });
    assert.doesNotThrow(verify);
    for (const selection of shards) {
      rmSync(path(selection.shard)); assert.throws(verify, selection.shard); put(fixture(selection));
      for (const mutate of [r => r.source = merge, r => r.shard = 'opening', r => r.selection = {},
        r => r.selection = { ...r.selection, KIT: 'axe' }, r => r.complete = false,
        r => r.checks[0].exitCode = 1, r => r.checks[0].signal = 'SIGTERM']) {
        const report = fixture(selection); mutate(report);
        writeFileSync(path(selection.shard), JSON.stringify(report)); assert.throws(verify); put(fixture(selection));
      }
    }
  }
});

test('runner owns each opening selector and records canonical receipt identity', t => {
  const directory = mkdtempSync(join(tmpdir(), 'opening-runner-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'tests/browser'), { recursive: true });
  writeFileSync(join(directory, 'tests/browser/opening.mjs'), `
    import { writeFileSync } from 'node:fs';
    writeFileSync('selected.json', JSON.stringify({
      OPENING_VIEW: process.env.OPENING_VIEW, KIT: process.env.KIT, OPENING_MIGRATION: process.env.OPENING_MIGRATION
    }));`);
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'CI'); git('config', 'user.email', 'ci@example.invalid');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const run = (shard, env = {}) => spawnSync(process.execPath,
    [new URL('../../scripts/ci-browser-run.mjs', import.meta.url).pathname, 'opening', ...(shard ? [shard] : [])],
    { cwd: directory, env: { ...process.env, BROWSER: 'chromium', CI_MODE: 'quick', CI_SOURCE_SHA: sha, ...env }, encoding: 'utf8' });
  for (const selection of browserShards('opening')) {
    const result = run(selection.shard); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'selected.json'))), selection.env);
    const report = JSON.parse(readFileSync(join(directory, `tests/browser/out/ci/quick-chromium-${selection.shard}.json`)));
    assert.equal(report.source, sha); assert.equal(report.suite, 'opening'); assert.equal(report.shard, selection.shard);
    assert.deepEqual(report.selection, selection.env); assert.equal(report.ok, true); assert.equal(report.complete, true);
  }
  assert.doesNotThrow(() => verifyBrowserReports({ directory: join(directory, 'tests/browser/out/ci'), source: sha,
    browser: 'chromium', mode: 'quick', suites: ['opening'] }));
  assert.notEqual(run().status, 0, 'a partial unpartitioned opening job cannot certify the suite');
  assert.notEqual(run('opening-unknown').status, 0);
  for (const env of [{ OPENING_VIEW: 'desktop' }, { KIT: 'staff' }, { OPENING_MIGRATION: 'only' }])
    assert.notEqual(run('opening-desktop-sword', env).status, 0, 'ambient selectors cannot reduce planned coverage');
});
