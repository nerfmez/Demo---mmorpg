// LUK (owner, 2026-10-25): LUK raises crit chance, DEX raises crit damage; an older save gains LUK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { STATS, createCharacter, derive, migrateCharacter, allocateStat, respecStats } from '../../src/core/character.js';

test('LUK is a stat: it starts like the others, takes points and is refunded by a respec', () => {
  assert.ok(STATS.includes('LUK'));
  const ch = createCharacter(data);
  assert.equal(ch.stats.LUK, data.progression.character.startingStats.LUK);
  ch.statPoints = 2;
  assert.ok(allocateStat(ch, 'LUK', 2));
  assert.equal(ch.stats.LUK, data.progression.character.startingStats.LUK + 2);
  ch.gold = 1e6;
  respecStats(ch, data);
  assert.equal(ch.stats.LUK, data.progression.character.startingStats.LUK);
  assert.ok(ch.statPoints >= 2);
});

test('LUK raises crit chance only (drop find stays in the tree and gear); DEX raises crit damage, not crit chance', () => {
  const base = createCharacter(data), d0 = derive(base, data);
  const luk = createCharacter(data); luk.stats.LUK += 20;
  const dex = createCharacter(data); dex.stats.DEX += 20;
  const dl = derive(luk, data), dd = derive(dex, data);
  assert.ok(dl.critChance > d0.critChance, 'LUK: crit chance');
  assert.equal(dl.critMult, d0.critMult, 'LUK: no crit damage');
  for (const k of ['gearFindPct', 'materialFindPct', 'goldFindPct']) assert.equal(dl[k], d0[k], `LUK: no ${k} (owner)`);
  assert.ok(dd.critMult > d0.critMult, 'DEX: crit damage');
  assert.equal(dd.critChance, d0.critChance, 'DEX: no crit chance');
  assert.ok(dd.projectileDamagePct > d0.projectileDamagePct, 'DEX keeps its ranged damage');
});

test('a save from before LUK gains the starting LUK and keeps everything else', () => {
  const ch = createCharacter(data);
  ch.stats.DEX += 7; ch.statPoints = 4;
  const old = JSON.parse(JSON.stringify(ch));
  delete old.stats.LUK;
  const back = migrateCharacter(old, data);
  assert.equal(back.stats.LUK, data.progression.character.startingStats.LUK);
  assert.equal(back.stats.DEX, ch.stats.DEX);
  assert.equal(back.statPoints, 4, 'no points taken or given');
});

test('crit chance has no design cap (owner): LUK can take it past the old 40%, up to every hit', () => {
  assert.equal(data.progression.character.caps.critChancePct, undefined);
  const ch = createCharacter(data);
  ch.stats.LUK = 400;
  assert.ok(derive(ch, data).critChance > 0.4, 'past the old 40% cap');
  ch.stats.LUK = 5000;
  assert.equal(derive(ch, data).critChance, 1, 'a chance stops at 100%');
});

test('crit chance past 100% turns into crit damage at the data rate, outside the crit damage cap', () => {
  const pc = data.progression.character, rate = pc.critOverflowToMultPct;
  assert.ok(rate > 0 && rate < 1, 'a reduced rate');
  const ch = createCharacter(data);
  ch.stats.DEX = 5000; // crit damage pinned at its cap
  const capped = derive(ch, data);
  assert.equal(capped.critMultPct, pc.caps.critMultPct);
  ch.stats.LUK = 5000;
  const d = derive(ch, data), over = d.critChancePct - 100;
  assert.equal(d.critChance, 1);
  assert.ok(over > 0);
  assert.ok(Math.abs(d.critMult - pc.critMult * (1 + (pc.caps.critMultPct + over * rate) / 100)) < 1e-9, 'the overflow adds on top of the capped crit damage');
  const under = createCharacter(data); under.stats.LUK = 10;
  assert.equal(derive(under, data).critOverflowPct, 0, 'nothing below 100%');
});
