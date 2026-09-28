// Inline SVG icons for skills and menus (no image files needed).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS = {
  slash: S('<path d="M4 19c6-1 12-6 15-15-2 7-7 12-15 15z" fill="#ffe7a0" stroke="#fff8e0" stroke-width="1"/><path d="M5 20l3-3" stroke="#c9a060" stroke-width="2.5" stroke-linecap="round"/>'),
  whirl: S('<path d="M12 3a9 9 0 1 1-8.5 6" stroke="#ffe7a0" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M12 8a4 4 0 1 1-3.8 2.7" stroke="#fff8e0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M2 7l2 3 3-2" stroke="#ffe7a0" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  arrow: S('<path d="M4 20L18 6" stroke="#e8d0a8" stroke-width="2.4" stroke-linecap="round"/><path d="M14 4h6v6z" fill="#dfe4ee"/><path d="M4 20l1-5M4 20l5-1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'),
  fire: S('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="#ff8a3a"/><path d="M12 11c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 1 1 2 1 0-1-1-2 0-3z" fill="#ffe07a"/>'),
  spark: S('<path d="M13 2L5 13h6l-2 9 9-12h-6z" fill="#bfe6ff" stroke="#fff" stroke-width="1"/>'),
  stone: S('<path d="M3 20l4-9 3 4 3-10 4 8 2-3 2 10z" fill="#d8b98a" stroke="#6a5438" stroke-width="1"/>'),
  frost: S('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="#bfeaff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="#ffffff"/>'),
  mire: S('<ellipse cx="12" cy="16" rx="9" ry="4" fill="#6a9a2a"/><circle cx="8" cy="11" r="2.2" fill="#b6ec5a"/><circle cx="14" cy="8" r="1.6" fill="#b6ec5a"/><circle cx="16" cy="13" r="1.2" fill="#d8ff8a"/>'),
  hex: S('<circle cx="12" cy="12" r="8.5" stroke="#c6a4ff" stroke-width="1.8" fill="none"/><path d="M12 4l2.4 5.6 6 .6-4.6 4 1.4 5.8L12 17l-5.2 3 1.4-5.8-4.6-4 6-.6z" fill="#9a6cff"/>'),
  ward: S('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#8fd8ff" stroke="#e8f8ff" stroke-width="1.2"/><path d="M12 6v12" stroke="#ffffff88" stroke-width="1.5"/>'),
  warcry: S('<path d="M5 9h3l6-5v16l-6-5H5z" fill="#ffc860"/><path d="M17 8c1.5 1 2.5 2.5 2.5 4s-1 3-2.5 4M19 5c2.5 1.8 4 4.4 4 7s-1.5 5.2-4 7" stroke="#fff3c0" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  heal: S('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" fill="#6fe0b0"/><path d="M12 10v7M8.5 13.5h7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  wolf: S('<path d="M4 20l2-9-2-7 5 4h6l5-4-2 7 2 9-8 2z" fill="#9fd8ff"/><circle cx="9.5" cy="13" r="1.2" fill="#fff"/><circle cx="14.5" cy="13" r="1.2" fill="#fff"/><path d="M11 17h2l-1 1.5z" fill="#3a5a9a"/>'),
  dash: S('<path d="M3 12h11M9 7l5 5-5 5M15 7l5 5-5 5" stroke="#dff2ff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  roll: S('<path d="M18 8a7 7 0 1 0 1 6" stroke="#f3e2c0" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M19 3v5h-5" stroke="#f3e2c0" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  blink: S('<path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z" fill="#c6b4ff" stroke="#fff" stroke-width="0.8"/>'),
  leap: S('<path d="M3 19c4-12 14-12 18 0" stroke="#ffe0a0" stroke-width="2.4" fill="none" stroke-dasharray="3 2" stroke-linecap="round"/><path d="M17 15l4 4 1-5" stroke="#ffe0a0" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="21" cy="21" rx="3" ry="1" fill="#fff6"/>'),
  bag: S('<path d="M6 8h12l1 12H5z" fill="#c8955c" stroke="#fff3" /><path d="M9 8a3 3 0 0 1 6 0" stroke="#f3e2c0" stroke-width="2" fill="none"/>'),
  book: S('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="#6a8fd8" stroke="#dfe8ff" stroke-width="1"/><path d="M12 6v14" stroke="#dfe8ff"/>'),
  tree: S('<circle cx="12" cy="5" r="2.5" fill="#ffd166"/><circle cx="5" cy="17" r="2.5" fill="#c59bff"/><circle cx="19" cy="17" r="2.5" fill="#7be07a"/><path d="M12 7.5L6 15M12 7.5l6 7.5M7.5 17h9" stroke="#fff9" stroke-width="1.5"/>'),
  person: S('<circle cx="12" cy="7" r="4" fill="#f6d2b5"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7z" fill="#cf3a30"/>'),
  scroll: S('<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5" fill="#f0e2c0" stroke="#c8a870"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#8a6a3a" stroke-width="1.6" stroke-linecap="round"/><circle cx="17" cy="16" r="2.5" fill="#ffd166"/>'),
  map: S('<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" fill="#a8d08a" stroke="#f4f0e0" stroke-width="1"/><path d="M9 3v15M15 6v15" stroke="#f4f0e0" stroke-width="1"/><circle cx="12" cy="11" r="2" fill="#d8483a"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2" fill="none" stroke="#e8e2d0" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="#e8e2d0" stroke-width="2.2" stroke-linecap="round"/>'),
  hammer: S('<path d="M4 20l9-9" stroke="#c8955c" stroke-width="3" stroke-linecap="round"/><path d="M11 5l4-2 6 6-2 4z" fill="#b9bcc4" stroke="#fff6" />'),
  portal: S('<ellipse cx="12" cy="12" rx="6" ry="9" stroke="#8fe8ff" stroke-width="2.4" fill="#2a5a7a"/><ellipse cx="12" cy="12" rx="3" ry="5.5" fill="#bff4ff"/>'),
  sword: S('<path d="M19 3l-9 9-2 5 5-2 9-9V3z" fill="#dfe4ee"/><path d="M6 14l4 4M4 20l3-3" stroke="#a8744a" stroke-width="2.4" stroke-linecap="round"/>'),
  staff: S('<path d="M6 21L17 7" stroke="#8a5c3a" stroke-width="2.4" stroke-linecap="round"/><circle cx="18" cy="5.5" r="3" fill="#8fe0ff"/>'),
  plus: S('<path d="M12 5v14M5 12h14" stroke="#fff8" stroke-width="2" stroke-linecap="round"/>'),
};

export function icon(name) {
  return ICONS[name] || ICONS.plus;
}
