import {SIGILS} from './sigils.js';
// Fifteen physical mod coins. Engravings identify effects; these are not currency.
// Keep the GEM_TINTS export name for existing consumers; no gem is rendered.
// Presentation only; never consulted for eligibility or gameplay.
export const MOD_GROUPS=Object.freeze({
 split:'mechanics',pierce:'mechanics',bounce:'mechanics',burning_ground:'mechanics',echo:'mechanics',wide_arc:'mechanics',multistrike:'mechanics',frost_shift:'mechanics',knockback:'mechanics',concentrated:'attack',lingering:'mechanics',life_leech:'support',spiked_ward:'support',pack_leader:'support',cast_on_dodge:'mechanics'
});
export const MOD_GROUP_COLORS=Object.freeze({attack:'#a83c35',mechanics:'#326e9e',support:'#37754b'});
// Backward-compatible export name; these are coin engraving colors, not gems.
export const GEM_TINTS=Object.freeze(Object.fromEntries(Object.entries(MOD_GROUPS).map(([id,group])=>[id,MOD_GROUP_COLORS[group]])));
// Shared metal/rim geometry; face marks stay distinct and legible at 32px.
const MOD_MARKS={...SIGILS,concentrated:'M3 3l6 6M4 9h5V4M21 3l-6 6M15 4v5h5M3 21l6-6M9 20v-5H4M21 21l-6-6M20 15h-5v5'};
function modCoin(id) {
 const tint=GEM_TINTS[id],group=MOD_GROUPS[id];
 const mark=MOD_MARKS[id];
 return `<g data-mod-coin="${id}" data-mod-group="${group}">
 <circle cx="64" cy="67" r="55" fill="#59432d"/>
 <circle cx="64" cy="62" r="55" fill="#ae824a" stroke="#60472f" stroke-width="2"/>
 <path d="M16 63a48 48 0 0 1 87-29" fill="none" stroke="#f6dfa1" stroke-width="4" stroke-linecap="round"/>
 <path d="M112 62a48 48 0 0 1-85 31" fill="none" stroke="#805a34" stroke-width="4" stroke-linecap="round"/>
 <circle cx="64" cy="62" r="49" fill="none" stroke="${tint}" stroke-width="2.4"/>
 <circle cx="64" cy="62" r="44" fill="#dfbe79" stroke="#8b653a" stroke-width="2"/>
 <path d="M26 59a38 38 0 0 1 70-17" fill="none" stroke="#f8e3a9" stroke-width="2" stroke-linecap="round"/>
 <g data-mod-symbol="${id}" transform="translate(31.6 29.6) scale(2.7)" fill="none" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
 <path d="${mark}" transform="translate(0 .65)" stroke="#f8e2a3"/>
 <path d="${mark}" stroke="${tint}"/>
 </g></g>`;
}
export const MOD_ART=Object.fromEntries(Object.entries(GEM_TINTS).map(([id])=>[id,modCoin(id)]));
