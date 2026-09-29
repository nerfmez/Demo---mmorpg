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
