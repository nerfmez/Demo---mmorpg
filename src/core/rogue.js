// The blade job's trickery (owner, 2026-10-30): Stealth, Steal and Decoy. Stealth and Decoy are meant for
// player against player: a hidden hero is truly gone from sight (monsters lose it; online, other players' screens
// draw nothing), only its own player sees a ghost of it; a decoy is a copy of the hero that draws nothing to it
// and only fools the eye. Steal is the thief's farming: gold and maybe one of the monster's own materials, once
// per monster. Game rules only (no DOM, no three); numbers in data/skills.json.
import { dist, angleTo } from './math.js';

/** Is the hero hidden (Stealth, or the moment after a Decoy)? */
export const hidden = (g) => (g.player.stealthT || 0) > 0;

/** Hide the hero for `t` seconds: monsters chasing it lose it (core/ai.js pickTarget skips a hidden hero). */
export function hide(g, t) {
  const p = g.player, was = hidden(g);
  p.stealthT = Math.max(p.stealthT || 0, t);
  for (const m of g.monsters) {
    if (m.dead) continue;
    if (m.forcedTargetId === p.id) { m.forcedTargetId = null; m.tauntT = 0; }
    if (m.targetUnit === p) m.targetUnit = null;
  }
  if (!was) g.emit({ type: 'stealth', on: true, x: p.x, z: p.z, duration: p.stealthT });
}
/** Out of hiding (an attack from it, a blow taken, or its time up). */
export function reveal(g, why = 'time') {
  const p = g.player;
  if (!hidden(g)) return;
  p.stealthT = 0;
  g.emit({ type: 'stealth', on: false, why, x: p.x, z: p.z });
}

/** The skill kinds of this module; true when it ran the skill. */
export function executeRogue(g, s, aim, mult) {
  const p = g.player;
  if (s.kind === 'stealth') { hide(g, s.duration); return true; }
  if (s.kind === 'decoy') {
    // a copy of the hero where it stands, and the hero itself out of sight a moment: which one is real?
    const d = { id: g.newId(), x: p.x, z: p.z, facing: p.facing, t: s.duration };
    g.decoys.push(d);
    g.emit({ type: 'decoy', id: d.id, x: d.x, z: d.z, facing: d.facing, duration: s.duration });
    hide(g, s.stealth || 0);
    return true;
  }
  if (s.kind === 'steal') {
    const S = s.steal, arc = ((S.arc || 100) * Math.PI) / 360;
    let m = null, best = Infinity;
    for (const q of g.monsters) {
      if (q.dead || q.targetable === false) continue;
      const d = dist(p.x, p.z, q.x, q.z) - q.r;
      const off = Math.abs(Math.atan2(Math.sin(angleTo(p.x, p.z, q.x, q.z) - aim.angle), Math.cos(angleTo(p.x, p.z, q.x, q.z) - aim.angle)));
      if (d <= s.range && off <= arc && d < best) { best = d; m = q; }
    }
    g.emit({ type: 'steal', id: m?.id ?? null, x: p.x, z: p.z, angle: aim.angle, toX: m?.x, toZ: m?.z });
    if (!m) return true;
    g.hitMonster(m, s.damage * mult, g.hitOpts(s, { crit: g.rollCrit(), fromX: p.x, fromZ: p.z }));
    if (m.stolen || m.minion) { g.emit({ type: 'stealResult', id: m.id, gold: 0, item: null, empty: true }); return true; }
    m.stolen = true;
    const level = m.level || 1, gold = Math.max(1, Math.round((S.gold + S.goldPerLevel * level) * g.rng.range(0.8, 1.2)));
    const mats = (m.def.drops || []).filter((d) => d.item !== 'gold');
    const item = mats.length && g.rng.chance(m.boss ? S.bossItemChance : S.itemChance) ? mats[Math.floor(g.rng.range(0, mats.length - 1e-9))].item : null;
    // what it took lands at the hero's feet, flying from the monster (the usual pickups)
    for (const [it, qty] of [['gold', gold], ...(item ? [[item, 1]] : [])]) {
      const drop = { id: g.newId(), item: it, qty, x: p.x, z: p.z, t: 0, worldId: m.worldId };
      g.drops.push(drop);
      g.emit({ type: 'drop', id: drop.id, item: it, fromX: m.x, fromZ: m.z });
    }
    g.emit({ type: 'stealResult', id: m.id, gold, item, empty: false });
    return true;
  }
  return false;
}

/** Each frame: hiding and decoys run out. */
export function tickRogue(g, dt) {
  const p = g.player;
  if (hidden(g)) { p.stealthT -= dt; if (p.stealthT <= 0 || p.dead) { p.stealthT = 1e-9; reveal(g, p.dead ? 'dead' : 'time'); } }
  if (g.decoys.length) {
    let w = 0;
    for (const d of g.decoys) { d.t -= dt; if (d.t > 0) g.decoys[w++] = d; else g.emit({ type: 'decoyEnd', id: d.id, x: d.x, z: d.z }); }
    g.decoys.length = w;
  }
}
