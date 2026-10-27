// Content budgets (owner, 2026-10-27): every skill and mod is measured with the build profile when it
// is added and must sit in its class band, unless it is listed as known (awaiting a decision, with the
// reason). The known list may only shrink: a listed item that is back in its band must be removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { modFits } from '../../src/core/skills.js';
import { budgetAudit, skillValue, scoreGain } from '../../src/core/content-budget.js';

const B = data.progression.balance.budgets, level = data.progression.balance.monsterCap;
const audit = budgetAudit(data, level, (def, mod) => modFits(def, mod).ok);

test('every skill and mod is inside its budget band, or listed as known with a reason', () => {
  const newOut = [...audit.skills.filter((x) => x.out && !B.known.skills[x.id]).map((x) => `skill ${x.id} ${x.out} (${x.score.toFixed(2)})`),
    ...audit.mods.filter((x) => x.out && !B.known.mods[x.id]).map((x) => `mod ${x.id} ${x.out} (${x.best.toFixed(2)} on ${x.bestSkill})`)];
  assert.deepEqual(newOut, [], 'new content outside its budget');
  for (const [id, why] of [...Object.entries(B.known.skills), ...Object.entries(B.known.mods)]) assert.ok(why.length > 10, `${id} has a reason`);
});

test('the known list only holds items still outside their band', () => {
  const fixed = [...Object.keys(B.known.skills).filter((id) => !audit.skills.find((x) => x.id === id)?.out),
    ...Object.keys(B.known.mods).filter((id) => !audit.mods.find((x) => x.id === id)?.out)];
  assert.deepEqual(fixed, [], 'back in band: remove from progression.balance.budgets.known');
});

test('a reference main attack scores zero and a stronger copy of a skill scores higher', () => {
  assert.equal(skillValue(data, 'slash', level).score, 0);
  const meteor = data.skills.combat.meteor, strong = { ...data, skills: { ...data.skills, combat: { ...data.skills.combat, meteor: { ...meteor, damage: { ...meteor.damage, base: meteor.damage.base * 2, scale: meteor.damage.scale * 2 } } } } };
  assert.ok(skillValue(strong, 'meteor', level).score > skillValue(data, 'meteor', level).score);
  const base = { single: 100, pack: 100, survival: 10, sustain: 90, mobility: 6, team: 0, income: 1000 };
  assert.ok(Math.abs(scoreGain(data, { ...base, single: 200 }, base) - Math.log(2)) < 1e-9, 'a doubled axis counts its log, weighted');
  assert.ok(scoreGain(data, { ...base, survival: 1e6 }, base) <= 1, 'one axis running to a cap is held within 1');
});
