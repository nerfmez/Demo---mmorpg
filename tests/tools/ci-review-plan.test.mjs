import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'acorn';
import { browserPlan, FULL_SUITES, LEGACY_UI_SUITES, legacyReviewRequirements } from '../../scripts/ci-browser-plan.mjs';
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
test('every older bounded route retains its legacy UI/HUD owners in both source plans', () => {
  for (const file of ['src/ui/equipment-avatar.js', 'src/ui/menu-map.js', 'src/ui/mapimage.js',
    'src/ui/skill-journal/journal.js', 'src/ui/skill-journal/fonts/noto-thai-400.ttf',
    'tests/browser/ux.mjs', 'tests/browser/journal.mjs', 'tests/browser/workspaces.mjs']) {
    const suites = browserPlan([file]).suites, legacy = legacyReviewRequirements(file);
    assert.ok(legacy.ui, file);
    for (const suite of LEGACY_UI_SUITES) assert.ok(suites.includes(suite), `${file}: ${suite}`);
    for (const mergeTree of [tree, 'd'.repeat(40)]) {
      const plan = reviewPlan({ source, merge, sourceTree: tree, mergeTree, suites, mode: 'quick' });
      for (const suite of LEGACY_UI_SUITES) assert.ok(plan.ui.includes(suite), `${file}: ${suite}`);
      if (legacy.hud) assert.deepEqual(plan.hud, ['hud'], file);
      const required = mergeTree === tree ? suites : plan.mergeSuites;
      for (const suite of required) assert.equal(plan.matrix.include.filter(job =>
        job.source === (mergeTree === tree ? source : merge) && job.suite === suite).length, 2, `${file}: ${suite}`);
    }
  }
  assert.ok(browserPlan(['src/ui/equipment-avatar.js']).suites.includes('workspaces'), 'loadout imports equipment avatar');
  for (const file of ['src/ui/menu.js', 'src/ui/quest-journal.js', 'src/ui/fieldhud.css', 'public/assets/icons/gear/wisp_staff.png'])
    assert.ok(browserPlan([file]).suites.length < LEGACY_UI_SUITES.length, `existing focused proof: ${file}`);
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
test('equipment notice branches cannot hide migration exits or other control flow', () => {
  const prefix = 'export function migrateCharacter(ch,data){ch.version=8;const notice=equipmentNotice(ch,data);';
  const before = prefix + 'if(notice)ch.progress.equipmentNotice=notice;else delete ch.progress.equipmentNotice;ch.movementSkills=[];return ch;}';
  const failures = [
    '{ch.progress.equipmentNotice=notice;return ch;}',
    '{ch.progress.equipmentNotice=notice;throw new Error("stop");}',
    '{ch.progress.equipmentNotice=notice;while(notice)break;}',
    '{ch.progress.equipmentNotice=notice;for(;;)break;}',
    '{ch.progress.equipmentNotice=notice;do{}while(false);}',
    '{ch.progress.equipmentNotice=notice;switch(notice){case "x":break;}}',
    '{ch.progress.equipmentNotice=notice;try{}finally{return ch;}}',
    '{ch.progress.equipmentNotice=notice;label:while(notice)continue label;}',
    '{ch.progress.equipmentNotice=notice;if(notice)return ch;}',
    'ch.progress.equipmentNotice=moved.map(it=>{return ch;}).join(",")',
    'ch.progress.equipmentNotice=moved.map(it=>{throw "stop";}).join(",")',
  ];
  for (const branch of failures) {
    const after = prefix + `if(notice)${branch}${branch.startsWith('{') ? '' : ';'}else delete ch.progress.equipmentNotice;ch.movementSkills=[];return ch;}`;
    assert.doesNotThrow(() => parse(after, { ecmaVersion: 'latest', sourceType: 'module' }), branch);
    const impact = equipmentImpact('src/core/character.js', before, after);
    assert.equal(impact, null, branch);
    assert.deepEqual(browserPlan(['src/core/character.js'], { impacts: impact ? { 'src/core/character.js': impact } : {} }).suites, FULL_SUITES);
  }
  // A return in the alternate branch is equally unsafe.
  assert.equal(equipmentImpact('src/core/character.js', before,
    before.replace('else delete ch.progress.equipmentNotice;', 'else {delete ch.progress.equipmentNotice;return ch;}')), null);
  // Even pure equipment repair cannot move across other migration statements.
  assert.equal(equipmentImpact('src/core/character.js', before,
    before.replace('const notice=equipmentNotice(ch,data);', '').replace('return ch;', 'const notice=equipmentNotice(ch,data);return ch;')), null);
});
test('equipment visual state retains both exact weapon model checks in both engines', () => {
  const before = 'export function gearLook(ch,data){return {bases:["sword"]};}';
  const after = before.replace('"sword"', '"axe"');
  const suites = equipmentImpact('src/core/character.js', before, after);
  assert.ok(suites.includes('weapons'));
  const plan = reviewPlan({ source, sourceTree: tree, mergeTree: tree, suites, mode: 'quick' });
  assert.deepEqual(plan.matrix.include.filter(job => job.suite === 'weapons').map(job => job.browser), ['chromium', 'webkit']);
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
  assert.deepEqual(equipmentImpact('src/ui/art.css', before, before + '.equipment-slot.equipment-inactive{color:red}'), EQUIPMENT_SUITES);
  assert.deepEqual(equipmentImpact('src/ui/art.css', before, before + '.equipment-slot .inactive-badge{color:red}'), EQUIPMENT_SUITES);
  for (const after of [before + '.art{color:red}', before + '.equipment-inactive,.hud{color:red}', before.replace('block', 'none')])
    assert.equal(equipmentImpact('src/ui/art.css', before, after), null);
});
test('inactive-equipment text does not certify unrelated selectors or malformed rules', () => {
  const before = '.art{display:block}\n';
  for (const suffix of [
    '.skill-line-hub:not(.equipment-inactive){display:none}',
    '.skill-line-hub:has(.equipment-inactive){display:none}',
    '.equipment-inactive{display:none}',
    '.equipment-slot.equipment-inactive .skill-line-hub{display:none}',
    '.equipment-slot.equipment-inactive + .skill-line-hub{display:none}',
    '[data-class=".equipment-inactive"]{display:none}',
    '.equipment-slot.equipment-inactive-fake{display:none}',
    '.equipment-slot.equipment-inactive,.skill-line-hub{display:none}',
    '@media screen{.equipment-slot.equipment-inactive{display:none}}',
    '.equipment-slot.equipment-inactive{display:none',
    '.equipment-slot.equipment-inactive{display:none}}',
  ]) {
    const impact = equipmentImpact('src/ui/art.css', before, before + suffix);
    assert.equal(impact, null, suffix);
    assert.deepEqual(browserPlan(['src/ui/art.css'], { impacts: impact ? { 'src/ui/art.css': impact } : {} }).suites, FULL_SUITES);
  }
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
