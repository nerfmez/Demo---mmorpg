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

test('LUK raises crit chance (and, since the owner\'s later call, a small drop find, no gold); DEX raises crit damage, not crit chance', () => {
  const base = createCharacter(data), d0 = derive(base, data);
  const luk = createCharacter(data); luk.stats.LUK += 20;
  const dex = createCharacter(data); dex.stats.DEX += 20;
  const dl = derive(luk, data), dd = derive(dex, data);
  assert.ok(dl.critChance > d0.critChance, 'LUK: crit chance');
  assert.equal(dl.critMult, d0.critMult, 'LUK: no crit damage');
  assert.equal(dl.goldFindPct, d0.goldFindPct, 'LUK: no gold find');
  assert.ok(dl.gearFindPct - d0.gearFindPct <= 20 * 0.05, 'LUK: only a small gear find');
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

test('STR gives attack, some HP (a third of VIT\'s) and a little melee damage (owner)', () => {
  const per = data.progression.character.perStat.STR, base = data.progression.character.base;
  assert.ok(per.attack > 0 && per.meleeDamagePct > 0);
  assert.ok(Math.abs(per.maxHp - base.hpPerVit / 3) < 1, 'about a third of VIT\'s HP');
  const a = createCharacter(data), b = createCharacter(data); b.stats.STR += 10;
  const da = derive(a, data), db = derive(b, data);
  assert.ok(db.maxHp > da.maxHp && db.meleeDamagePct > da.meleeDamagePct && db.attack > da.attack);
  const v = createCharacter(data); v.stats.VIT += 10;
  assert.ok(derive(v, data).maxHp - da.maxHp > db.maxHp - da.maxHp, 'VIT stays the HP stat');
});

test('LUK: a lucky dodge capped at its limit, a small drop find, no dodge against damage over time', async () => {
  const { LearnedGame } = await import('./helpers.js');
  const per = data.progression.character.perStat.LUK, cap = data.progression.character.caps.dodgeChancePct;
  assert.ok(per.dodgeChancePct > 0 && per.gearFindPct > 0 && per.gearFindPct <= 0.05 && per.materialFindPct <= 0.05, 'drops only a little');
  const ch = createCharacter(data); ch.stats.LUK = 100000;
  assert.equal(derive(ch, data).dodgeChancePct, cap, 'capped');
  const g = new LearnedGame(data, { seed: 3 });
  g.ch.stats.LUK = 100000; g.refresh();
  const hp = g.player.hp; g.drainEvents();
  let dodged = 0;
  for (let i = 0; i < 400; i++) { if (g.damagePlayer(1, { x: g.player.x + 1, z: g.player.z }) === 0) dodged++; g.player.hp = hp; }
  assert.ok(dodged > 400 * cap / 100 * 0.5 && dodged < 400 * cap / 100 * 1.7, `about ${cap}% dodged: ${dodged}/400`);
  assert.ok(g.drainEvents().some((e) => e.type === 'dodge' && e.lucky));
  let dotDodged = 0;
  for (let i = 0; i < 200; i++) { if (g.damagePlayer(1, null, { dot: true }) === 0) dotDodged++; g.player.hp = hp; }
  assert.equal(dotDodged, 0, 'damage over time is never dodged');
});

test('the lucky dodge rolls on its own stream: a hero without it gets the same main rolls', async () => {
  const { LearnedGame } = await import('./helpers.js');
  const a = new LearnedGame(data, { seed: 11 }), b = new LearnedGame(data, { seed: 11 });
  b.ch.stats.LUK = 500; b.refresh();
  for (let i = 0; i < 20; i++) { a.damagePlayer(1, { x: 0, z: 0 }); b.damagePlayer(1, { x: 0, z: 0 }); a.player.hp = a.player.maxHp; b.player.hp = b.player.maxHp; }
  assert.equal(a.rng.next(), b.rng.next(), 'the main RNG is untouched by dodge rolls');
});
