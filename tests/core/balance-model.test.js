import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { balanceReport, referenceMonster, balanceAt, referenceHero } from '../../src/core/balance.js';
import { expToNext, jobExpToNext } from '../../src/core/character.js';
import { computeSkill } from '../../src/core/skills.js';
import { questObjectives } from '../../src/core/quests.js';

const B = data.progression.balance, cap = B.monsterCap;
const report = balanceReport(data);

test('every kit kills a same-level monster in a few seconds and survives a stand-up fight, at every level', () => {
  const [kLo, kHi] = B.targets.ttk, [dLo, dHi] = B.targets.ttd;
  for (const r of report.rows) {
    assert.ok(r.ttk >= kLo && r.ttk <= kHi, `${r.kit} Lv${r.level} time to kill ${r.ttk}s`);
    assert.ok(r.ttd >= dLo && r.ttd <= dHi, `${r.kit} Lv${r.level} time to die ${r.ttd}s`);
  }
});

test('reaching the monster cap takes the target playtime, and later levels take longer', () => {
  const [lo, hi] = B.targets.hoursToCap;
  for (const [kit, h] of Object.entries(report.hours)) assert.ok(h >= lo && h <= hi, `${kit}: ${h} h to Lv${cap}`);
  for (const kit of Object.keys(B.builds)) {
    const mins = report.rows.filter((r) => r.kit === kit && r.level < cap).map((r) => r.minutes);
    assert.ok(mins[cap - 2] > 5 * mins[4], `${kit}: late levels are much slower than early ones`);
  }
  assert.ok(data.progression.character.maxLevel > cap, 'character levels continue past the monster cap');
});

test('monster and quest recommendations stay within the cap; main combat difficulty rises', () => {
  for (const map of Object.values(data.maps)) {
    for (const z of map.zones) if (!z.safe) assert.ok(z.level >= 1 && z.level <= cap, `${map.id}/${z.id}`);
    for (const s of map.spawns) {
      const z = map.zones.find((q) => q.id === s.zone);
      assert.ok(s.level[0] >= z.level && s.level[1] <= cap && s.level[0] <= s.level[1], `${map.id} ${s.monster}@${s.zone} ${s.level}`);
    }
    for (const b of map.bosses || []) assert.ok(b.level <= cap, b.monster);
  }
  const levels = data.quests.main.map((id) => data.quests.quests[id].level);
  for (const id of [...data.quests.main, ...data.quests.side]) {
    const level = data.quests.quests[id].level;
    assert.ok(Number.isInteger(level) && level >= 1 && level <= cap, `${id} recommended level ${level}`);
  }
  // A safe town/craft stop can follow a harder fight; recommendations describe
  // the objective difficulty, not a level gate for the narrative sequence.
  const combat = data.quests.main.filter(id => questObjectives(data.quests.quests[id]).some(o => o.type === 'kill'));
  assert.ok(combat.length >= 2, 'the journey retains a rising combat path');
  for (let i = 1; i < combat.length; i++) assert.ok(data.quests.quests[combat[i]].level >= data.quests.quests[combat[i - 1]].level, `main combat quest ${combat[i]} level ${data.quests.quests[combat[i]].level}`);
  assert.equal(levels.at(-1), cap, 'the last main quest is at the cap');
});

test('bosses are long, readable fights at their level', () => {
  for (const map of Object.values(data.maps)) for (const b of map.bosses || []) {
    const def = data.monsters.monsters[b.monster], sc = data.progression.monsterScaling;
    const hp = def.hp * (1 + sc.hpPerLevel * (b.level - 1));
    for (const kit of Object.keys(B.builds)) {
      const r = balanceAt(data, kit, b.level), seconds = hp / r.dps;
      assert.ok(seconds >= 30 && seconds <= 150, `${b.monster} Lv${b.level} vs ${kit}: ${Math.round(seconds)} s`);
    }
  }
});

test('skill and mod rank gates, and the job tree, are reachable within the monster cap', () => {
  // a skill levels with the character, up to maxLevel: every mod socket step is reachable by the cap
  assert.ok(data.mods.slotLevels.every((L) => L <= cap) && data.progression.skillUpgrade.maxLevel >= cap);
  // the wheel tree (phase C): same-level kills bring the job choice (Job Lv 40) by the monster cap, and the
  // job's last point (Job Lv 70) by the character's top level, still fighting cap monsters past the cap
  let job = 1, exp = 0, atCap = 0;
  for (let L = 1; L < data.progression.character.maxLevel; L++) {
    const m = referenceMonster(data, Math.min(L, cap));
    exp += (expToNext(data, L) / m.exp) * m.jobExp;
    while (job < data.progression.job.maxLevel && exp >= jobExpToNext(data, job)) { exp -= jobExpToNext(data, job); job++; }
    if (L + 1 === cap) atCap = job;
  }
  assert.ok(atCap >= data.progression.job.jobChoiceLevel, `job Lv${atCap} at character Lv${cap}: the job choice is in reach`);
  assert.equal(job, data.progression.job.maxLevel, 'the whole job line by the top character level');
});

test('quest rewards are a share of a level at the quest level', () => {
  for (const id of [...data.quests.main, ...data.quests.side]) {
    const q = data.quests.quests[id], need = expToNext(data, q.level);
    assert.ok(Number.isInteger(q.level), id);
    assert.ok(q.reward.exp >= need * 0.15 && q.reward.exp <= need * 0.5, `${id}: ${q.reward.exp} of ${need}`);
  }
});

test('the reference hero is built from real rules: its main skill and the expected gear tier', () => {
  for (const kit of Object.keys(B.builds)) {
    const { ch, d, itemLevel } = referenceHero(data, kit, 12);
    assert.equal(itemLevel, 12, 'a piece found at the hero\'s own level (items.gearLevels)');
    const s = computeSkill(ch, data, d, 0);
    assert.equal(s.id, B.builds[kit].skill);
    assert.ok(s.weaponOk, kit + ' main skill fits the kit weapon');
  }
});

test('a farming hunter out-earns a sword hero after paying for its arrows', async () => {
  const { farmingIncome } = await import('../../src/core/balance.js');
  const F = data.progression.balance.farming;
  // The Hunter's forager branch plus hunter arrows, as the game grants them (capped)
  const caps = data.progression.character.caps, line = {};
  for (const [id, n] of Object.entries(data.jobtree.nodes)) if (id.startsWith('job.hunter.forager.')) for (const [k, v] of Object.entries(n.effects || {})) line[k] = (line[k] || 0) + v;
  for (const k of ['goldFindPct', 'materialFindPct', 'gearFindPct']) {
    const sum = Math.min(caps[k], (line[k] || 0) + (data.items.arrows.types.hunter_arrow.stats[k] || 0));
    assert.ok(Math.abs(sum - F.find[k]) < 0.05, `${k}: the model uses what the game grants (${sum})`);
  }
  for (const level of [8, 14, 20, 24]) {
    const sword = farmingIncome(data, 'sword', level);
    const farmer = farmingIncome(data, 'bow', level, F.find, data.recipes.recipes[F.arrow]);
    const plain = farmingIncome(data, 'bow', level, {}, data.recipes.recipes[F.plainArrow]);
    const ratio = farmer.net / sword.net, share = farmer.arrows / farmer.gross;
    assert.ok(ratio >= F.netOverSword[0] && ratio <= F.netOverSword[1], `Lv${level} farmer/sword net ${ratio.toFixed(2)}`);
    assert.ok(share >= F.arrowShare[0] && share <= F.arrowShare[1], `Lv${level} arrow share ${share.toFixed(2)}`);
    assert.ok(plain.arrows / plain.gross < F.arrowShare[1], 'plain arrows stay a minor cost');
  }
});

test('fast casting runs out of MP in a long fight unless MP is taken too', async () => {
  const { longFightDps } = await import('../../src/core/balance.js');
  const N = data.jobtree.nodes, MP = ['maxMpPct', 'mpRegenPct', 'mpOnHit', 'manaCostReductionPct'];
  const speed = Object.keys(N).filter((id) => N[id].effects?.hastePct > 0 && !MP.some((k) => N[id].effects[k]));
  const mana = Object.keys(N).filter((id) => MP.some((k) => N[id].effects?.[k] > 0) && !N[id].effects.hastePct);
  const pure = longFightDps(data, 'staff', cap, speed.slice(0, 39));
  assert.equal(pure.manaLimited, true, 'a pure speed caster is MP-bound in a boss fight');
  const mixed = longFightDps(data, 'staff', cap, [...speed.slice(0, 24), ...mana.slice(0, 15)]);
  // every main attack lasts on regeneration at the reference pace (content-budget.test.js), so only
  // the extra speed runs dry: MP still pays, by less than when the main attack itself overspent, and
  // less again since base MP regeneration grows a little with level (owner, 2026-10-29); at the Lv40 cap
  // (levels stretched 1.625x, the per-level regen with them) the margin is small: still a gain, reported
  assert.ok(mixed.dps > pure.dps * 1.02, `speed with MP (${mixed.dps}) beats speed alone (${pure.dps}) in a long fight`);
});
// the wheel's builds (overpowered, no weakness, roles, budget): tests/core/build-rules.test.js
