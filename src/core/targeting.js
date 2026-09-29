// Soft targeting:
// - Automatic play prioritizes the nearest target that is actually in range.
// - Explicit pointer/drag aim keeps directional selection.
// - Targets outside acquisition range are never chased.
// - A tiny release pad prevents the marker flickering at the exact range edge.

import { angleDiff, angleTo, dist } from './math.js';

const SWITCH_MARGIN = 0.35;
const RELEASE_PAD = 0.8;

const edgeDistance = (player, enemy) => dist(player.x, player.z, enemy.x, enemy.z) - enemy.r;

/** Closest target by usable edge distance. Stable ID tie-break keeps selection deterministic. */
export function nearestTarget(player, enemies, range) {
  let best = null;
  let bestDistance = Infinity;
  for (const e of enemies) {
    if (e.dead || e.targetable === false) continue;
    const d = edgeDistance(player, e);
    if (d > range) continue;
    if (d < bestDistance - 1e-6 || (Math.abs(d - bestDistance) <= 1e-6 && (!best || e.id < best.id))) {
      best = e;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * @param {{x:number,z:number,targetId:number|null}} player
 * @param {Array<{id:number,x:number,z:number,r:number,dead?:boolean,targetable?:boolean}>} enemies
 * @param {number} aimAngle direction the player is explicitly aiming at
 * @param {number} range acquisition range
 * @param {{preferNearest?:boolean}} opts automatic mode uses distance; manual mode uses aim
 * @returns {number|null} new target id
 */
export function softTarget(player, enemies, aimAngle, range, { preferNearest = false } = {}) {
  let current = null;
  const candidates = [];
  for (const e of enemies) {
    if (e.dead || e.targetable === false) continue;
    const d = edgeDistance(player, e);
    if (e.id === player.targetId && d <= range + RELEASE_PAD) current = e;
    if (d <= range) candidates.push(e);
  }

  if (preferNearest) {
    const best = nearestTarget(player, candidates, range);
    return best ? best.id : current ? current.id : null;
  }

  const off = (e) => Math.abs(angleDiff(aimAngle, angleTo(player.x, player.z, e.x, e.z)));
  const score = (e) => off(e) + edgeDistance(player, e) * 0.04;
  let best = null;
  let bestScore = Infinity;
  for (const e of candidates) {
    const s = score(e);
    if (s < bestScore) {
      bestScore = s;
      best = e;
    }
  }
  if (!best) return current ? current.id : null;
  if (!current) return best.id;
  if (best.id !== current.id && off(best) < off(current) - SWITCH_MARGIN) return best.id;
  return current.id;
}
