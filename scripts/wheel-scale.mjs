// The job skills' numbers the wheel tree is designed with (data/drafts/wheel.json skillScale): each entry
// multiplies a skill's damage, heal or summon bite (base and scale) in data/skills.json. The wheel shipped at
// phase C with its multipliers baked into skills.json; new ones are tried here before they go there too.
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
