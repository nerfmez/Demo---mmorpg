// Physical role-colored coins; marks do not encode damage elements.
import {MOD_GROUPS} from './gemart.js';
const ROLE_CLASS={attack:'power',mechanics:'mechanic',support:'support'};
export const modRole=id=>ROLE_CLASS[MOD_GROUPS[id]]||'mechanic';
const glyphs={
  returning_shot:'M3 7h13l-4-4M16 7l-4 4M21 12a8 8 0 0 1-8 8H4M4 20l4-4M4 20l4 3',
  terminal_burst:'M2 12h9M8 8l4 4-4 4M17 5l2 5 4 2-4 2-2 5-2-5-4-2 4-2Z',
  chain_return:'M3 7l6 3 6-5 6 5-5 8-8 3M8 21l3-5M8 21l6 1',
  advancing_edge:'M3 17h9M9 13l4 4-4 4M12 11L19 2l3 2-8 11ZM13 13l4 3',
  gathering_cut:'M2 12h7M5 8l4 4-4 4M22 12h-7M19 8l-4 4 4 4M10 19h4',
  laceration:'M5 3l-2 15M12 5l-2 15M19 3l-2 15M19 18c-4 4-4 6 0 6s4-2 0-6',
  ash_detonation:'M12 2c4 7 7 8 7 13a7 7 0 0 1-14 0c0-5 6-7 7-13ZM6 21l-3 2M20 21l3 2M12 18v5',
  shatter:'M12 2l6 8-6 7-6-7ZM12 7l2 3-2 3-2-3ZM3 19l4 3M20 18l-3 4',
  following_field:'M3 16a9 5 0 1 0 18 0 9 5 0 1 0-18 0M12 16V3M8 7l4-4 4 4',
  binding_field:'M3 8l5 4-5 4M21 8l-5 4 5 4M9 3l3 5 3-5M9 21l3-5 3 5',
  healing_chain:'M3 7h6M6 4v6M15 17h6M18 14v6M9 8l6 8M11 16l4 1-1-4',
  healing_barrier:'M12 3l8 3v8l-8 7-8-7V6ZM8 11h8M12 7v8',
  breaking_ward:'M12 3l7 3v7l-7 8-7-8V6ZM9 7l4 4-3 4M1 12h3M20 12h3',
  spreading_hex:'M3 11Q7 5 11 11Q7 17 3 11ZM15 11Q19 5 23 11Q19 17 15 11ZM8 20h10M15 17l3 3-3 3',
  focused_pack:'M5 8l3-5 4 5 4-5 3 5v10l-7 4-7-4ZM9 12h6M12 9v6',
  guardian_bond:'M3 5l6 3v6l-6 4M21 5l-6 3v6l6 4M8 21h8M12 17v7',
  following_aura:'M3 17a9 4 0 1 0 18 0M8 14V4M16 14V4M5 7l3-3 3 3M13 7l3-3 3 3',
  cast_on_guard:'M3 3l8 3v7l-8 7M17 3l-5 9h7l-3 9 7-12h-6Z',

  short_stride:'M6 29h15l-5-5M21 29l-5 5M31 12h10M36 7v10M31 34h10M36 29v10',
  split:'M16 40V28M16 28L7 17M16 28L25 17M7 17v7M7 17h7M25 17v7M25 17h-7',
  pierce:'M6 28h35M32 20l9 8-9 8M16 16v24M24 16v24',
  bounce:'M7 35l10-17 11 18 13-19M34 17h7v7',
  burning_ground:'M9 37h30M15 31c-7-9 7-10 5-20 10 9 17 13 8 20M20 31l4-9 5 9',
  echo:'M10 13v25M17 18v15M24 22v7M31 18v15M38 13v25',
  wide_arc:'M8 33Q24 6 40 33M8 33l1-10M8 33l10-2M40 33l-1-10M40 33l-10-2',
  multistrike:'M8 35l12-24M19 35l12-24M30 35l12-24',
  frost_shift:'M9 17h16l-5-5M25 17l-5 5M39 32H23l5-5M23 32l5 5M14 25l5 6M14 31l5-6',
  knockback:'M7 14v24M16 26h24M29 16l11 10-11 10',
  concentrated:'M9 9l9 9M9 9v8M9 9h8M39 9l-9 9M39 9v8M39 9h-8M9 39l9-9M9 39v-8M9 39h8M39 39l-9-9M39 39v-8M39 39h-8M24 20v8M20 24h8',
  lingering:'M15 11h18M15 37h18M17 11v8l14 10v8M31 11v8L17 29v8M21 33h6',
  life_leech:'M24 10c0 8-12 12-12 20a12 12 0 0 0 24 0c0-8-12-12-12-20ZM19 29h10M24 24v10',
  spiked_ward:'M24 12l11 5v11l-11 10-11-10V17ZM24 6v6M8 16l5 4M40 16l-5 4M9 34l7-3M39 34l-7-3',
  pack_leader:'M14 14l5 5M34 14l-5 5M16 31l8 6 8-6-3-10H19ZM21 27h6M9 23l4 4M39 23l-4 4',
  cast_on_dodge:'M12 15a16 16 0 1 1-2 17M12 15H5M12 15V8M26 14l-8 13h9l-4 8 11-14h-9Z'
};
export function modCoin(inst){return `<span class="coin ${modRole(inst.id)}" data-coin="${inst.uid}" data-mod-id="${inst.id}"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="${glyphs[inst.id]}" transform="${['returning_shot','terminal_burst','chain_return','advancing_edge','gathering_cut','laceration','ash_detonation','shatter','following_field','binding_field','healing_chain','healing_barrier','breaking_ward','spreading_hex','focused_pack','guardian_bond','following_aura','cast_on_guard'].includes(inst.id)?'translate(0 0) scale(2)':''}"/></svg><i></i></span>`;}
