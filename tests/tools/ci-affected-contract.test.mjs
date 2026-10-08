import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserPlan, FULL_SUITES, ITEM_IMAGES, SUITES, validationPlan } from '../../scripts/ci-browser-plan.mjs';
import { classifyFiles } from '../../scripts/ci-scope.mjs';
import { verifyBrowserReports } from '../../scripts/ci-browser-gate.mjs';

test('every routable item image selects real boot and all explicit icon consumers in both engines', () => {
  assert.ok(ITEM_IMAGES.size > 100);
  for (const path of ITEM_IMAGES) {
    assert.deepEqual(browserPlan([path]).suites, ['boot', 'save', 'icons'], path);
    assert.equal(classifyFiles([path]).game, true);
    assert.equal(classifyFiles([path]).ui, false);
    assert.equal(classifyFiles([path]).hud, false);
  }
  for (const path of ['public/assets/icons/gear/new.png', 'public/assets/icons/gear/wisp_staff.PNG',
    'public/assets/icons/material/../unknown.png', 'src/ui/raster-icons.js', 'public/assets/icons/monster/salt_slime.png'])
    assertBounded(browserPlan([path]).suites);
});
test('new upstream material PNGs retain bounded consumers; registered consumables remain conservative', () => {
  for (const id of ['mantis_scythe', 'viper_scale', 'ram_horn', 'dusk_pelt', 'rune_core']) {
    const path = `public/assets/icons/material/${id}.png`;
    assert.equal(ITEM_IMAGES.has(path), true, path);
    assert.deepEqual(browserPlan([path]).suites, ['boot', 'save', 'icons'], path);
    assert.equal(classifyFiles([path]).game, true, path);
  }
  // Registration alone cannot promise shop/quick-slot coverage from this case.
  for (const id of ['hp_potion_s', 'hp_potion_m', 'hp_potion_l', 'mp_potion_s', 'mp_potion_m', 'mp_potion_l']) {
    const path = `public/assets/icons/consumable/${id}.png`;
    assert.equal(ITEM_IMAGES.has(path), false, path);
    assertBounded(browserPlan([path]).suites);
    assert.equal(classifyFiles([path]).game, true, path);
  }
});
test('the exact icon manifest input selects boot/icons with game preparation; other docs remain documentation-only', () => {
  const manifest = 'docs/icon-assets-manifest.json';
  for (const files of [[manifest], [manifest, 'docs/HANDOFF.md'], [manifest, 'public/assets/icons/gear/wisp_staff.png']]) {
    assert.deepEqual(browserPlan(files).suites, ['boot', 'save', 'icons']);
    assert.deepEqual(classifyFiles(files), { game: true, tools: false, ui: false, hud: false, render: false, map: false });
  }
  for (const shared of ['src/ui/style.css', 'src/core/quests.js', 'src/save.js', 'package-lock.json', 'unknown.js'])
    assertBounded(browserPlan([manifest, shared]).suites);
  for (const document of ['docs/icon-assets-manifest-notes.json', 'docs/nested/icon-assets-manifest.json', 'docs/HANDOFF.md']) {
    assert.deepEqual(browserPlan([document]).suites, []);
    assert.equal(classifyFiles([document]).game, false);
  }
});
test('the actual scope CLI enables core/tools/build and boot/icons for a manifest-only PR diff', t => {
  const directory = mkdtempSync(join(tmpdir(), 'icon-manifest-scope-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  writeFileSync(join(directory, 'README.md'), 'fixture'); git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(directory, 'docs')); writeFileSync(join(directory, 'docs/icon-assets-manifest.json'), '{}');
  git('add', '.'); git('commit', '-qm', 'manifest input');
  const event = join(directory, 'event.json'), output = join(directory, 'outputs');
  writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: git('rev-parse', 'HEAD') } } }));
  execFileSync(process.execPath, [new URL('../../scripts/ci-scope.mjs', import.meta.url).pathname], { cwd: directory, env: {
    ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output,
    FORCE_FULL: 'false', FORCE_BOOT: 'false', FORCE_RENDER: 'false',
  } });
  const outputs = readFileSync(output, 'utf8');
  assert.match(outputs, /^game=true$/m);
  assert.match(outputs, /^ui=false$/m); assert.match(outputs, /^hud=false$/m);
  assert.deepEqual(JSON.parse(outputs.match(/^browser_suites=(.*)$/m)[1]), ['boot', 'save', 'icons']);
  // The workflow's existing game preparation runs all three safety owners.
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /run: npm run test:tools\n\s+if: steps.scope.outputs.game == 'true' \|\| steps.scope.outputs.tools == 'true'/);
  for (const command of ['npm test', 'npm run build'])
    assert.ok(ci.includes(`run: ${command}\n        if: steps.scope.outputs.game == 'true'`));
});
test('local CSS and own-page UI have explicit consumers without a blanket UI allowlist', () => {
  assert.deepEqual(browserPlan(['src/ui/fieldhud.css']).suites, ['boot', 'save', 'hud']);
  assert.deepEqual(browserPlan(['src/ui/quest-journal.js']).suites, ['boot', 'save', 'quests', 'hud']);
  for (const path of ['src/ui/fieldhud.css', 'src/ui/quest-journal.js']) {
    assert.equal(classifyFiles([path]).ui, false); assert.equal(classifyFiles([path]).hud, false);
  }
  assert.equal(classifyFiles(['src/ui/panels.js']).ui, true);
  assert.equal(classifyFiles(['src/ui/style.css']).hud, true);
});
test('mixed shared/core/save/dependencies, unknown UI/CSS and new journal modules select bounded safety', () => {
  for (const path of ['src/ui/style.css', 'src/ui/panels.js', 'src/ui/workshop.css', 'src/ui/workshop-view.js',
    'src/core/quests.js', 'src/save.js', 'package-lock.json', 'src/ui/skill-journal/new.js', 'new.css'])
    assertBounded(browserPlan(['public/assets/icons/gear/wisp_staff.png', path]).suites);
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
  assert.match(ci, /pattern: ci-report-/);
});
test('plan identity is deterministic and binds files and current routing bytes', () => {
  const paths = ['src/ui/quest-journal.js', 'public/assets/icons/gear/wisp_staff.png'];
  assert.deepEqual(validationPlan(paths), validationPlan([...paths].reverse().concat(paths)));
  assert.match(validationPlan(paths).routingDigest, /^[a-f0-9]{64}$/);
});

test('changed routing bytes invalidate old plans even if the version was not bumped', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'affected-policy-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const paths = ['scripts/ci-browser-plan.mjs', 'scripts/ci-scope.mjs', 'scripts/ci-browser-run.mjs',
    'scripts/ci-browser-gate.mjs', 'scripts/ci-browser-engine.mjs', 'scripts/ci-equipment-impact.mjs', 'scripts/ci-review-plan.mjs',
    '.github/workflows/ci.yml', '.github/actions/change-scope/action.yml', 'src/ui/raster-icons.js'];
  for (const path of paths) {
    const destination = join(directory, path);
    mkdirSync(join(destination, '..'), { recursive: true });
    copyFileSync(new URL(`../../${path}`, import.meta.url), destination);
  }
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  const policy = await import(pathToFileURL(join(directory, paths[0])));
  const before = policy.validationPlan(['src/ui/fieldhud.css']);
  writeFileSync(join(directory, paths[1]), readFileSync(join(directory, paths[1]), 'utf8') + '\n// routing revision\n');
  const after = policy.validationPlan(['src/ui/fieldhud.css']);
  assert.equal(before.version, after.version);
  assert.deepEqual(before.suites, after.suites);
  assert.notEqual(before.routingDigest, after.routingDigest);
});

test('selected report gate rejects missing/cancelled/incomplete/failing/partial/stale evidence', t => {
  const directory = mkdtempSync(join(tmpdir(), 'affected-gate-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = 'a'.repeat(40), suites = ['boot', 'save', 'icons'];
  const fixture = suite => ({ source, sourceDirty: false, browser: 'chromium', mode: 'quick', suite,
    ok: true, complete: true, running: null, startedAt: 'start', finishedAt: 'finish',
    checks: SUITES[suite].map(script => ({ script, startedAt: 'start', durationMs: 1, exitCode: 0, signal: null })) });
  const put = report => writeFileSync(join(directory, `quick-chromium-${report.suite}.json`), JSON.stringify(report));
  put(fixture('boot')); put(fixture('save')); put(fixture('icons'));
  const verify = () => verifyBrowserReports({ directory, source, browser: 'chromium', mode: 'quick', suites });
  assert.doesNotThrow(verify);
  for (const mutate of [r => r.source = 'b'.repeat(40), r => r.sourceDirty = true, r => r.browser = 'webkit',
    r => r.mode = 'full', r => r.ok = false, r => r.complete = false, r => r.running = 'icon-consumers.mjs',
    r => delete r.finishedAt, r => r.checks = [], r => r.checks[0].exitCode = null,
    r => r.checks[0].exitCode = 1, r => r.checks[0].signal = 'SIGTERM', r => r.checks[0].script = 'fake.mjs']) {
    const report = fixture('icons'); mutate(report); put(report); assert.throws(verify);
  }
  rmSync(join(directory, 'quick-chromium-icons.json')); assert.throws(verify);
});

function assertBounded(suites) {
  assert.ok(suites.includes('boot')); assert.ok(suites.includes('save'));
  assert.ok(suites.length < FULL_SUITES.length, JSON.stringify(suites));
}
