// Power score: one number folded from every system (stats, gear, options, +N, arrows, skills
// and their mods, job tree) so the player can see what a change adds or costs. It is the
// geometric mean of offence (sustained damage per second of the best slotted damage skill)
// and defence (effective HP against a hit from the front), scaled by data.progression.power.
import { derive } from './character.js';
import { computeSkill } from './skills.js';

/** Damage per second of one computed skill (0 for skills that deal none). */
export function skillDps(s, d) {
  if (!s?.damage) return 0;
  const crit = 1 + d.critChance * (d.critMult - 1);
  const hits = Math.max(1, s.projectiles || 1) * (1 + (s.repeats || 0) * (s.repeatMult || 0));
  const persistent = s.duration && s.tick ? s.duration / s.tick : 1;
  const per = s.damage * (s.damageMult || 1) * crit * hits * (s.kind === 'dot_zone' ? persistent : 1);
  return per / Math.max(s.cooldown || 0, s.castTime || 0, 0.35);
}

/** Effective HP: max HP over the share of a frontal hit that gets through armour and a shield. */
export function effectiveHp(d, data) {
  const armour = (1 - d.defense / (d.defense + 60)) * (1 + d.damageTakenPct / 100);
  const block = 1 - d.blockChance * (1 - data.progression.combat.block.taken);
  return d.maxHp / Math.max(0.05, armour * block);
}

export function powerOf(ch, data) {
  const d = derive(ch, data), rules = data.progression.power;
  const offence = Math.max(0, ...ch.slots.map((_, i) => skillDps(computeSkill(ch, data, d, i), d)));
  const defence = effectiveHp(d, data);
  return {
    power: Math.round(Math.sqrt(Math.max(offence, rules.minOffence) * defence) * rules.scale),
    offence: Math.round(offence * 10) / 10,
    defence: Math.round(defence),
  };
}

/** What `change(copy)` would do to the power score, without touching `ch`. */
export function powerDelta(ch, data, change) {
  const before = powerOf(ch, data);
  const copy = JSON.parse(JSON.stringify(ch));
  const result = change(copy);
  if (result && result.ok === false) return { ok: false, reason: result.reason, before };
  const after = powerOf(copy, data);
  return { ok: true, before, after, diff: after.power - before.power, offence: after.offence - before.offence, defence: after.defence - before.defence };
}
