import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserPlan, FULL_SUITES, ITEM_IMAGES, SUITES, validationPlan } from '../../scripts/ci-browser-plan.mjs';
import { classifyFiles } from '../../scripts/ci-scope.mjs';
import { verifyBrowserReports } from '../../scripts/ci-browser-gate.mjs';

test('every routable item image selects real boot and all explicit icon consumers in both engines', () => {
  assert.ok(ITEM_IMAGES.size > 100);
  for (const path of ITEM_IMAGES) {
    assert.deepEqual(browserPlan([path]).suites, ['boot', 'icons'], path);
    assert.equal(classifyFiles([path]).game, true);
    assert.equal(classifyFiles([path]).ui, false);
    assert.equal(classifyFiles([path]).hud, false);
  }
  for (const path of ['public/assets/icons/gear/new.png', 'public/assets/icons/gear/wisp_staff.PNG',
    'public/assets/icons/material/../unknown.png', 'src/ui/raster-icons.js', 'public/assets/icons/monster/salt_slime.png'])
    assert.deepEqual(browserPlan([path]).suites, FULL_SUITES, path);
});
test('local CSS and own-page UI have explicit consumers without a blanket UI allowlist', () => {
  assert.deepEqual(browserPlan(['src/ui/fieldhud.css']).suites, ['boot', 'hud']);
  assert.deepEqual(browserPlan(['src/ui/quest-journal.js']).suites, ['boot', 'quests', 'hud']);
  for (const path of ['src/ui/fieldhud.css', 'src/ui/quest-journal.js']) {
    assert.equal(classifyFiles([path]).ui, false); assert.equal(classifyFiles([path]).hud, false);
  }
  assert.equal(classifyFiles(['src/ui/panels.js']).ui, true);
  assert.equal(classifyFiles(['src/ui/style.css']).hud, true);
});
test('mixed shared/core/save/dependencies, unknown UI/CSS and new journal modules fail closed', () => {
  for (const path of ['src/ui/style.css', 'src/ui/panels.js', 'src/ui/workshop.css', 'src/ui/workshop-view.js',
    'src/core/quests.js', 'src/save.js', 'package-lock.json', 'src/ui/skill-journal/new.js', 'new.css'])
    assert.deepEqual(browserPlan(['public/assets/icons/gear/wisp_staff.png', path]).suites, FULL_SUITES, path);
});
test('full postmerge/manual inventory owns all legacy UI/HUD scripts before premerge narrowing', () => {
  const legacy = [
    'journal', 'skill-journal', 'fullscreen-overlays', 'workspaces', 'journal-route-upgrade', 'journal-lines',
    'skill-lines', 'wearable-level', 'journal-route-save', 'fieldhud', 'smoke', 'ux',
  ];
  const scripts = browserPlan([], { full: true }).suites.flatMap(suite => SUITES[suite]);
  for (const name of legacy) assert.equal(scripts.filter(script => script === `${name}.mjs`).length, 1, name);
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /force-full: \$\{\{ github.event_name != 'pull_request' && !inputs.quick_gate \}\}/);
  assert.match(ci, /Verify complete selected browser evidence/);
  assert.match(ci, /pattern: ci-.*github.run_attempt/);
});
test('plan identity is deterministic and binds files and current routing bytes', () => {
  const paths = ['src/ui/quest-journal.js', 'public/assets/icons/gear/wisp_staff.png'];
  assert.deepEqual(validationPlan(paths), validationPlan([...paths].reverse().concat(paths)));
  assert.match(validationPlan(paths).routingDigest, /^[a-f0-9]{64}$/);
});

test('selected report gate rejects missing/cancelled/incomplete/failing/partial/stale evidence', t => {
  const directory = mkdtempSync(join(tmpdir(), 'affected-gate-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'ci'));
  const source = 'a'.repeat(40), suites = ['boot', 'icons'];
  const fixture = suite => ({ source, sourceDirty: false, browser: 'chromium', mode: 'quick', suite,
    ok: true, complete: true, running: null, startedAt: 'start', finishedAt: 'finish',
    checks: SUITES[suite].map(script => ({ script, startedAt: 'start', durationMs: 1, exitCode: 0, signal: null })) });
  const put = report => writeFileSync(join(directory, 'ci', `quick-chromium-${report.suite}.json`), JSON.stringify(report));
  put(fixture('boot')); put(fixture('icons'));
  const verify = () => verifyBrowserReports({ directory, source, browser: 'chromium', mode: 'quick', suites });
  assert.doesNotThrow(verify);
  for (const mutate of [r => r.source = 'b'.repeat(40), r => r.sourceDirty = true, r => r.browser = 'webkit',
    r => r.mode = 'full', r => r.ok = false, r => r.complete = false, r => r.running = 'icon-consumers.mjs',
    r => delete r.finishedAt, r => r.checks = [], r => r.checks[0].exitCode = null,
    r => r.checks[0].exitCode = 1, r => r.checks[0].signal = 'SIGTERM', r => r.checks[0].script = 'fake.mjs']) {
    const report = fixture('icons'); mutate(report); put(report); assert.throws(verify);
  }
  rmSync(join(directory, 'ci/quick-chromium-icons.json')); assert.throws(verify);
});
