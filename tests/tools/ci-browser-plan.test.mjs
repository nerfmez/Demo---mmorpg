import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SUITES, FULL_SUITES, browserPlan } from '../../scripts/ci-browser-plan.mjs';

test('full inventory retains every original CI browser check, boot/save and broad UI/HUD ownership', () => {
  const original = ['smoke', 'map-travel', 'open-world', 'open-world-city', 'midhigh-monsters', 'gear-hands', 'weapon-loading', 'weapon-models', 'shop-potions', 'potions-moving', 'details-touch', 'menu-hub', 'coastal-attacks', 'lab', 'ux', 'capture'];
  const scripts = Object.values(SUITES).flat();
  for (const name of [...original, 'boot', 'opening', 'journal-route-save', 'details-game-touch', 'journal', 'skill-journal',
    'fullscreen-overlays', 'workspaces', 'journal-route-upgrade', 'journal-lines', 'skill-lines', 'wearable-level', 'fieldhud'])
    assert.ok(scripts.includes(`${name}.mjs`), name);
  assert.equal(new Set(scripts).size, scripts.length, 'each check has one shard owner');
  for (const script of scripts) assert.ok(existsSync(new URL(`../browser/${script}`, import.meta.url)), script);
});
test('documentation and tool tests select no browsers; infrastructure fails closed', () => {
  assert.deepEqual(browserPlan(['docs/HANDOFF.md', 'tests/tools/ci-scope.test.mjs']).suites, []);
  for (const path of ['.github/workflows/ci.yml', 'scripts/new-tool.mjs']) assertBounded(browserPlan([path]).suites);
  assert.deepEqual(browserPlan(['docs/HANDOFF.md', 'tests/browser/menu-hub.mjs']).suites, ['boot', 'menu', 'save']);
  assert.deepEqual(browserPlan(['tests/browser/menu-hub.mjs', 'tests/browser/weapon-loading.mjs']).suites, ['boot', 'weapons', 'menu', 'save']);
});
test('bounded local dependencies include their cross-area consumers', () => {
  assert.deepEqual(browserPlan(['src/ui/menu.js']).suites, ['boot', 'menu', 'save']);
  for (const path of ['public/models/weapons/new.glb', 'docs/WEAPON-MODEL-PROVENANCE.json']) assert.ok(browserPlan([path]).suites.includes('weapons'));
  for (const path of ['src/ui/skill-journal/journal.js', 'src/ui/skill-journal/paper-audio.js']) assert.ok(browserPlan([path]).suites.includes('save'));
});
test('core, data, saves, shared code, dependency and unknown paths select bounded safety', () => {
  for (const file of ['src/core/ai.js', 'tests/core/save.test.js', 'src/save.js', 'data/items.json', 'src/main.js', 'src/ui/panels.js', 'src/ui/input.js', 'src/ui/style.css', 'src/render/models.js', 'src/render/view.js', 'tests/browser/fullscreen-entry.mjs', 'tests/browser/new-test.mjs', 'package-lock.json', 'vite.config.js', 'new-runtime.js', 'src/new\nfile.js']) {
    const plan = browserPlan([file]);
    assertBounded(plan.suites);
    assert.match(plan.reason, /bounded/);
  }
  assert.deepEqual(browserPlan(['docs/a.md'], { full: true }).suites, FULL_SUITES);
});
test('workflow shares exact-source build, shards both engines, and gates on all results', () => {
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.event.workflow_run.head_sha \|\| github.sha \}\}/);
  assert.match(ci, /force-full: \$\{\{ github.event_name != 'pull_request' && !inputs.quick_gate \}\}/);
  assert.match(ci, /force-boot: \$\{\{ inputs.quick_gate \}\}/);
  assert.match(ci, /matrix: \$\{\{ fromJSON\(needs.prepare.outputs.matrix\) \}\}/);
  assert.match(ci, /needs: \[prepare, browser\]/);
  assert.match(ci, /test "\$BROWSER_RESULT" = success/);
  assert.match(ci, /test "\$PREPARE" = success/);
  assert.doesNotMatch(ci, /continue-on-error/); // Comments must also avoid implying that policy exists.
  assert.equal((ci.match(/run: npm test\n/g) || []).length, 1);
  assert.equal((ci.match(/run: npm run build\n/g) || []).length, 1);
});
test('runner records exact checkout and timings, attempts all shard scripts, and preserves failure', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-runner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'CI'); git('config', 'user.email', 'ci@example.invalid');
  mkdirSync(join(dir, 'tests/browser'), { recursive: true });
  writeFileSync(join(dir, 'tests/browser/weapon-loading.mjs'), 'process.exit(1)');
  writeFileSync(join(dir, 'tests/browser/weapon-models.mjs'), 'process.exit(0)');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD');
  const run = env => spawnSync(process.execPath, [new URL('../../scripts/ci-browser-run.mjs', import.meta.url).pathname, 'weapons'], { cwd: dir, env: { ...process.env, BROWSER: 'chromium', CI_MODE: 'quick', CI_SOURCE_SHA: sha, ...env }, encoding: 'utf8' });
  assert.equal(run({}).status, 1);
  const report = JSON.parse(readFileSync(join(dir, 'tests/browser/out/ci/quick-chromium-weapons.json')));
  assert.equal(report.source, sha); assert.equal(report.ok, false);
  assert.deepEqual(report.checks.map(check => check.exitCode), [1, 0]);
  assert.ok(report.checks.every(check => check.durationMs >= 0 && check.startedAt));
  assert.equal(run({ CI_SOURCE_SHA: 'wrong-head' }).status, 1);
  assert.equal(run({ SKIP_CAPTURES: '1' }).status, 1);
  assert.equal(run({ QUICK: '1' }).status, 1);
  assert.equal(run({ OFFLINE_UI: '1' }).status, 1);
  assert.equal(run({ UI_DEVICE: 'tablet' }).status, 1);
  assert.equal(run({ SMOKE_CASE: 'vrm' }).status, 1);
});

test('Pages upload depends on successful exact-source quick gate; lab publishing remains separate', () => {
  const deploy = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(deploy, /uses: \.\/\.github\/workflows\/ci.yml/);
  assert.match(deploy, /quick_gate: true/);
  assert.match(deploy, /needs: \[evidence, validate\]/);
  assert.match(deploy, /needs.validate.result == 'success'/);
  assert.match(deploy, /name: \$\{\{ needs.validate.outputs.artifact \|\| needs.evidence.outputs.artifact \}\}/);
  assert.match(deploy, /if: github.event_name == 'workflow_run'/);
  assert.doesNotMatch(deploy, /continue-on-error/);
});

function assertBounded(suites) {
  assert.ok(suites.includes('boot')); assert.ok(suites.includes('save'));
  assert.ok(suites.length < FULL_SUITES.length, JSON.stringify(suites));
}
