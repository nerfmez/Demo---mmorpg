// Content pass (owner, 2026-10-29, docs/STATS-TH.md): armour stats follow the piece's class
// (items.armorIdentity). A piece's core stats are multiples of its slot's share of the balance model's set
// (defense and HP at its item level); its percentages sit at a share of their cap for that item level;
// other stats (attack, magic, regeneration) stay as authored and are paid for out of the core. Writes data/items.json; re-running gives the
// same stats. node scripts/armor-identity.mjs
import fs from 'node:fs';
let text = fs.readFileSync('data/items.json', 'utf8');
const items = JSON.parse(text), A = items.armorIdentity;
const set = JSON.parse(fs.readFileSync('data/progression.json', 'utf8')).balance.gear;
const CLASS = { VIT: 'plate', AGI: 'leather', INT: 'cloth' }, CORE = ['defense', 'maxHp', 'maxMp', 'maxShield'];
const round = (k, v) => (k.endsWith('Pct') ? Math.round(v * 10) / 10 : Math.round(v));
for (const [id, b] of Object.entries(items.gearBases)) {
  const share = A.slotShare[b.slot];
  if (!share) continue;
  const c = A.classes[CLASS[b.requirementStat]], il = b.itemLevel || 1, scale = share * (il === 1 && !b.starter ? A.craftedStarter : 1);
  const ref = (k) => (set[k][0] + set[k][1] * (il - 1)) * scale, out = {};
  // a leather piece always carries its speed or crit (movement on body and feet, crit on head and hands)
  const own = { ...b.stats };
  if (CLASS[b.requirementStat] === 'leather' && !b.starter && !Object.keys(own).some((k) => A.caps[k])) own[['helm', 'gloves'].includes(b.slot) ? 'critChancePct' : 'moveSpeedPct'] = 1;
  for (const [k, v] of Object.entries(own)) {
    if (CORE.includes(k)) continue;
    const cap = A.caps[k];
    out[k] = cap ? (cap.base + cap.perItemLevel * (il - 1)) * c.flavour * (A.capScale[b.slot] ?? 1) : v;
  }
  // everything beyond the core (speed, crit, gloves' attack, a robe's magic) is paid for out of the core, at the class's flavourCost
  const W = items.requirements.weights, extra = Object.entries(out).reduce((a, [k, v]) => a + v * (W[k] || 0), 0) * c.flavourCost;
  const corePower = Object.entries(c.core).reduce((a, [k, [mult, from]]) => a + ref(from) * mult * (W[k] || 0), 0);
  const keep = Math.max(A.minCore, 1 - extra / corePower);
  for (const [k, [mult, from]] of Object.entries(c.core)) out[k] = ref(from) * mult * keep;
  const stats = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(k, v)]).filter(([, v]) => v));
  const i = text.indexOf(`"${id}": {`, text.indexOf('"gearBases": {')), s0 = text.indexOf('"stats": {', i), s1 = text.indexOf('}', s0) + 1;
  text = text.slice(0, s0) + '"stats": { ' + Object.entries(stats).map(([k, v]) => `"${k}": ${v}`).join(', ') + ' }' + text.slice(s1);
}
JSON.parse(text);
fs.writeFileSync('data/items.json', text);
