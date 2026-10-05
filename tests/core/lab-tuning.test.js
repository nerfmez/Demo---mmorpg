import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LabTuning, fieldsFor, STORAGE_KEY } from '../../src/lab/tuning.js';
const skills = JSON.parse(readFileSync(new URL('../../data/skills.json', import.meta.url)));
const fx = JSON.parse(readFileSync(new URL('../../data/combat-fx.json', import.meta.url)));
const memory = () => { const values = new Map(); return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) }; };
test('melee kinds receive shared phase controls and independent overrides', () => {
  const store=new LabTuning(skills,fx);
  assert.equal(store.get('slash').fx.renderer,'melee');
  assert(store.get('slash').fields.some(f=>f.path.join('.')==='fx.swing.width'));
  store.set('slash',['fx','swing','width'],.36);
  assert.equal(store.get('whirl_blade').fx.swing.width,fx.skills.whirl_blade.swing.width);
  store.set('slash',['replay','arc'],1000);assert.equal(store.get('slash').def.arc,360);
  assert.equal(fx.meleeDefaults.swing.width,.22);
});
test('Lab edits and resets stay isolated by skill and never mutate authored data', () => {
  const store = new LabTuning(skills, fx);
  store.set('firebolt', ['fx', 'projectile', 'flowSpeed'], 27);
  store.set('firebolt', ['replay', 'speed'], 6);
  store.set('hunter_shot', ['fx', 'projectile', 'scale'], 2);
  assert.equal(store.get('firebolt').def.speed, 6);
  assert.equal(skills.combat.firebolt.speed, 9);
  assert.equal(fx.skills.firebolt.projectile.flowSpeed, 18);
  store.reset('firebolt', ['fx', 'projectile']);
  assert.equal(store.get('firebolt').fx.projectile.flowSpeed, 18);
  assert.equal(store.get('firebolt').def.speed, 6);
  assert.equal(store.get('hunter_shot').fx.projectile.scale, 2);
  store.reset('firebolt'); assert.equal(store.get('firebolt').def.speed, 9);
});
test('new authored parameters become controls without a skill-specific menu', () => {
  const future = structuredClone(fx);
  future.skills.hunter_shot = { renderer: 'sprite', ...structuredClone(fx.projectileDefaults), impact: { ...fx.projectileDefaults.impact, curlAmount: 0.4 } };
  const store = new LabTuning(skills, future);
  assert(store.get('hunter_shot').fields.some((f) => f.path.join('.') === 'fx.impact.curlAmount'));
  assert(fieldsFor({ a: [0.2, 0.4], color: '#ff9900' }).length === 3);
  assert(store.set('hunter_shot', ['fx', 'impact', 'curlAmount'], 0.8));
});
test('imports reject unsupported fields and non-finite data before reaching shaders', () => {
  const store = new LabTuning(skills, fx);
  store.import({ version: 1, skill: 'firebolt', patch: { fx: { projectile: { width: 0, flowSpeed: NaN, unknown: 12 }, colors: { rim: 'invalid' } }, replay: { speed: -10, damage: 999 } } });
  assert.equal(store.get('firebolt').fx.projectile.width, 0.01);
  assert.equal(store.get('firebolt').fx.projectile.flowSpeed, 18);
  assert.equal(store.get('firebolt').fx.colors.rim, fx.skills.firebolt.colors.rim);
  assert.equal(store.get('firebolt').def.speed, 0.1); // speed's step keeps a nonzero replay velocity
  assert.equal(store.get('firebolt').def.damage.base, 10);
  assert.throws(() => store.import({ version: 1, skill: '__proto__', patch: {} }));
  assert.throws(() => store.get('__proto__'));
});
test('reload, export/import and changed authored baselines preserve safe per-skill state', () => {
  const storage = memory(); const a = new LabTuning(skills, fx, storage);
  a.set('firebolt', ['fx', 'impact', 'embers'], 22); a.save('firebolt');
  const b = new LabTuning(skills, fx, storage); assert.equal(b.get('firebolt').fx.impact.embers, 22);
  const c = new LabTuning(skills, fx); c.import(a.export('firebolt')); assert.equal(c.get('firebolt').fx.impact.embers, 22);
  const newer = structuredClone(fx); newer.skills.firebolt.impact.embers = 12;
  assert.equal(new LabTuning(skills, newer, storage).get('firebolt').fx.impact.embers, 12);
  storage.setItem(STORAGE_KEY, '{broken'); assert.equal(new LabTuning(skills, fx, storage).get('firebolt').fx.impact.embers, fx.skills.firebolt.impact.embers);
});

test('physical skill profiles generate their own shared phases and counts safely', () => {
  const store = new LabTuning(skills, fx);
  for (const [id, phase, field] of [['hunter_shot','projectile','trailWidth'],['stone_burst','cast','boundaryOpacity'],['spirit_wolf','attack','width']]) {
    const e = store.get(id);
    assert(e.fx._labPhases[phase]); assert(e.fields.some(f => f.path.join('.') === 'fx.' + phase + '.' + field));
  }
  assert.equal(store.set('stone_burst', ['fx','burst','rocks'], 3.6), false);
  assert(!store.get('stone_burst').fields.some(f => f.path.join('.') === 'fx.cast.crackWidth'));
  assert.equal(store.get('stone_burst').fx.burst.rocks, 7);
  store.reset('stone_burst'); assert.equal(store.get('stone_burst').fx.burst.rocks, 7);
  assert.equal(store.get('slash').fx.swing.width, fx.skills.slash.swing.width);
  const future = structuredClone(fx); delete future.skills.slash; delete future.skills.whirl_blade;
  const fallback = new LabTuning(skills, future); fallback.set('slash', ['fx','swing','width'], .4);
  assert.equal(fallback.get('whirl_blade').fx.swing.width, future.meleeDefaults.swing.width);
});
