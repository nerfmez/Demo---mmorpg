// The job skills' numbers the wheel tree is designed with (data/drafts/wheel.json skillScale): each entry
// multiplies a skill's damage, heal or summon bite (base and scale) in data/skills.json. The live game keeps
// skills.json as it is until the wheel tree ships; the wheel tools read the data through this.
export function applySkillScale(data, scale = {}) {
  const combat = { ...data.skills.combat };
  for (const [id, k] of Object.entries(scale)) {
    const def = combat[id];
    if (!def || k === 1) continue;
    const d = structuredClone(def), t = d.damage || d.heal || d.summon?.damage;
    if (!t) continue;
    t.base *= k; t.scale *= k;
    combat[id] = d;
  }
  return { ...data, skills: { ...data.skills, combat } };
}
