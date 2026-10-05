// Potion bottles drawn as inline SVG: red (HP) or blue (MP); the round flask grows with its size.
const LIQUID = { hp: ['#ff7a7a', '#c8243a'], mp: ['#86ccff', '#2a5fd0'] };
const RADIUS = { s: 5.2, m: 6.6, l: 8 };
// every bottle gets its own gradient id: a hidden copy (a closed panel) would otherwise blank it
let serial = 0;

export function potionArt(def) {
  if (!def) return '';
  const [light, dark] = LIQUID[def.group] || LIQUID.hp, r = RADIUS[def.size] || RADIUS.m;
  const cx = 12, cy = 22.5 - r, neckW = 2.6 + r * 0.2, neckTop = cy - r - 3.2, id = `${def.group}-${def.size}-${++serial}`;
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="potion-art"><defs><linearGradient id="pl-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`
    + `<rect x="${cx - neckW / 2}" y="${neckTop}" width="${neckW}" height="${3.6}" fill="#e9f4ff40" stroke="#f6efe0" stroke-width="1"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9f4ff33"/>`
    + `<path d="M${cx - r * 0.96} ${cy - r * 0.25}A${r} ${r} 0 1 0 ${cx + r * 0.96} ${cy - r * 0.25}Z" fill="url(#pl-${id})"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f6efe0" stroke-width="1.1"/>`
    + `<rect x="${cx - neckW / 2 - 0.7}" y="${neckTop - 2}" width="${neckW + 1.4}" height="2.4" rx="0.8" fill="#b98a58" stroke="#f3e2c0" stroke-width="0.6"/>`
    + `<path d="M${cx - r * 0.55} ${cy - r * 0.05}q0.6 -1.6 2 -2" stroke="#ffffffb0" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>`;
}
