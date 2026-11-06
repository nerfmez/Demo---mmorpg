// The defensive line (owner, 2026-10-31; docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 12): monsters' attacks
// carry elements and statuses (data/monsters.json), and the hero answers them with element resistance and
// tenacity from gear options, Job Tree nodes and Mend and Cleanse (core/defense.js).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, derive } from '../../src/core/character.js';
import { updateMonster } from '../../src/core/ai.js';
import { RESISTS, DOTS, monsterHit } from '../../src/core/defense.js';

const M = data.monsters.monsters;
const STATUSES = new Set([...DOTS, 'chill', 'hobble', 'shock', 'root']);

const hero = () => {
  const g = new Game(data, { seed: 3 });
  g.monsters = [];
  Object.assign(g.derived, { dodgeChancePct: 0, blockChance: 0, perks: null });
  g.player.hp = g.player.maxHp = 100000;
  g.player.shield = 0;
  g.drainEvents();
  return g;
};
const foe = (type) => ({ kind: 'monster', id: 9001, type, def: M[type], x: 0, z: 3, statuses: {}, buffs: {}, dead: false });

test('every monster element and status in the data is one the rules know', () => {
  const elements = new Set([...Object.keys(RESISTS), 'physical']);
  let inflicts = 0;
  for (const [id, m] of Object.entries(M)) {
    if (m.element) assert.ok(elements.has(m.element), id);
    for (const [name, a] of Object.entries(m.attacks)) {
      if (a.element) assert.ok(elements.has(a.element), `${id}.${name}`);
      if (!a.inflict) continue;
      inflicts++;
      assert.ok(STATUSES.has(a.inflict.status), `${id}.${name} ${a.inflict.status}`);
      assert.ok(a.inflict.duration > 0 && a.inflict.chance > 0 && a.inflict.chance <= 1, `${id}.${name}`);
      if (DOTS.includes(a.inflict.status)) assert.ok(a.inflict.dpsMult > 0, `${id}.${name} dps`);
      if (a.inflict.status === 'chill' || a.inflict.status === 'hobble') assert.ok(a.inflict.slow > 0 && a.inflict.slow < 1, `${id}.${name} slow`);
    }
  }
  assert.ok(inflicts >= 10, 'monsters put statuses on the hero');
  // each region has an element to resist
  assert.equal(monsterHit(foe('marsh_wisp'), 'orb').element, 'fire');
  assert.equal(monsterHit(foe('salt_slime'), 'brine').element, 'cold');
  assert.equal(monsterHit(foe('salt_slime'), 'engulf').element, 'physical');
  assert.equal(monsterHit(foe('rune_sentinel'), 'beam').element, 'lightning');
  assert.equal(monsterHit(foe('reed_viper'), 'lash').element, 'poison');
  assert.equal(monsterHit(null, 'slam').element, 'physical');
});

test('element resistance takes its share off that element only, and is capped', () => {
  const g = hero(), wisp = foe('marsh_wisp'), boar = foe('tusk_boar');
  const plainFire = g.damagePlayer(1000, wisp, { attack: 'blink' }); // a non-hitting name keeps the monster's element
  const plainPhys = g.damagePlayer(1000, boar, { attack: 'bite' });
  g.derived.resistFirePct = 50;
  const fire = g.damagePlayer(1000, wisp, { attack: 'blink' }), phys = g.damagePlayer(1000, boar, { attack: 'bite' });
  assert.ok(Math.abs(fire - plainFire * 0.5) <= 1, `${fire} vs ${plainFire}`);
  assert.equal(phys, plainPhys);
  // the caps (data/progression.json character.caps), and resistAllPct adds to each element
  const ch = createCharacter(data);
  ch.jobNodes = [...ch.jobNodes, ...Object.keys(data.jobtree.nodes).filter((id) => data.jobtree.nodes[id].effects?.resistAllPct)];
  const d = derive(ch, data);
  const caps = data.progression.character.caps;
  for (const k of Object.values(RESISTS)) assert.ok(d[k] > 0 && d[k] <= caps[k], k);
  ch.jobNodes = [...ch.jobNodes, ...Array(40).fill(0).map((_, i) => '~r' + i)];
  const many = { ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, ...Object.fromEntries(Array(40).fill(0).map((_, i) => ['~r' + i, { effects: { resistAllPct: 10, tenacityPct: 10 } }])) } } };
  const dm = derive(ch, many);
  for (const k of Object.values(RESISTS)) assert.equal(dm[k], caps[k], k);
  assert.equal(dm.tenacityPct, caps.tenacityPct);
});

test('a monster attack puts its status on the hero: resisted by element, shortened by tenacity', () => {
  // the rune sentinel's beam always shocks; shock makes the hero take more damage
  let g = hero();
  g.damagePlayer(1000, foe('rune_sentinel'), { attack: 'beam' });
  const full = M.rune_sentinel.attacks.beam.inflict.duration;
  assert.equal(g.player.statuses.shock.t, full);
  assert.ok(g.drainEvents().some((e) => e.type === 'heroStatus' && e.status === 'shock'));
  const shocked = g.damagePlayer(1000, foe('tusk_boar'), { attack: 'bite' });
  delete g.player.statuses.shock;
  const calm = g.damagePlayer(1000, foe('tusk_boar'), { attack: 'bite' });
  assert.ok(shocked > calm * 1.1, `${shocked} vs ${calm}`);
  // tenacity shortens it
  g = hero(); g.derived.tenacityPct = 40;
  g.damagePlayer(1000, foe('rune_sentinel'), { attack: 'beam' });
  assert.ok(Math.abs(g.player.statuses.shock.t - full * 0.6) < 1e-9);
  // a full resistance never takes it (chance x (1 - resist)), and a lower one takes it less often
  g.derived.tenacityPct = 0;
  const rate = (resist) => {
    let n = 0;
    g.derived.resistLightningPct = resist;
    for (let i = 0; i < 200; i++) {
      delete g.player.statuses.shock; g.player.hp = g.player.maxHp;
      g.damagePlayer(100, foe('rune_sentinel'), { attack: 'beam' });
      if (g.player.statuses.shock) n++;
    }
    return n / 200;
  };
  assert.equal(rate(0), 1);
  assert.equal(rate(100), 0);
  const half = rate(50);
  assert.ok(half > 0.35 && half < 0.65, String(half));
});

test('dots hurt over time, never kill and end; chill slows, root stops walking; Mend and Cleanse lifts one', () => {
  const g = hero(), p = g.player;
  g.derived.resistPoisonPct = 0;
  g.rng = { chance: () => true, range: (a) => a, next: () => 0 };
  g.damagePlayer(1000, foe('reed_viper'), { attack: 'lash' });
  g.damagePlayer(1000, foe('thornback_wolf'), { attack: 'drag' }); // a bleed
  assert.ok(p.statuses.poison && p.statuses.bleed);
  p.hp = 5;
  for (let i = 0; i < 600; i++) g.tickPlayerStatuses(0.01);
  assert.equal(p.hp, 1, 'a dot alone never kills');
  assert.ok(!p.statuses.poison && !p.statuses.bleed, 'and runs out');
  // poison resistance takes its share off the dot too
  const dps = (resist) => { delete p.statuses.poison; p.hp = p.maxHp; g.derived.resistPoisonPct = resist; g.damagePlayer(1000, foe('reed_viper'), { attack: 'lash' }); return p.statuses.poison.dps; };
  assert.ok(Math.abs(dps(50) - dps(0) * 0.25) < 1e-6, 'half the hit, then half the dot'); // the hit's damage and the dot both resisted
  // root and chill
  g.damagePlayer(1000, foe('rootdigger_mole'), { attack: 'erupt' });
  assert.ok(p.statuses.root);
  p.hp = p.maxHp;
  const at = p.x;
  g.input.moveX = 1; g.input.moveZ = 0;
  g.update(0.1);
  assert.equal(p.x, at, 'rooted: no walking');
  // the cleanse list covers every status the monsters put on the hero
  const cleanse = data.skills.combat.cleanse.cleanse;
  for (const s of STATUSES) assert.ok(cleanse.includes(s), s);
});

test('monster attacks reach the rules with their names (projectiles, areas, contacts)', () => {
  const g = new Game(data, { seed: 9 });
  const m = g.monsters.find((q) => q.type === 'rune_sentinel') || g.monsters[0];
  const type = 'rune_sentinel';
  Object.assign(m, { type, def: M[type] });
  g.monsters = [m];
  g.isSafe = () => false;
  g.moveEntity = (u, dx, dz) => { u.x += dx; u.z += dz; return {}; };
  Object.assign(m, { x: 0, z: 0, homeX: 0, homeZ: 0, facing: 0, state: 'chase', stateT: 0, aggro: true, damage: 1, cd: { beam: 0, shards: 99 } });
  Object.assign(g.player, { x: 0, z: 6, hp: 1e6, maxHp: 1e6 });
  g.derived.dodgeChancePct = 0;
  const seen = [];
  const real = g.damageUnit.bind(g);
  g.damageUnit = (u, amount, src, opts) => { seen.push(opts?.attack); return real(u, amount, src, opts); };
  for (let t = 0; t < 4 && !seen.length; t += 0.01) { g.time += 0.01; updateMonster(g, m, 0.01); }
  assert.deepEqual(seen.slice(0, 1), ['beam']);
  assert.ok(g.player.statuses.shock, 'the beam shocked the hero');
  // every monster area, projectile and contact in ai.js names its attack
  const ai = readFileSync(new URL('../../src/core/ai.js', import.meta.url), 'utf8');
  for (const line of ai.split('\n').filter((l) => /spawnArea\(\{ owner: 'monster'/.test(l))) assert.match(line, /attack: /, line.trim());
  for (const line of ai.split('\n').filter((l) => /game\.damageUnit\(/.test(l))) assert.match(line, /attack: /, line.trim());
  assert.match(ai, /spawnProjectile\(\{[^}]*attack: w\.name/);
});

test('gear rolls the defensive options and the tree carries them', () => {
  const o = data.items.gearOptions;
  for (const id of ['resist_fire', 'resist_cold', 'resist_lightning', 'resist_poison', 'resist_all', 'tenacity_pct']) {
    assert.ok(o[id], id);
    assert.ok(Object.values(data.items.gearBases).some((b) => b.optionPool?.includes(id)), id + ' rolls somewhere');
  }
  const eff = Object.values(data.jobtree.nodes).map((n) => n.effects || {});
  assert.ok(eff.some((e) => e.tenacityPct > 0) && eff.some((e) => e.resistAllPct > 0));
});
