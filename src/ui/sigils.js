// One-colour marks. Geometry is shared by journal stamps and engraved mod gems.
export const SIGILS = {
 compass:'M12 2v3m0 14v3M2 12h3m14 0h3M15.5 8.5l-2 5-5 2 2-5zM20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 camp:'M5 21l14-4M5 17l14 4M12 3c2 4 6 5 6 9a6 6 0 0 1-12 0c0-2 1-3 3-5l1 3c1-2 2-4 2-7z',
 book:'M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1zM12 5v15M6 8h3m6 0h3M6 12h3m6 0h3',
 lantern:'M9 5V3h6v2M6 7h12l-2 12H8zM5 21h14M7 5h10M12 10v6m-3-3h6',
 tree:'M12 22V11M8 16l4 3 4-3M5 14c-4-4-1-8 2-8 0-6 10-6 10 0 5 0 6 7 2 9-3 2-5 0-7-1-2 2-4 2-7 0z',
 river:'M8 3c14 4-6 8 8 11M9 9c-12 7 16 6 4 12M2 5h3m13 14h4',
 horizon:'M3 15h18M7 11a5 5 0 0 1 10 0M12 1v3M3 6l2 2m14 0 2-2M4 20h16',
 quill:'M5 21L19 3c-9-2-16 4-14 13 7 2 10-4 14-13M9 13h6M9 17l10 4',
 signpost:'M12 3v19M3 6h14l4 3-4 3H3zM21 14H7l-4 3 4 3h14',
 flag:'M5 22V3c5-4 9 4 15 0v10c-6 4-10-4-15 0',
 split:'M12 21V12L4 4m8 8 8-8M3 10V3h7M14 3h7v7',
 pierce:'M4 19L20 3M14 3h6v6M9 4v6m0 5v5M15 4v2m0 5v9',
 bounce:'M3 18l7-13 7 13 4-9M16 10l5-1 1 5M3 21h18',
 burning_ground:'M3 21h18M5 18h14M12 3c1 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-4 3-5v4c2-2 2-5 2-8z',
 echo:'M9 5a7 7 0 1 0 0 14M13 5a7 7 0 1 1 0 14M7 9a3 3 0 1 0 0 6m6-6a3 3 0 1 1 0 6',
 wide_arc:'M3 19A17 17 0 0 0 21 3M3 19A13 13 0 0 0 17 7M3 19l9-3m-9 3 3-9',
 multistrike:'M4 19L10 4M9 20L15 5M14 21L20 6',
 frost_shift:'M12 3v18M4 7l16 10M4 17L20 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4m15 9-4 1 1 4',
 knockback:'M3 6v12M7 5l7 7-7 7m7-14 7 7-7 7',
 concentrated:'M3 3l6 6M3 7V3h4M21 3l-6 6m6-2V3h-4M3 21l6-6m-6 2v4h4m14 0-6-6m6 2v4h-4',
 lingering:'M5 3h14M5 21h14M7 3v4l10 10v4M17 3v4L7 17v4M8 7h8m-8 10h8',
 life_leech:'M12 2c3 5 7 9 7 13a7 7 0 1 1-14 0c0-4 4-8 7-13zM9 15h6M12 12v6',
 spiked_ward:'M12 4l7 3v6c0 5-7 8-7 8s-7-3-7-8V7zM12 1v3M2 5l3 3m14 0 3-3M1 13h4m14 0h4M12 8v9m-3-5h6',
 pack_leader:'M9 15a3 3 0 0 1 6 0l3 3q-1 5-6 2-5 3-6-2zM7 10a1.5 2 0 1 1-3 0 1.5 2 0 1 1 3 0m4-4a1.5 2 0 1 1-3 0 1.5 2 0 1 1 3 0m5 0a1.5 2 0 1 1-3 0 1.5 2 0 1 1 3 0m4 4a1.5 2 0 1 1-3 0 1.5 2 0 1 1 3 0',
 cast_on_dodge:'M2 8h7m-7 4h5m-5 4h3M17 2L9 13h6l-2 9 9-12h-6z',
 heart:'M12 21L3 12C-3 3 8 0 12 7c4-7 15-4 9 5z',
 shield:'M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5zM12 6v11',
 drop:'M12 2c4 6 8 10 8 14a8 8 0 1 1-16 0c0-4 4-8 8-14z',
 sword:'M4 21l5-5m-3-3 5 5M8 14L19 3h3v3L11 17',
 plus:'M12 4v16M4 12h16',
 eye:'M1 12c6-11 16-11 22 0-6 11-16 11-22 0zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  returning_shot:'M3 7h13l-4-4M16 7l-4 4M21 12a8 8 0 0 1-8 8H4M4 20l4-4M4 20l4 3',terminal_burst:'M2 12h9M8 8l4 4-4 4M17 5l2 5 4 2-4 2-2 5-2-5-4-2 4-2Z',chain_return:'M3 7l6 3 6-5 6 5-5 8-8 3M8 21l3-5M8 21l6 1',advancing_edge:'M3 17h9M9 13l4 4-4 4M12 11L19 2l3 2-8 11ZM13 13l4 3',gathering_cut:'M2 12h7M5 8l4 4-4 4M22 12h-7M19 8l-4 4 4 4M10 19h4',laceration:'M5 3l-2 15M12 5l-2 15M19 3l-2 15M19 18c-4 4-4 6 0 6s4-2 0-6',ash_detonation:'M12 2c4 7 7 8 7 13a7 7 0 0 1-14 0c0-5 6-7 7-13ZM6 21l-3 2M20 21l3 2M12 18v5',shatter:'M12 2l6 8-6 7-6-7ZM12 7l2 3-2 3-2-3ZM3 19l4 3M20 18l-3 4',following_field:'M3 16a9 5 0 1 0 18 0 9 5 0 1 0-18 0M12 16V3M8 7l4-4 4 4',binding_field:'M3 8l5 4-5 4M21 8l-5 4 5 4M9 3l3 5 3-5M9 21l3-5 3 5',healing_chain:'M3 7h6M6 4v6M15 17h6M18 14v6M9 8l6 8M11 16l4 1-1-4',healing_barrier:'M12 3l8 3v8l-8 7-8-7V6ZM8 11h8M12 7v8',breaking_ward:'M12 3l7 3v7l-7 8-7-8V6ZM9 7l4 4-3 4M1 12h3M20 12h3',spreading_hex:'M3 11Q7 5 11 11Q7 17 3 11ZM15 11Q19 5 23 11Q19 17 15 11ZM8 20h10M15 17l3 3-3 3',focused_pack:'M5 8l3-5 4 5 4-5 3 5v10l-7 4-7-4ZM9 12h6M12 9v6',guardian_bond:'M3 5l6 3v6l-6 4M21 5l-6 3v6l6 4M8 21h8M12 17v7',following_aura:'M3 17a9 4 0 1 0 18 0M8 14V4M16 14V4M5 7l3-3 3 3M13 7l3-3 3 3',cast_on_guard:'M3 3l8 3v7l-8 7M17 3l-5 9h7l-3 9 7-12h-6Z',short_stride:'M3 15h7l-3-3M10 15l-3 3M14 6h7M17.5 2.5v7M14 19h7M17.5 15.5v7'
};
export function sigil(name) {return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${SIGILS[name]||SIGILS.plus}"/></svg>`;}
export function effectSigil(n) {
 const k=Object.keys(n.effects||{}).join(' ').toLowerCase();
 if(n.type==='job')return 'flag';if(n.type==='origin')return 'compass';
 if(k.includes('heal')||k.includes('hp')||k.includes('leech'))return 'heart';
 if(k.includes('mp')||k.includes('magic'))return 'drop';
 if(k.includes('defense')||k.includes('barrier')||k.includes('taken'))return 'shield';
 if(k.includes('dot')||k.includes('poison'))return 'river';
 if(k.includes('duration')||k.includes('cooldown'))return 'lingering';
 if(k.includes('summon'))return 'pack_leader';
 if(k.includes('radius')||k.includes('area')||k.includes('arc'))return 'wide_arc';
 if(k.includes('projectile')||k.includes('crit'))return 'pierce';
 if(k.includes('move'))return 'signpost';return 'sword';
}
