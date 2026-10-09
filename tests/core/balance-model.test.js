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
  for (const s of data.progression.skillUpgrade.steps) assert.ok(s.balanceLevel <= cap);
  // Job points from same-level kills reach the top job-tree section by the cap.
  let job = 1, exp = 0;
  for (let L = 1; L < cap; L++) {
    const m = referenceMonster(data, L);
    exp += (expToNext(data, L) / m.exp) * m.jobExp;
    while (job < data.progression.job.maxLevel && exp >= jobExpToNext(data, job)) { exp -= jobExpToNext(data, job); job++; }
  }
  const top = Math.max(...Object.values(data.jobtree.sections).map((s) => s.requiresSpent || 0));
  assert.ok((job - 1) * data.progression.job.pointsPerLevel >= top, `job Lv${job} at character Lv${cap}`);
  assert.ok(job >= data.progression.job.jobChoiceLevel);
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
    assert.equal(itemLevel, 11);
    const s = computeSkill(ch, data, d, 0);
    assert.equal(s.id, B.builds[kit].skill);
    assert.ok(s.weaponOk, kit + ' main skill fits the kit weapon');
  }
});

test('the Ranger farming line out-earns a sword hero after paying for its arrows', async () => {
  const { farmingIncome } = await import('../../src/core/balance.js');
  const F = data.progression.balance.farming;
  // The treasure line plus hunter arrows, as the game grants them (capped).
  const { lineEffects } = await import('../../src/core/balance.js');
  const line = lineEffects(data, 'line.treasure'), caps = data.progression.character.caps;
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

test('every build line can be followed independently with no mandatory filler', async () => {
  const { createCharacter, jobNodeState, allocateJobNode } = await import('../../src/core/character.js');
  const { linePath } = await import('../../src/core/balance.js');
  const lines = [...new Set(Object.values(data.jobtree.nodes).filter((n) => n.line).map((n) => n.line))];
  assert.ok(lines.length >= 9);
  const points = data.progression.job.maxLevel - 1;
  for (const id of lines) {
    const ch = createCharacter(data);
    ch.jobLevel = data.progression.job.maxLevel;
    ch.jobPoints = points;
    for (const node of linePath(data, id)) {
      if (!ch.jobPoints) break;
      const st = jobNodeState(ch, data, node);
      assert.ok(st.can, `${id}: ${node} ${st.reason}`);
      allocateJobNode(ch, data, node);
    }
    assert.equal(ch.jobPoints, 1, `${id} has 38 meaningful investments; the spare point is freely placed`);
    const left = linePath(data, id).filter((n) => !ch.jobNodes.includes(n)).length;
    assert.equal(left, 0, `${id} has a little room past the cap (${left})`);
  }
});

test('build lines only give, stay inside the caps alone, and pure lines are about equally strong', async () => {
  const { linePath, lineEffects, balanceAt } = await import('../../src/core/balance.js');
  const caps = data.progression.character.caps, lines = [...new Set(Object.values(data.jobtree.nodes).filter((n) => n.line).map((n) => n.line))];
  for (const id of lines) for (const [k, v] of Object.entries(lineEffects(data, id))) {
    assert.ok(v > 0, `${id} ${k} is a bonus, never a penalty`);
    const soft = data.progression.character.softCaps, eff = soft.stats.includes(k) && v > soft.threshold ? soft.threshold + (v - soft.threshold) * soft.overflowFactor : v;
    if (caps[k] > 0) assert.ok(eff + (k === 'critChancePct' ? data.progression.character.baseCritChancePct : 0) <= caps[k] + 1e-9, `${id} ${k} ${eff} fits its cap ${caps[k]}`);
  }
  const fits = { sword: ['damage', 'crit', 'speed', 'physical'], bow: ['damage', 'crit', 'speed', 'physical'], staff: ['damage', 'crit', 'speed', 'element'] };
  for (const [kit, list] of Object.entries(fits)) {
    const base = balanceAt(data, kit, cap).dps;
    const gains = list.map((l) => balanceAt(data, kit, cap, linePath(data, 'line.' + l).slice(0, 39)).dps / base);
    // Independent lines no longer include free-standing melee prerequisites.
    for (const [i, g] of gains.entries()) assert.ok(g >= 1.4 && g <= 2.05, `${kit} ${list[i]} line ${g.toFixed(2)}x`);
    assert.ok(Math.max(...gains) / Math.min(...gains) <= 1.45, `${kit}: no line dwarfs another (${gains.map((g) => g.toFixed(2))})`);
  }
  const guard = balanceAt(data, 'sword', cap, linePath(data, 'line.guardian').slice(0, 39)).ttd / balanceAt(data, 'sword', cap).ttd;
  assert.ok(guard >= 1.4, `the guardian line survives longer (${guard.toFixed(2)}x)`);
});

test('fast casting runs out of MP in a long fight unless MP is taken too', async () => {
  const { linePath, longFightDps } = await import('../../src/core/balance.js');
  const speed = linePath(data, 'line.speed'), mana = linePath(data, 'line.mana');
  const pure = longFightDps(data, 'staff', cap, speed.slice(0, 39));
  assert.equal(pure.manaLimited, true, 'a pure speed caster is MP-bound in a boss fight');
  const mixed = longFightDps(data, 'staff', cap, [...new Set([...speed.slice(0, 24), ...mana.filter((id) => !speed.includes(id)).slice(0, 15)])]);
  assert.ok(mixed.dps > pure.dps * 1.2, `speed with MP (${mixed.dps}) beats speed alone (${pure.dps}) in a long fight`);
});

test('each displayed line forks locally, with no bridge shortcut',()=>{
 const N=data.jobtree.nodes;
 for(const stage of data.jobtree.presentation.stages)for(const page of stage.paths.filter(p=>p.line)){
  assert.equal(new Set(page.nodes.map(id=>N[id].line)).size,1);
  for(const id of page.nodes){assert.ok(page.grid[id]);assert.ok([...N[id].requires,...N[id].requiresAny||[]].every(p=>page.nodes.includes(p)));}
  if(!page.id.endsWith('mastery'))assert.equal(N[page.nodes.find(id=>id.endsWith('.join'))].requiresAny.length,2);
 }
});
test('mixing lines that suit each other is as viable as staying pure', async () => {
  const { linePath, balanceAt } = await import('../../src/core/balance.js');
  const P = (l) => linePath(data, 'line.' + l);
  const mix = (a, b) => [...new Set([...P(a).slice(0, 20), ...P(b).filter((x) => !P(a).includes(x))])].slice(0, 39);
  const at = (kit, list) => { const base = balanceAt(data, kit, cap), r = balanceAt(data, kit, cap, list); return { dps: r.dps / base.dps, ttd: r.ttd / base.ttd }; };
  const bow = at('bow', mix('crit', 'speed'));
  assert.ok(bow.dps >= Math.min(at('bow', P('crit').slice(0, 39)).dps, at('bow', P('speed').slice(0, 39)).dps), `bow crit+speed ${bow.dps.toFixed(2)}x`);
  const tank = at('sword', mix('physical', 'guardian'));
  assert.ok(tank.dps >= 1.45 && tank.ttd >= 1.3, `sword physical+guardian ${tank.dps.toFixed(2)}x damage, ${tank.ttd.toFixed(2)}x survival`);
  assert.ok(at('staff', mix('element', 'mana')).dps >= 1.45, 'a staff can mix element with MP');
});
