import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browserPlan, FULL_SUITES } from '../../scripts/ci-browser-plan.mjs';
import { equipmentImpact, EQUIPMENT_SUITES } from '../../scripts/ci-equipment-impact.mjs';
import { reviewPlan, SCHEDULE } from '../../scripts/ci-review-plan.mjs';
import { validateEngineOwnership } from '../../scripts/ci-browser-engine.mjs';
const source = 'a'.repeat(40), merge = 'b'.repeat(40), tree = 'c'.repeat(40);

test('every tool-test workflow installs locked parser dependencies first', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/jev-context.yml', import.meta.url), 'utf8');
  const validate = workflow.split('  validate:')[1].split('  context:')[0];
  assert.ok(validate.indexOf('run: npm ci') > 0);
  assert.ok(validate.indexOf('run: npm ci') < validate.indexOf('run: node --test tests/tools/*.test.mjs'));
});

test('same-tree merge evidence has one execution per selected suite and engine', () => {
  const plan = reviewPlan({ source, merge, sourceTree: tree, mergeTree: tree, mode: 'quick', suites: FULL_SUITES });
  assert.equal(plan.source, source); assert.equal(plan.mode, 'quick'); assert.deepEqual(plan.mergeSuites, []);
  assert.equal(plan.matrix.include.length, FULL_SUITES.length * 2);
  assert.deepEqual(new Set(SCHEDULE.filter(s => FULL_SUITES.includes(s))), new Set(FULL_SUITES));
  assert.equal(new Set(plan.matrix.include.map(j => `${j.source}:${j.browser}:${j.suite}`)).size, FULL_SUITES.length * 2);
  for (let i = 0; i < plan.matrix.include.length; i += 2) {
    assert.equal(plan.matrix.include[i].browser, 'chromium'); assert.equal(plan.matrix.include[i + 1].browser, 'webkit');
    assert.equal(plan.matrix.include[i].suite, plan.matrix.include[i + 1].suite);
  }
  assert.equal(plan.matrix.include[0].suite, 'ux');
});
test('different merge tree receives its own UI/HUD evidence, including base drift', () => {
  const plan = reviewPlan({ source, merge, sourceTree: tree, mergeTree: 'd'.repeat(40), mode: 'quick',
    suites: ['boot', 'wearable'], driftSuites: ['hud'] });
  assert.equal(plan.source, merge); assert.equal(plan.mode, 'merge');
  assert.deepEqual(plan.ui, ['wearable']); assert.deepEqual(plan.hud, ['hud']);
  const second = plan.matrix.include.filter(j => j.source === merge);
  assert.equal(second.length, 4); assert.ok(second.every(j => j.mode === 'merge' && j.label === 'Merge affected'));
  assert.throws(() => reviewPlan({ source: 'wrong', sourceTree: tree, mode: 'quick', suites: [] }));
  assert.throws(() => reviewPlan({ source, sourceTree: tree, mode: 'quick', suites: ['unknown'] }));
});
test('recognized equipment functions narrow; derive, creation, migrations and unknown exports fail closed', () => {
  const original = `import { enterMap } from './maps.js'; export const VERSION=8;
    export function gearEquipState(ch,data,item){ return {ok:true}; }
    export function derive(ch,data){return ch.stats;}
    export function createCharacter(data){return {version:VERSION};}`;
  const changed = original.replace('{ok:true}', '{ok:!!item}');
  const impact = equipmentImpact('src/core/character.js', original, changed);
  assert.deepEqual(impact, EQUIPMENT_SUITES);
  assert.deepEqual(browserPlan(['src/core/character.js'], { impacts: { 'src/core/character.js': impact } }).suites, EQUIPMENT_SUITES);
  for (const other of [original.replace('return ch.stats', 'return {}'), original.replace('VERSION=8', 'VERSION=9'),
    original.replace("'./maps.js'", "'./other.js'"), original + '\nexport function unknown(){return 1;}',
    original.replace('version:VERSION', 'version:9'), '', 'invalid syntax'])
    assert.equal(equipmentImpact('src/core/character.js', original, other), null);
  assert.deepEqual(browserPlan(['src/core/character.js']).suites, FULL_SUITES, 'no before/after proof');
  assert.deepEqual(browserPlan(['src/main.js'], { impacts: {} }).suites, FULL_SUITES);
});
test('equipment notice changes cannot hide save migration or additional side effects', () => {
  const prefix = 'export function migrateCharacter(ch,data){ch.version=8;';
  const before = prefix + 'const moved=enforceEquipment(ch,data);if(moved.length)ch.progress.equipmentNotice="gear";return ch;}';
  const after = prefix + 'enforceEquipment(ch,data);const notice=equipmentNotice(ch,data);if(notice)ch.progress.equipmentNotice=notice;else delete ch.progress.equipmentNotice;return ch;}';
  assert.deepEqual(equipmentImpact('src/core/character.js', before, after), EQUIPMENT_SUITES);
  for (const changed of [after.replace('ch.version=8', 'ch.version=9'), after.replace('return ch', 'ch.gear=[];return ch'),
    after.replace('equipmentNotice=notice', 'equipmentNotice=mutateSave(ch)'), after.replace('equipmentNotice=notice', 'equipmentNotice=(ch.gold=0)')])
    assert.equal(equipmentImpact('src/core/character.js', before, changed), null);
});
test('shared panel dispatch and progression remain full except identified equipment units', () => {
  const before = `export class Panels { gearLine(it){return it;} render_bag(){return '';} onClick(t){switch(t){case 'respec-stats': repair();break;case 'respec-job':respec();break;}} }`;
  assert.deepEqual(equipmentImpact('src/ui/panels.js', before, before.replace('repair()', 'retain()')), EQUIPMENT_SUITES);
  assert.equal(equipmentImpact('src/ui/panels.js', before, before.replace('respec()', 'other()')), null);
  const progress = 'export function wearRequirements(ch,req){return req;} export function skillGrowthPreview(ch){return ch;}';
  assert.deepEqual(equipmentImpact('src/ui/progressionview.js', progress, progress.replace('return req', 'return {req}')), EQUIPMENT_SUITES);
  assert.equal(equipmentImpact('src/ui/progressionview.js', progress, progress.replace('return ch', 'return {}')), null);
});
test('shared CSS can narrow only appended inactive-equipment selectors', () => {
  const before = '.art{display:block}\n';
  assert.deepEqual(equipmentImpact('src/ui/art.css', before, before + '.equipment-inactive{color:red}'), EQUIPMENT_SUITES);
  for (const after of [before + '.art{color:red}', before + '.equipment-inactive,.hud{color:red}', before.replace('block', 'none')])
    assert.equal(equipmentImpact('src/ui/art.css', before, after), null);
});
test('PR101 legacy Chromium-only test cannot produce a passing both-engine report', () => {
  assert.throws(() => validateEngineOwnership('equipment-inactive.mjs', "import {chromium} from 'playwright'; chromium.launch();"), /WebKit/);
  assert.doesNotThrow(() => validateEngineOwnership('equipment-inactive.mjs', "import {chromium,webkit} from 'playwright'; const engine=process.env.BROWSER==='webkit'?webkit:chromium; engine.launch();"));
  assert.throws(() => validateEngineOwnership('equipment-inactive.mjs', "import {chromium,webkit} from 'playwright'; const engine=process.env.BROWSER==='webkit'?webkit:chromium; chromium.launch();"));
});
test('stable review summaries reject missing, failing, cancelled and unexpected-skipped execution', t => {
  const dir = mkdtempSync(join(tmpdir(), 'review-gate-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'CI'); git('config', 'user.email', 'ci@example.invalid');
  writeFileSync(join(dir, 'README.md'), 'fixture'); git('add', '.'); git('commit', '-qm', 'fixture');
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  for (const kind of ['UI', 'HUD']) {
    const block = ci.split(`      - name: Verify shared ${kind} evidence at head or merge tree\n`)[1].split('\n\n')[0];
    const shell = block.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    for (const PREPARE of ['failure', 'cancelled', 'skipped']) {
      const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], { cwd: dir, env: { ...process.env, PREPARE } });
      assert.notEqual(run.status, 0);
    }
    for (const BROWSER_RESULT of ['failure', 'cancelled', 'skipped', '']) {
      const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', shell], { cwd: dir, env: { ...process.env,
        PREPARE: 'success', BROWSER_RESULT, CI_SOURCE_SHA: git('rev-parse', 'HEAD'), CI_TREE: git('rev-parse', 'HEAD^{tree}'),
        CI_SUITES: '["wearable"]', GITHUB_STEP_SUMMARY: join(dir, 'summary') } });
      assert.notEqual(run.status, 0);
    }
  }
});
