// The statuses a unit has now, for the HUD's icon rows (owner, 2026-10-31: debuffs shown clearly as
// symbols, a boss's under its health bar). Rules only read here: each status keeps its own rule where it
// is applied and ticked (core/game-simulation.js tickStatuses, core/frontier-content.js, core/ai.js).
// Display names, colours and icons: data/progression.json combat.statusDisplay (its key order is the
// row's order).

/**
 * [{ id, left, full, stacks }] for a monster or the hero: left the seconds remaining (null when it has
 * no timer), full its starting length when known, stacks for stacking statuses (poison).
 */
export function statusList(data, unit, heroId = null) {
  const order = data.progression.combat.statusDisplay || {}, out = [], st = unit.statuses || {};
  for (const id of Object.keys(order)) {
    if (id === 'stun') {
      if (unit.state === 'stunned') out.push({ id, left: Math.max(0, (unit.stateDur || 0) - (unit.stateT || 0)), full: unit.stateDur || null, stacks: 0 });
      continue;
    }
    if (id === 'taunt') {
      if ((unit.tauntT || 0) > 0 && unit.forcedTargetId != null && unit.forcedTargetId === heroId) out.push({ id, left: unit.tauntT, full: null, stacks: 0 });
      continue;
    }
    const s = st[id];
    if (!s) continue;
    out.push({ id, left: s.t ?? null, full: null, stacks: s.stacks || 0 });
  }
  return out;
}
