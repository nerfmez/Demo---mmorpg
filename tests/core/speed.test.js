// Speed (owner, 2026-10-27): the cooldown and cast-speed bonuses became one speed stat (hastePct).
// Cooldown and cast time divide by 1 + speed/100, so each point adds the same casts per second; base
// cooldowns grew 1.6x (damage, heal and MP per cast with them) and the cap (200) keeps the fastest
// tempo where it was. Speed follows the same soft cap as damage % so a speed build and a damage build
// spending alike stay close; buffs can never be kept up forever, even at the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { createCharacter, derive, migrateCharacter } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';

const caps = data.progression.character.caps, soft = data.progression.character.softCaps;
const combat = data.skills.combat;

test('one speed stat: cooldown and cast time divide by 1 + speed/100; the old bonuses are gone', () => {
  for (const k of ['cooldownPct', 'castSpeedPct']) assert.equal(caps[k], undefined, `${k} retired`);
  assert.equal(caps.hastePct, 200);
  assert.ok(soft.stats.includes('hastePct'), 'the same soft cap as damage %');
  const ch = createCharacter(data, { kit: 'sword' });
  ch.skills.slash = 1;
  ch.slots[0] = { skill: 'slash', mods: [] };
  const d = derive(ch, data);
  for (const h of [0, 50, 200]) {
    const s = computeSkill(ch, data, { ...d, hastePct: h }, 0);
    assert.ok(Math.abs(s.cooldown - combat.slash.cooldown / (1 + h / 100)) < 1e-9);
    assert.ok(Math.abs(s.castTime - combat.slash.castTime / (1 + h / 100)) < 1e-9);
  }
  // at the cap the fastest swing is what it was before the change (0.5 s x 0.75 / 1.4)
  const fastest = computeSkill(ch, data, { ...d, hastePct: caps.hastePct }, 0).cooldown;
  assert.ok(Math.abs(fastest - 0.5 * 0.75 / 1.4) < 0.01, `fastest swing ${fastest.toFixed(3)} s`);
  // AGI gives speed
  ch.stats.AGI += 10;
  assert.ok(derive(ch, data).hastePct > d.hastePct);
});

test('speed follows the damage soft cap: past the threshold each point counts half, up to the cap', () => {
  const ch = createCharacter(data, { kit: 'sword' });
  ch.stats = { STR: 0, AGI: 0, VIT: 0, INT: 0, DEX: 0, LUK: 0 };
  const per = data.progression.character.perStat.AGI.hastePct;
  const at = (raw) => { ch.stats.AGI = raw / per; return derive(ch, data).hastePct; };
  assert.ok(Math.abs(at(soft.threshold) - soft.threshold) < 1e-6);
  assert.ok(Math.abs(at(soft.threshold + 40) - (soft.threshold + 40 * soft.overflowFactor)) < 1e-6);
  assert.equal(at(1000), caps.hastePct);
});

test('base cooldowns are 1.6x longer and damage per cast grew alike; a speed node is worth about a damage node', () => {
  assert.equal(combat.slash.cooldown, 0.8);
  assert.equal(combat.meteor.cooldown, 16);
  const nodes = Object.values(data.jobtree.nodes).map((n) => n.effects || {});
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const speed = median(nodes.filter((e) => e.hastePct).map((e) => e.hastePct));
  const damage = median(nodes.flatMap((e) => Object.entries(e).filter(([k]) => k === 'damagePct' || k.endsWith('DamagePct')).map(([, v]) => v)));
  // each speed point is one more cast in a hundred, each damage point one more hit in a hundred; speed
  // costs MP for every extra cast, so its nodes may be a little richer, never far richer
  assert.ok(speed >= damage * 0.75 && speed <= damage * 1.6, `speed node ${speed} vs damage node ${damage}`);
});

test('no buff, barrier or zone can be kept up forever, even at the speed cap', () => {
  const fastest = (s) => s.cooldown / (1 + caps.hastePct / 100);
  for (const [id, s] of Object.entries(combat)) {
    if (!s.duration || s.kind === 'aura') continue;
    assert.ok(s.duration <= 0.9 * fastest(s), `${id}: lasts ${s.duration} s, back every ${fastest(s).toFixed(1)} s at the cap`);
  }
});

test('an old cooldown roll on saved gear becomes speed (x3) once; a new roll is left alone', () => {
  const ch = createCharacter(data, { kit: 'sword' });
  const item = ch.gear[0];
  item.options = [{ id: 'cdr_pct', value: 4 }];
  const once = migrateCharacter(JSON.parse(JSON.stringify(ch)), data);
  assert.equal(once.gear[0].options[0].value, 12);
  const twice = migrateCharacter(JSON.parse(JSON.stringify(once)), data);
  assert.equal(twice.gear[0].options[0].value, 12, 'idempotent');
  const opt = data.items.gearOptions.cdr_pct;
  assert.equal(opt.stat, 'hastePct');
  assert.ok(opt.min === 6 && opt.max === 15);
});
