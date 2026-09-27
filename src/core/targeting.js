// Soft targeting (design doc section 3):
// - Out of attack range: no lock.
// - Enemy enters attack range: lock automatically.
// - Aim (mouse / analog / facing) swings toward another enemy: switch.
// - Target leaves range: release.
// - The character never runs after the target on its own.

import { angleDiff, angleTo, dist } from './math.js';

const SWITCH_MARGIN = 0.35; // radians the new enemy must be "more aimed at" than the current one
const RELEASE_PAD = 0.8; // small hysteresis so the lock doesn't flicker at the edge

/**
 * @param {{x:number,z:number,targetId:number|null}} player
 * @param {Array<{id:number,x:number,z:number,r:number,dead?:boolean,targetable?:boolean}>} enemies
 * @param {number} aimAngle facing angle the player is aiming at
 * @param {number} range acquisition range (attack range of the equipped skills)
 * @returns {number|null} new target id
 */
export function softTarget(player, enemies, aimAngle, range) {
  let current = null;
  const candidates = [];
  for (const e of enemies) {
    if (e.dead || e.targetable === false) continue;
    const d = dist(player.x, player.z, e.x, e.z) - e.r;
    if (e.id === player.targetId && d <= range + RELEASE_PAD) current = e;
    if (d <= range) candidates.push(e);
  }
  const off = (e) => Math.abs(angleDiff(aimAngle, angleTo(player.x, player.z, e.x, e.z)));
  const score = (e) => off(e) + (dist(player.x, player.z, e.x, e.z) - e.r) * 0.04;
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
