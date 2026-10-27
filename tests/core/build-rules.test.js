// Build balance rules (owner, 2026-10-27): balance is a profile on several axes, not one DPS number.
// Standing out in a build's own role is intended; overpowered means a build gives up nothing for it
// (it dominates a build of another role that leads its axis, or it has no weakness at all).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { linePath } from '../../src/core/balance.js';
import { AXES, buildProfile, gearSetStats, packTargets, dominates, auditBuilds } from '../../src/core/build-rules.js';

const R = data.progression.balance.rules, cap = data.progression.balance.monsterCap;
const P = (o) => ({ axes: Object.fromEntries(AXES.map((k) => [k, o[k] ?? 1])) });

test('dominance needs every axis at least as good and one clearly better', () => {
  assert.equal(dominates(P({ single: 2 }), P({}), R.tolerance), true);
  assert.equal(dominates(P({ single: 2, survival: 0.5 }), P({}), R.tolerance), false, 'a trade is not dominance');
  assert.equal(dominates(P({ single: 1.01 }), P({}), R.tolerance), false, 'within tolerance is a tie');
});

test('the audit tells overpowered from a poor choice, finds builds with no weakness and roles that miss', () => {
  const field = [
    { id: 'tank', role: 'survival', profile: P({ survival: 3, single: 0.5 }) },
    { id: 'dps', role: 'single', profile: P({ single: 3, survival: 0.5 }) },
    { id: 'cheat', role: 'single', profile: P({ single: 3.2, survival: 3.1 }) }, // beats the tank at its own job
    { id: 'idle', role: 'sustain', profile: P({ single: 0.5, survival: 0.5 }) }, // leads nothing
  ];
  const a = auditBuilds(data, field);
  assert.ok(a.overpowered.some(([w, l]) => w === 'cheat' && l === 'tank'), 'beating a specialist on every axis is overpowered');
  assert.ok(a.traps.some(([w, l]) => w === 'cheat' && l === 'dps'), 'beating a same-role build only marks the loser');
  assert.ok(a.traps.some(([, l]) => l === 'idle'), 'a build that leads nothing is a poor choice, not a victim');
  assert.deepEqual(a.noWeakness, ['cheat']);
  assert.ok(a.roleMisses.some((m) => m.id === 'tank' && m.leader === 'cheat'));
  assert.ok(a.roleMisses.some((m) => m.id === 'idle'));
});

test('a profile reads the build: gear sets shift damage and survival, shapes reach packs, support helps the team', () => {
  const at = (kit, gear, jobNodes = [], support = []) => buildProfile(data, { kit, level: cap, jobNodes, gear, support }).axes;
  for (const kit of ['sword', 'bow', 'staff']) {
    const off = at(kit, 'offense'), def = at(kit, 'defense');
    assert.ok(off.single > def.single && def.survival > off.survival, `${kit}: offense hits harder, defense lasts longer`);
  }
  assert.ok(!gearSetStats(data, 'offense', data.skills.combat.slash).spellDamagePct, 'a sword gains nothing from spell damage options');
  const s = (id, extra = {}) => ({ kind: data.skills.combat[id].kind, range: data.skills.combat[id].range, radius: data.skills.combat[id].radius, arc: data.skills.combat[id].arc, ...extra });
  assert.ok(packTargets(s('slash'), R.pack) > packTargets(s('hunter_shot'), R.pack), 'an arc reaches more of a pack than a single arrow');
  assert.ok(packTargets(s('hunter_shot', { pierce: 2 }), R.pack) === 3, 'pierce carries an arrow through the pack');
  assert.ok(at('sword', 'mixed', [], ['war_cry']).team > 0 && at('sword', 'mixed', [], ['healing_spring']).team > 0);
  assert.equal(at('sword', 'mixed').team, 0);
});

test('the Job Tree as it is: no build is overpowered and every build has a weakness; lines lead their roles', () => {
  const ROLE = { damage: 'single', crit: 'single', speed: 'single', physical: 'single', element: 'single', guardian: 'survival', mana: 'sustain', agility: 'mobility', treasure: 'income' };
  for (const kit of ['sword', 'bow', 'staff']) {
    const builds = [];
    for (const [line, role] of Object.entries(ROLE)) for (const gear of Object.keys(R.gearSets)) {
      builds.push({ id: `${line}/${gear}`, group: line, role, profile: buildProfile(data, { kit, level: cap, jobNodes: linePath(data, 'line.' + line).slice(0, 39), gear }) });
    }
    const a = auditBuilds(data, builds);
    assert.deepEqual(a.overpowered, [], `${kit}: overpowered ${JSON.stringify(a.overpowered)}`);
    assert.deepEqual(a.noWeakness, [], `${kit}: no weakness ${a.noWeakness}`);
    for (const role of ['survival', 'mobility', 'income']) assert.ok(!a.roleMisses.some((m) => m.role === role), `${kit}: the ${role} line leads it`);
  }
});
