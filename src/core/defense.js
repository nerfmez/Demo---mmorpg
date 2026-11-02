// The defensive line (owner, 2026-10-31; docs/SKILL-TREE-WHEEL-DRAFT-TH.md section 12): every debuff a
// monster puts on the hero has an answer in the build, not a special rule in code.
//   - A monster's attack has an element (data/monsters.json: the monster's `element`, an attack's own
//     `element` overriding it; physical when neither says) and may `inflict` a status on the hero.
//   - Element resistance (resistFirePct, resistColdPct, resistLightningPct, resistPoisonPct; resistAllPct
//     adds to each) takes that share off the element's damage and off the chance its status takes.
//   - Tenacity (tenacityPct) takes that share off the length of every status the hero is given.
//   - Both are capped (data/progression.json character.caps); they come from gear options, Job Tree nodes,
//     and Mend and Cleanse removes one status.
// Statuses on the hero (data/progression.json combat.heroStatus): poison, burn and bleed hurt over time
// and never kill; chill slows walking; shock makes the hero take more damage; root stops walking (a dodge
// or a movement skill still moves).

export const RESISTS = { fire: 'resistFirePct', cold: 'resistColdPct', lightning: 'resistLightningPct', poison: 'resistPoisonPct' };
export const DOTS = ['poison', 'burn', 'bleed'];

/** The element and the status of a monster's attack by name (null source: a ground hazard, physical). */
export function monsterHit(source, attack) {
  const def = source?.def, atk = attack ? def?.attacks?.[attack] : null;
  return { element: atk?.element || def?.element || 'physical', inflict: atk?.inflict || null };
}

/** The share (0..cap) of an element's damage and status chance the hero resists. */
export function resistOf(derived, element) {
  const k = RESISTS[element];
  return k ? Math.max(0, derived[k] || 0) / 100 : 0;
}

/** Fold resistAllPct into each element's resistance (before the caps). */
export function foldResists(d) {
  for (const k of Object.values(RESISTS)) d[k] = (d[k] || 0) + (d.resistAllPct || 0);
  d.tenacityPct = d.tenacityPct || 0;
}

/**
 * Put a status on the hero. spec: { status, chance?, duration, slow?, dps?, dpsMult? }; hit: the hit's
 * damage after resistance (a dot's dps is dpsMult of it); element: the attack's element. Returns the
 * status given or null (resisted, or no status).
 */
export function inflictHero(game, spec, hit, element, rng) {
  const p = game.player, d = game.derived;
  if (!spec || p.dead) return null;
  const resist = resistOf(d, element);
  const chance = (spec.chance ?? 1) * (1 - resist);
  if (chance < 1 && !rng.chance(chance)) return null;
  const t = spec.duration * (1 - Math.max(0, d.tenacityPct || 0) / 100);
  if (t <= 0) return null;
  const id = spec.status, old = p.statuses[id];
  let s;
  if (DOTS.includes(id)) {
    const dps = (spec.dps ?? hit * (spec.dpsMult || 0)) * (id === 'bleed' ? 1 : 1 - resist);
    if (dps <= 0) return null;
    // the stronger dot stays; a new one as strong or stronger takes over with its own length
    if (old && old.dps > dps) { old.t = Math.max(old.t, t); return old; }
    s = { dps, t, acc: old?.acc || 0 };
  } else if (id === 'chill') s = { slow: Math.max(spec.slow || 0, old?.slow || 0), t: Math.max(t, old?.t || 0) };
  else s = { t: Math.max(t, old?.t || 0) };
  p.statuses[id] = s;
  game.emit({ type: 'heroStatus', status: id, element, duration: s.t, x: p.x, z: p.z });
  return s;
}

/** The hero's damage taken multiplier from their statuses (shock). */
export function statusTaken(game) {
  const sh = game.player.statuses.shock;
  return sh ? 1 + (game.data.progression.combat.heroStatus?.shock?.takenPct || 0) / 100 : 1;
}

/** The hero's walking multiplier from their statuses (chill slows, root stops). */
export function statusWalk(p) {
  if (p.statuses.root) return 0;
  return p.statuses.chill ? 1 - p.statuses.chill.slow : 1;
}
