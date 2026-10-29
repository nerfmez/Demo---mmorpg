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
  return (g.player.perk ||= { swings: 0, spells: 0, heavy: false, grazeReady: 0, shadowUntil: -1, invUntil: -1, escapeReady: 0, undyingReady: 0, ironReady: 0, refunds: {} });
}

/**
 * A skill goes off (not a repeat, echo or trigger): STR counts melee swings for the heavy blow,
 * INT counts damaging spells for the echo. Returns the heavy flag of a skill this one went off inside,
 * for perkSkillEnd.
 */
export function perkSkillStart(g, s, aim, counted) {
  if (!g.derived.perks) return false;
  const st = state(g), outer = st.heavy; // a skill set off inside another one's hits (a trigger) keeps that one's flag
  st.heavy = false;
  if (!counted) return outer;
  const heavy = perk(g, 'str_heavy');
  if (heavy && has(s.tags, 'Melee')) {
    st.swings++;
    if (st.swings >= (perk(g, 'str_titan')?.every || heavy.every)) {
      st.swings = 0;
      st.heavy = true;
      g.emit({ type: 'perk', id: 'str_heavy', x: g.player.x, z: g.player.z });
    }
  }
  const echo = perk(g, 'int_echo');
  if (echo && has(s.tags, 'Spell') && has(s.tags, 'Damage')) {
    st.spells++;
    if (st.spells >= echo.every) {
      st.spells = 0;
      const p = g.player;
      g.emit({ type: 'perk', id: echo.id, x: p.x, z: p.z });
      g.later(echo.delay, () => !p.dead && g.executeSkill(s, aim, { mult: echo.mult, repeat: 99 }));
    }
  }
  return outer;
}

/** The skill's own hits are done: a heavy swing ends with them (the outer skill's flag comes back). */
export function perkSkillEnd(g, outer) {
  if (g.player.perk) g.player.perk.heavy = outer;
}

/**
 * A hit from the hero's own skill, before crit and defense. Returns { mult, crit, critMult, stagger,
 * bossStagger } for hitMonster.
 */
export function perkHit(g, m, opts, crit) {
  const p = g.player, st = state(g);
  let mult = 1, critMult = 1, stagger = 0, bossStagger = 0;
  const melee = has(opts.tags, 'Melee'), spell = has(opts.tags, 'Spell');
  // DEX 50: the opening hit on an untouched enemy always crits (a skill that never crits stays so)
  if (!crit && !opts.noCrit && perk(g, 'dex_opener') && m.hp >= m.maxHp) crit = true;
  if (st.heavy && melee) {
    const h = perk(g, 'str_heavy');
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
  const range = perk(g, 'dex_range');
  if (range && opts.travelled) mult *= 1 + Math.min(range.max, opts.travelled * range.perMetre);
  const focus = perk(g, 'int_focus');
  if (focus && spell && p.mp >= (p.maxMp * focus.mpPct) / 100) mult *= focus.mult;
  if (crit) {
    const mark = perk(g, 'dex_mark');
    if (mark && m.perkMarks) critMult *= 1 + mark.perStack * m.perkMarks;
    const jack = perk(g, 'luk_jackpot');
    if (jack && g.perkRng.chance(jack.chance)) {
      critMult *= jack.mult;
      g.emit({ type: 'perk', id: jack.id, x: m.x, z: m.z });
    }
  }
  return { mult, crit, critMult, stagger, bossStagger };
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
  if (quake && crit && has(opts.tags, 'Melee')) {
    g.emit({ type: 'perk', id: quake.id, x: m.x, z: m.z, radius: quake.radius });
    for (const o of g.monsters) {
      if (o === m || o.dead || o.targetable === false || dist(o.x, o.z, m.x, m.z) - o.r > quake.radius) continue;
      g.hitMonster(o, dmg * quake.share, { element: 'physical', secondary: true, fromX: m.x, fromZ: m.z });
    }
  }
}

/** A cast was paid for (castSlot): LUK may reset its cooldown, INT readies the mana return. */
export function perkCast(g, s, i) {
  if (!g.derived.perks) return;
  const p = g.player, st = state(g);
  const ret = perk(g, 'int_return');
  if (ret && has(s.tags, 'Spell') && s.cost > 0) st.refunds[s.id] = s.cost * ret.share;
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
