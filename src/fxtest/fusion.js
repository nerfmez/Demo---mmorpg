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

export const fusionRecipe = (rules, carrierId, payloadId) => (rules.recipes || []).find((r) => r.carrier === carrierId && r.payload === payloadId) || null;

// carrierSlot/payloadSlot: resolved skills in g.skills. The payload slot is not castable by itself.
export function installFusion(g, rules, carrierSlot = 0, payloadSlot = 1) {
  const carrier = g.skills[carrierSlot], payload = g.skills[payloadSlot];
  const recipe = fusionRecipe(rules, carrier.id, payload.id);
  if (recipe) return installRecipe(g, recipe, carrierSlot, carrier, payload);
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

// An authored fusion: hold a charge, then the carrier's strike and the recipe's payload delivery.
// Flame Wave Slash: a 1 s charge, then Slash and a piercing crescent of fire that hits each target once.
function installRecipe(g, recipe, slot, carrier, payload) {
  if (recipe.type === 'arrow_chain') return installArrowChain(g, recipe, slot, carrier, payload);
  carrier.cooldown = recipe.cooldown;
  carrier.cost += payload.cost;
  carrier.fusion = payload.id;
  carrier.recipe = recipe;
  const cast = g.castSlot;
  g.castSlot = function (i, point) {
    if (i !== slot) return cast.call(this, i, point);
    const p = this.player;
    if (p.dead || p.dash || p.fusionCharge || p.cooldowns[i] > 0 || p.mp < carrier.cost) return false;
    p.fusionCharge = { t: 0, total: recipe.chargeTime };
    this.emit({ type: 'fusionCharge', recipe: recipe.id, skill: carrier.id, total: recipe.chargeTime, angle: p.facing });
    return true;
  };
  g.updateFusion = function (dt) {
    const p = this.player, c = p.fusionCharge;
    if (!c) return;
    if (p.dead || p.dash) { p.fusionCharge = null; this.emit({ type: 'fusionCancel', recipe: recipe.id }); return; }
    if (this.input.aimFromPointer) p.facing = this.input.aimAngle;
    c.t += dt;
    if (c.t < c.total) return;
    p.fusionCharge = null;
    p.cooldowns[slot] = carrier.cooldown;
    p.mp -= carrier.cost;
    const angle = p.facing, aim = { angle, x: p.x + Math.sin(angle) * 5, z: p.z + Math.cos(angle) * 5 };
    this.executeSkill(carrier, aim, { mult: recipe.slashDamageMult, step: 0 });
    spawnWave(this, 1);
    // Multistrike: each repeat swing sends its own (weaker) wave
    for (let k = 1; k <= (carrier.repeats || 0); k++) this.later(k * carrier.repeatDelay, () => !this.player.dead && spawnWave(this, carrier.repeatMult));
    this.emit({ type: 'fusionRelease', recipe: recipe.id, x: p.x, z: p.z, angle, range: recipe.wave.range, speed: recipe.wave.speed });
  };
  // The wave is the payload's delivery carrying the carrier's mods: an element change (Frost
  // Shift), knockback, leech, chill, burning ground and status mods all ride on it, and Wide Arc
  // widens it in proportion to the swing.
  const base = g.data.skills.combat[carrier.id];
  const element = carrier.element !== base.element ? carrier.element : payload.element;
  const waveSkill = {
    ...payload, id: recipe.id, element, burnChance: element === payload.element ? payload.burnChance : 0,
    chill: carrier.chill || payload.chill, knock: carrier.knock || payload.knock, leech: Math.max(carrier.leech || 0, payload.leech || 0),
    ground: carrier.ground || payload.ground, modEffects: { ...(payload.modEffects || {}), ...(carrier.modEffects || {}) },
  };
  const widen = carrier.arc / base.arc;
  function spawnWave(game, mult) {
    const p = game.player, angle = p.facing, w = recipe.wave;
    game.spawnProjectile({
      owner: 'player', kind: recipe.id, skill: waveSkill, x: p.x + Math.sin(angle) * 0.6, z: p.z + Math.cos(angle) * 0.6, y: 1.0, angle,
      speed: w.speed, radius: w.radius * widen, range: w.range, damage: payload.damage * w.damageMult * mult * game.playerDamageMult(), element, pierce: Infinity,
      waveScale: widen * (mult < 1 ? 0.8 : 1),
    });
  }
  return { carrier, payload, recipe, waveElement: element };
}

// Thunder Arrow (type arrow_chain): draw the bow (a charge), loose one arrow wrapped in lightning; on its
// first hit the payload's chain lightning bursts from the struck target and leaps on to the nearest others.
function installArrowChain(g, recipe, slot, carrier, payload) {
  carrier.cooldown = recipe.cooldown;
  carrier.cost += payload.cost;
  carrier.fusion = payload.id;
  carrier.recipe = recipe;
  const arrows = [];
  const cast = g.castSlot;
  g.castSlot = function (i, point) {
    if (i !== slot) return cast.call(this, i, point);
    const p = this.player;
    if (p.dead || p.dash || p.fusionCharge || p.cooldowns[i] > 0 || p.mp < carrier.cost) return false;
    p.fusionCharge = { t: 0, total: recipe.chargeTime };
    this.emit({ type: 'fusionCharge', recipe: recipe.id, skill: carrier.id, total: recipe.chargeTime, angle: p.facing });
    return true;
  };
  g.updateFusion = function (dt) {
    // an arrow that struck since the last step: the chain bursts from what it hit
    for (let k = arrows.length - 1; k >= 0; k--) {
      const pr = arrows[k];
      if (pr.hit.size) { arrows.splice(k, 1); const m = this.monsters.find((o) => pr.hit.has(o.id)); if (m) chainFrom(this, m); }
      else if (!this.projectiles.includes(pr)) arrows.splice(k, 1);
    }
    const p = this.player, c = p.fusionCharge;
    if (!c) return;
    if (p.dead || p.dash) { p.fusionCharge = null; this.emit({ type: 'fusionCancel', recipe: recipe.id }); return; }
    if (this.input.aimFromPointer) p.facing = this.input.aimAngle;
    c.t += dt;
    if (c.t < c.total) return;
    p.fusionCharge = null;
    p.cooldowns[slot] = carrier.cooldown;
    p.mp -= carrier.cost;
    const angle = p.facing, a = recipe.arrow;
    arrows.push(this.spawnProjectile({
      owner: 'player', kind: recipe.id, skill: carrier, x: p.x + Math.sin(angle) * 0.6, z: p.z + Math.cos(angle) * 0.6, y: 1.0, angle,
      speed: a.speed, radius: a.radius, range: a.range, damage: carrier.damage * recipe.arrowDamageMult * this.playerDamageMult(), element: carrier.element, arrow: true,
    }));
    this.emit({ type: 'fusionRelease', recipe: recipe.id, x: p.x, z: p.z, angle, range: a.range, speed: a.speed });
  };
  function chainFrom(game, first) {
    const hit = new Set(), points = [[first.x, first.z]];
    let cur = first, dmg = payload.damage * recipe.chainDamageMult * game.playerDamageMult();
    for (let i = 0; i <= payload.chain && cur; i++) {
      if (i) points.push([cur.x, cur.z]);
      hit.add(cur.id);
      game.hitMonster(cur, dmg, game.hitOpts(payload, { crit: game.rollCrit() }));
      dmg *= payload.chainFalloff;
      let next = null, nd = payload.chainRange || 6;
      for (const m of game.monsters) {
        if (m.dead || hit.has(m.id)) continue;
        const d = Math.hypot(m.x - cur.x, m.z - cur.z);
        if (d < nd) { nd = d; next = m; }
      }
      cur = next;
    }
    game.emit({ type: 'chain', points, element: payload.element, from: recipe.id });
    game.emit({ type: 'fusion', carrier: carrier.id, payload: payload.id, x: first.x, z: first.z, element: payload.element, recipe: recipe.id });
  }
  return { carrier, payload, recipe, waveElement: payload.element };
}
