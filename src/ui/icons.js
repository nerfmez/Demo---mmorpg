// Inline SVG icons for skills and menus (no image files needed).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS = {
  slash: S('<path d="M4 19c6-1 12-6 15-15-2 7-7 12-15 15z" fill="#ffe7a0" stroke="#fff8e0" stroke-width="1"/><path d="M5 20l3-3" stroke="#c9a060" stroke-width="2.5" stroke-linecap="round"/>'),
  fire: S('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="#ff8a3a"/><path d="M12 11c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 1 1 2 1 0-1-1-2 0-3z" fill="#ffe07a"/>'),
  stone: S('<path d="M3 20l4-9 3 4 3-10 4 8 2-3 2 10z" fill="#d8b98a" stroke="#6a5438" stroke-width="1"/>'),
  ward: S('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#8fd8ff" stroke="#e8f8ff" stroke-width="1.2"/><path d="M12 6v12" stroke="#ffffff88" stroke-width="1.5"/>'),
  heal: S('<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" fill="#6fe0b0"/><path d="M12 10v7M8.5 13.5h7" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  dash: S('<path d="M3 12h11M9 7l5 5-5 5M15 7l5 5-5 5" stroke="#dff2ff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  roll: S('<path d="M18 8a7 7 0 1 0 1 6" stroke="#f3e2c0" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M19 3v5h-5" stroke="#f3e2c0" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  blink: S('<path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z" fill="#c6b4ff" stroke="#fff" stroke-width="0.8"/>'),
  bag: S('<path d="M6 8h12l1 12H5z" fill="#c8955c" stroke="#fff3" /><path d="M9 8a3 3 0 0 1 6 0" stroke="#f3e2c0" stroke-width="2" fill="none"/>'),
  book: S('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="#6a8fd8" stroke="#dfe8ff" stroke-width="1"/><path d="M12 6v14" stroke="#dfe8ff"/>'),
  tree: S('<circle cx="12" cy="5" r="2.5" fill="#ffd166"/><circle cx="5" cy="17" r="2.5" fill="#c59bff"/><circle cx="19" cy="17" r="2.5" fill="#7be07a"/><path d="M12 7.5L6 15M12 7.5l6 7.5M7.5 17h9" stroke="#fff9" stroke-width="1.5"/>'),
  person: S('<circle cx="12" cy="7" r="4" fill="#f6d2b5"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7z" fill="#cf3a30"/>'),
  gear: S('<circle cx="12" cy="12" r="3.2" fill="none" stroke="#e8e2d0" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="#e8e2d0" stroke-width="2.2" stroke-linecap="round"/>'),
  hammer: S('<path d="M4 20l9-9" stroke="#c8955c" stroke-width="3" stroke-linecap="round"/><path d="M11 5l4-2 6 6-2 4z" fill="#b9bcc4" stroke="#fff6" />'),
  plus: S('<path d="M12 5v14M5 12h14" stroke="#fff8" stroke-width="2" stroke-linecap="round"/>'),
};

export function icon(name) {
  return ICONS[name] || ICONS.plus;
}
