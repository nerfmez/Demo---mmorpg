// Shared taxonomy. Bonus amounts remain in gear/job data; shape tags are always native.
export const ELEMENT_TAGS = ['Physical', 'Fire', 'Cold', 'Lightning', 'Poison', 'Earth', 'Arcane'];
export const DAMAGE_TAGS = { physical: 'Physical', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', poison: 'Poison', arcane: 'Arcane' };
export const ELEMENT_STATS = Object.fromEntries(ELEMENT_TAGS.map(tag => [tag, tag.toLowerCase() + 'DamagePct']));

function fitsTags(tags, mod) {
  if (mod.requiresAll?.some(tag => !tags.has(tag))) return { ok: false, reason: `needs ${mod.requiresAll.join('+')}` };
  if (mod.requiresAny?.length && !mod.requiresAny.some(tag => tags.has(tag))) return { ok: false, reason: `needs ${mod.requiresAny.join('/')}` };
  if (mod.excludes?.some(tag => tags.has(tag))) return { ok: false, reason: `not for ${mod.excludes.join('/')}` };
  return { ok: true };
}

/** Callers pass stat-active companions. A converter must qualify on the original skill;
 * it cannot enable itself, or borrow shape tags from another modifier. */
export function effectiveSkillTags(skill, companions = []) {
  const native = new Set(skill?.tags || []), tags = new Set(native);
  for (const mod of companions) {
    const element = mod?.effect?.element;
    if (!DAMAGE_TAGS[element] || !fitsTags(native, mod).ok) continue;
    for (const tag of ELEMENT_TAGS) tags.delete(tag);
    tags.add(DAMAGE_TAGS[element]);
  }
  return tags;
}

export function skillTagFit(skill, mod, companions = []) {
  return fitsTags(mod.effect?.element ? new Set(skill.tags || []) : effectiveSkillTags(skill, companions), mod);
}

/** Element and type increases share one additive damage pool. */
export function elementDamageIncrease(tags, derived) {
  let total = 0;
  for (const tag of ELEMENT_TAGS) if (tags.has(tag)) total += derived[ELEMENT_STATS[tag]] || 0;
  return total;
}
