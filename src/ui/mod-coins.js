// Physical role-colored coins; marks do not encode damage elements.
export const modRole=id=>id==='concentrated'?'power':['life_leech','spiked_ward','pack_leader','lingering'].includes(id)?'support':'mechanic';
const glyphs={
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
export function modCoin(inst){return `<span class="coin ${modRole(inst.id)}" data-coin="${inst.uid}" data-mod-id="${inst.id}"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="${glyphs[inst.id]}"/></svg><i></i></span>`;}
