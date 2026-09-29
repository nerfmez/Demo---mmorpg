import {SIGILS} from './sigils.js';
// A single small gemstone asset family. Only the engraving identifies the mod;
// tint is decorative, never a compatibility, rarity or activation signal.
export const GEM_TINTS={
 split:'#577d96',pierce:'#587e94',bounce:'#597988',burning_ground:'#9b674e',echo:'#777194',wide_arc:'#97704e',multistrike:'#8f6554',frost_shift:'#548494',knockback:'#79735b',concentrated:'#926953',lingering:'#767089',life_leech:'#835f67',spiked_ward:'#608277',pack_leader:'#64826a',cast_on_dodge:'#667794'
};
function engravedGem(id,tint){
 const mark=`<path d="${SIGILS[id]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
 return `<g data-gem="${id}"><path d="M40 8h48l31 34-10 52-45 28-45-28L9 42z" fill="#101f2c"/>
 <path d="M41 11h46l27 31-9 49-41 26-41-26-9-49z" fill="${tint}" stroke="#b6c6cd" stroke-width="1.5"/>
 <path d="M41 11l9 19h28l9-19M14 42l22 7 14-19M114 42L92 49 78 30" fill="#ffffff2b"/>
 <path d="M23 91l13-42 4 34 24 34M105 91L92 49 88 83l-24 34" fill="#0918285c"/>
 <path d="M50 30h28l14 19-4 34-24 17-24-17-4-34z" fill="#13253744" stroke="#081c3255" stroke-width="1.5"/>
 <path d="M41 12L16 42M42 14h44M23 91l39 24" fill="none" stroke="#f2f5e490" stroke-width="2"/>
 <g transform="translate(33 35) scale(2.55)" color="#172a40" opacity=".9">${mark}</g>
 <g transform="translate(32 34) scale(2.55)" color="#f5ecd8">${mark}</g></g>`;
}
export const MOD_ART=Object.fromEntries(Object.entries(GEM_TINTS).map(([id,tint])=>[id,engravedGem(id,tint)]));
