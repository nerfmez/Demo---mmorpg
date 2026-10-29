// One-time content pass (owner, 2026-10-29, docs/STATS-TH.md): weapon and shield base stats follow the
// stats they ask for (items.weaponIdentity). A main-line weapon carries only damage, a shield its guard stats.
// A main-and-secondary weapon deals its tier's damage (handRules reference) less damageCut, plus its
// secondary stat's identity at that stat's value for its item level and hands; a DEX/AGI dagger also gives up mainCut for DEX's identity; a main-and-secondary shield adds the identity to its
// guard. Writes data/items.json; re-running gives the same stats.
// node scripts/gear-identity.mjs
import fs from 'node:fs';
let text = fs.readFileSync('data/items.json', 'utf8');
const items = JSON.parse(text), ID = items.weaponIdentity, H = items.handRules;
const round = (k, v) => (k.endsWith('Pct') ? Math.round(v * 10) / 10 : Math.round(v));
const GUARD = ['defense', 'maxHp', 'blockChancePct'];
for (const [id, b] of Object.entries(items.gearBases)) {
  if ((b.slot !== 'weapon' && b.slot !== 'offhand') || b.weaponType === 'greatshield') continue;
  const hands = b.slot === 'offhand' ? 'off' : items.weaponTypes[b.weaponType].hands, il = b.itemLevel || 1;
  const value = (stat) => (ID.values[stat].base + ID.values[stat].perItemLevel * (il - 1)) * ID.handScale[hands];
  const daggerDex = b.weaponType === 'dagger' && b.requirementStat === 'DEX';
  const keep = 1 - (b.secondaryStat ? ID.damageCut : 0) - (daggerDex ? ID.mainCut : 0), out = {};
  if (b.slot === 'offhand') {
    for (const k of GUARD) if (b.stats[k]) out[k] = b.stats[k]; // a shield keeps its guard
  } else {
    // damage at the tier's reference, in the base's own attack:magic mix (staves, wands and INT weapons deal magic)
    const caster = ['staff', 'wand'].includes(b.weaponType) || b.requirementStat === 'INT';
    const atk = b.stats.attack || 0, mag = b.stats.magic || 0, hi = Math.max(atk, mag), minor = hi ? Math.round(Math.min(atk, mag) / (atk + mag) * 20) / 20 : 0; // in 5% steps, so a re-run is stable
    const ref = b.starter ? H.reference.starter : H.reference.base + H.reference.perItemLevel * (il - 1);
    const dmg = b.secondaryStat || daggerDex ? ref * H[hands].baseFactor * keep : atk + mag;
    out[caster ? 'magic' : 'attack'] = dmg * (1 - minor); if (minor) out[caster ? 'attack' : 'magic'] = dmg * minor;
  }
  if (daggerDex) out[ID.stats.DEX] = value(ID.stats.DEX);
  if (b.secondaryStat) { const k = ID.stats[b.secondaryStat]; out[k] = (out[k] || 0) + value(k); }
  const stats = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(k, v)]));
  const i = text.indexOf(`"${id}": {`, text.indexOf('"gearBases": {')), s0 = text.indexOf('"stats": {', i), s1 = text.indexOf('}', s0) + 1;
  text = text.slice(0, s0) + '"stats": { ' + Object.entries(stats).map(([k, v]) => `"${k}": ${v}`).join(', ') + ' }' + text.slice(s1);
}
fs.writeFileSync('data/items.json', text);
JSON.parse(text);
