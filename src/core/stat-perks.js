/**
 * Stat thresholds (owner, 2026-10-29): 50/100/150/200 total points in a stat (trained + Job Tree +
 * gear in use) unlock a perk that changes how the hero plays, not just a number. Every perk's numbers
 * and text live in data/progression.json `statPerks`; this module is the rules. The game calls the
 * hooks below at fixed points (a player hit, a cast, a movement skill, a hit taken, a kill) and they
 * read `game.derived.perks`, the perks in effect (derive()).
 *
 * Perk rolls use `game.perkRng`, a stream of their own, so unlocking a perk changes no other seeded roll.
 */
import { dist } from './math.js';
import { manaLimit } from './frontier-content.js';

export const PERK_STATS = ['STR', 'AGI', 'DEX', 'LUK', 'INT', 'VIT'];

/** The perks a character's stat totals unlock, as { id: perk data }. */
export function activePerks(data, stats) {
  const all = data.progression.statPerks;
  const out = {};
  if (!all) return out;
  for (const s of PERK_STATS) for (const p of all[s] || []) if ((stats[s] || 0) >= p.at) out[p.id] = p;
  return out;
}

/** Every perk with the stat it belongs to and whether it is unlocked (the stats page). */
export function perkList(data, stats) {
  const all = data.progression.statPerks || {};
  return PERK_STATS.map((stat) => ({ stat, have: stats[stat] || 0, perks: (all[stat] || []).map((p) => ({ ...p, active: (stats[stat] || 0) >= p.at })) }));
}

const has = (tags, t) => !!tags && (tags instanceof Set ? tags.has(t) : tags.includes(t));
const perk = (g, id) => g.derived.perks?.[id];

/** The hero's perk timers and counters (kept on the player, made on first use). */
function state(g) {
  return (g.player.perk ||= { swings: 0, casts: 0, focusId: null, focusHits: 0, grazeReady: 0, shadowUntil: -1, invUntil: -1, escapeReady: 0, undyingReady: 0, ironReady: 0, refunds: {} });
}

/**
 * A skill goes off (not a repeat, echo or trigger): STR counts attacks of every kind (melee, arrows,
 * spells) and every Nth is heavy. Returns the skill to run: a heavy one is a copy marked `perkHeavy`,
 * so its projectiles and areas carry the mark to wherever they land.
 */
export function perkSkillStart(g, s, counted) {
  const heavy = perk(g, 'str_heavy');
  if (!counted || !heavy || !has(s.tags, 'Damage')) return s;
  const st = state(g);
  st.swings++;
  if (st.swings < (perk(g, 'str_titan')?.every || heavy.every)) return s;
  st.swings = 0;
  g.emit({ type: 'perk', id: heavy.id, x: g.player.x, z: g.player.z });
  return { ...s, perkHeavy: true };
}

/**
 * A hit from the hero's own skill, before crit and defense. Returns { mult, crit, critMult, stagger,
 * bossStagger } for hitMonster.
 */
export function perkHit(g, m, opts, crit) {
  const p = g.player, st = state(g);
  let mult = 1, critMult = 1, stagger = 0, bossStagger = 0;
  const h = opts.heavy && perk(g, 'str_heavy'); // an arrow in flight keeps its mark; the perk may be gone by then
  if (h) {
    mult *= h.mult;
    stagger = h.stagger;
    bossStagger = perk(g, 'str_titan')?.bossStagger || 0;
  }
  if (perk(g, 'str_crush') && m.staggerT > 0) mult *= perk(g, 'str_crush').mult;
  const shadow = perk(g, 'agi_shadow');
  if (shadow && g.time <= st.shadowUntil) {
    mult *= shadow.mult;
    st.shadowUntil = -1;
  }
  // DEX 150: hits on the hero's target grow while it stays the same target
  const focus150 = perk(g, 'dex_focus');
  if (focus150 && m.id === p.targetId) {
    if (st.focusId !== m.id) { st.focusId = m.id; st.focusHits = 0; }
    mult *= 1 + Math.min(focus150.max, focus150.perHit * st.focusHits);
    st.focusHits++;
  }
  const focus = perk(g, 'int_focus');
  if (focus && p.mp >= (p.maxMp * focus.mpPct) / 100) mult *= focus.mult;
  if (crit) {
    const mark = perk(g, 'dex_mark');
    if (mark && m.perkMarks) critMult *= 1 + mark.perStack * m.perkMarks;
    const jack = perk(g, 'luk_jackpot');
    if (jack && g.perkRng.chance(jack.chance)) {
      critMult *= jack.mult;
      g.emit({ type: 'perk', id: jack.id, x: m.x, z: m.z });
    }
  }
  return { mult, crit, critMult, stagger, bossStagger, penetrate: perk(g, 'dex_armor')?.penetrate || 0 };
}

/** After the hero's own hit landed: DEX marks, STR's shockwave, INT's mana return. */
export function perkAfterHit(g, m, dmg, opts, crit) {
  const p = g.player, st = state(g);
  const mark = perk(g, 'dex_mark');
  if (mark && crit) m.perkMarks = Math.min(mark.stacks, (m.perkMarks || 0) + 1);
  const ret = st.refunds[opts.skill];
  if (ret) {
    delete st.refunds[opts.skill];
    p.mp = Math.min(manaLimit(g), p.mp + ret);
  }
  const quake = perk(g, 'str_quake');
  if (quake && crit) {
    g.emit({ type: 'perk', id: quake.id, x: m.x, z: m.z, radius: quake.radius });
    for (const o of g.monsters) {
      if (o === m || o.dead || o.targetable === false || dist(o.x, o.z, m.x, m.z) - o.r > quake.radius) continue;
      g.hitMonster(o, dmg * quake.share, { element: 'physical', secondary: true, fromX: m.x, fromZ: m.z });
    }
  }
}

/** A cast was paid for (castSlot): INT readies the mana return and every Nth is free, LUK may reset the cooldown. */
export function perkCast(g, s, i, paid) {
  if (!g.derived.perks) return;
  const p = g.player, st = state(g);
  const ret = perk(g, 'int_return');
  if (ret && paid > 0) st.refunds[s.id] = paid * ret.share;
  const free = perk(g, 'int_free');
  if (free && paid > 0 && ++st.casts >= free.every) {
    st.casts = 0;
    p.mp = Math.min(manaLimit(g), p.mp + paid);
    g.emit({ type: 'perk', id: free.id, x: p.x, z: p.z });
  }
  const reset = perk(g, 'luk_reset');
  if (reset && p.cooldowns[i] > 0 && g.perkRng.chance(reset.chance)) {
    p.cooldowns[i] = 0;
    g.emit({ type: 'perk', id: reset.id, slot: i, x: p.x, z: p.z });
  }
}

/** A movement skill was used: AGI's quick cast after it (joins a movement skill's own momentum). */
export function perkMovement(g, mv) {
  const rush = perk(g, 'agi_rush');
  if (!rush) return;
  const p = g.player, until = g.time + mv.duration + rush.window;
  p.momentum = { until: Math.max(until, p.momentum?.until || 0), speed: Math.max(rush.speed, p.momentum?.speed || 0) };
}

/** A monster hit missed the hero (`inv`: the movement skill's invulnerability). */
export function perkDodge(g, inv) {
  if (!g.derived.perks) return;
  const p = g.player, st = state(g);
  const graze = perk(g, 'agi_graze');
  if (graze && inv && g.time >= st.grazeReady && p.movement.charges < g.move.charges) {
    p.movement.charges++;
    st.grazeReady = g.time + graze.cooldown;
    g.emit({ type: 'perk', id: graze.id, x: p.x, z: p.z });
  }
  const shadow = perk(g, 'agi_shadow');
  if (shadow) st.shadowUntil = g.time + shadow.window;
}

/** True while LUK's narrow escape keeps the hero untouchable. */
export const perkInvulnerable = (g) => g.time < (g.player.perk?.invUntil ?? -1);

/** The share of a monster hit the hero still takes (VIT 150 while healthy). */
export function perkTaken(g) {
  const b = perk(g, 'vit_bulwark'), p = g.player;
  return b && p.hp > (p.maxHp * b.hpPct) / 100 ? b.taken : 1;
}

/** VIT 100: the hero is never knocked back. */
export const perkSteady = (g) => !!perk(g, 'vit_iron');

/** The hero took a hit and lives: VIT 100's barrier; a lethal hit may be survived (VIT 200, LUK 100). */
export function perkAfterTaken(g, dmg) {
  if (!g.derived.perks) return;
  const p = g.player, st = state(g);
  if (p.hp <= 0) {
    const undying = perk(g, 'vit_undying'), escape = perk(g, 'luk_escape');
    if (undying && g.time >= st.undyingReady) {
      p.hp = Math.max(1, (p.maxHp * undying.healPct) / 100);
      st.undyingReady = g.time + undying.cooldown;
      g.emit({ type: 'perk', id: undying.id, x: p.x, z: p.z });
    } else if (escape && g.time >= st.escapeReady) {
      p.hp = 1;
      st.invUntil = g.time + escape.invulnerable;
      st.escapeReady = g.time + escape.cooldown;
      g.emit({ type: 'perk', id: escape.id, x: p.x, z: p.z });
    }
  }
  const iron = perk(g, 'vit_iron');
  if (iron && p.hp > 0 && dmg > 0 && g.time >= st.ironReady) {
    p.barrier = Math.min(p.maxHp * 0.5, p.barrier + (p.maxHp * iron.barrierPct) / 100);
    p.barrierT = Math.max(p.barrierT, iron.duration);
    st.ironReady = g.time + iron.cooldown;
  }
}

/** The hero's HP regeneration multiplier (VIT 50 when low). */
export function perkRegen(g) {
  const w = perk(g, 'vit_second'), p = g.player;
  return w && p.hp < (p.maxHp * w.hpPct) / 100 ? w.mult : 1;
}

/** Spell shield recharge: { rate, delay } multipliers (INT 100). */
export function perkShield(g) {
  const f = perk(g, 'int_flow');
  return f ? { rate: f.rate, delay: f.delay } : null;
}

/** Extra loot from a kill (LUK 50); never from summoned minions. */
export function perkDrops(g, m) {
  const find = perk(g, 'luk_find');
  if (!find || m.minion || !g.perkRng.chance(find.chance)) return [];
  g.emit({ type: 'perk', id: find.id, x: m.x, z: m.z });
  return [{ item: find.item, qty: 1 }];
}
