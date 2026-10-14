// PROTOTYPE skill fusion on top of the real rules (bench only, rules in data/fusion.json).
// No DOM, no three: runs in Node for tests.

const has = (def, tags) => tags.every((t) => def.tags?.includes(t));
const hasAny = (def, tags) => tags.some((t) => def.tags?.includes(t));

export function fusionCheck(rules, carrier, payload) {
  const c = rules.carrier, p = rules.payload;
  if (!carrier || !has(carrier, c.requiresAll) || hasAny(carrier, c.excludes)) return { ok: false, reason: 'carrier' };
  if (carrier.cooldown > c.maxCooldown) return { ok: false, reason: 'carrierCooldown' };
  if (!payload || !has(payload, p.requiresAll) || hasAny(payload, p.excludes) || !p.kinds.includes(payload.kind)) return { ok: false, reason: 'payload' };
  if (payload.cooldown > p.maxCooldown) return { ok: false, reason: 'payloadCooldown' };
  return { ok: true };
}

export function fusionPayloads(data, rules, carrierId) {
  const carrier = data.skills.combat[carrierId];
  return Object.keys(data.skills.combat).filter((id) => id !== carrierId && fusionCheck(rules, carrier, data.skills.combat[id]).ok);
}

// carrierSlot/payloadSlot: resolved skills in g.skills. The payload slot is not castable by itself.
export function installFusion(g, rules, carrierSlot = 0, payloadSlot = 1) {
  const carrier = g.skills[carrierSlot], payload = g.skills[payloadSlot];
  carrier.cooldown = Math.max(carrier.cooldown, payload.cooldown);
  carrier.cost += payload.cost;
  carrier.fusion = payload.id;
  const run = g.executeSkill;
  g.executeSkill = function (s, aim, opts = {}) {
    if (s !== carrier || opts.triggered || opts.repeat) return run.call(this, s, aim, opts);
    let first = null;
    const own = Object.hasOwn(this, 'hitMonster'), hit = this.hitMonster;
    this.hitMonster = function (m, ...rest) { if (!first && !rest[1]?.secondary) first = m; return hit.call(this, m, ...rest); };
    try { run.call(this, s, aim, opts); } finally { if (own) this.hitMonster = hit; else delete this.hitMonster; }
    if (first) firePayload(this, first);
  };
  function firePayload(game, m) {
    const p = game.player;
    const angle = Math.atan2(m.x - p.x, m.z - p.z); // on through the struck target, away from the caster
    const sx = p.x, sz = p.z, before = new Set(game.projectiles);
    // the core spawns projectiles 0.6 m ahead of the player: stand in so they start at the target
    p.x = m.x - Math.sin(angle) * 0.6; p.z = m.z - Math.cos(angle) * 0.6;
    try { run.call(game, payload, { angle, x: m.x + Math.sin(angle) * 5, z: m.z + Math.cos(angle) * 5 }, { mult: rules.payloadDamageMult, triggered: true }); }
    finally { p.x = sx; p.z = sz; }
    for (const pr of game.projectiles) if (!before.has(pr)) pr.hit.add(m.id); // it flies on; the struck target was already hit
    game.emit({ type: 'fusion', carrier: carrier.id, payload: payload.id, x: m.x, z: m.z, angle, element: payload.element });
  }
  return { carrier, payload };
}
