// Status icons (owner, 2026-10-31): each debuff a clear symbol in its colour - over a monster's name bar,
// under the boss bar (with its name and seconds left) and beside the hero's. What a unit has comes from
// core/statuses.js statusList; names, colours and icon keys from data/progression.json
// combat.statusDisplay. Plain inline SVG (no pictures), drawn in currentColor.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  stun: '<path d="M12 3l2.2 5.3 5.8.5-4.4 3.8 1.3 5.6L12 15.3 7.1 18.2l1.3-5.6L4 8.8l5.8-.5z" fill="currentColor" stroke="none"/>',
  shock: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z" fill="currentColor" stroke="none"/>',
  chill: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2.5L15 4M9 20l3-2.5 3 2.5"/>',
  burn: '<path d="M12 22c-4 0-7-2.8-7-6.8 0-3.6 2.6-5.6 3.6-8.7.8 1.6 1.6 2.6 2.9 3.1C11.6 6.4 13 4 15.6 2c-.4 3.4 3.4 6.5 3.4 11.4 0 5-3.1 8.6-7 8.6z" fill="currentColor" stroke="none"/>',
  poison: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" stroke="none"/><circle cx="10" cy="14" r="1.3" fill="#123" stroke="none"/><circle cx="14" cy="14" r="1.3" fill="#123" stroke="none"/>',
  bleed: '<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" fill="currentColor" stroke="none"/>',
  exposure: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m13 7-3 5h4l-3 5"/>',
  hex: '<circle cx="12" cy="12" r="8"/><path d="M12 8a4 4 0 1 1-4 4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  charged: '<circle cx="12" cy="12" r="9"/><path d="M13 5.5 8 13h4l-1 5.5 5-7.5h-4z" fill="currentColor" stroke="none"/>',
  root: '<path d="M4 4l16 16M20 4L4 20M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8.5"/>',
  taunt: '<path d="M8 3v6M16 3v6M3 8h6M15 8h6M8 15v6M16 15v6M3 16h6M15 16h6"/>',
};
export const statusIcon = (key) => svg(ICONS[key] || ICONS.stun);

/** The icon chips for a status list. opts.timer: the seconds left under each; opts.names: its name too. */
export function statusChips(data, list, opts = {}) {
  const D = data.progression.combat.statusDisplay || {};
  return list.map((s) => {
    const d = D[s.id]; if (!d) return '';
    // stacks: a small badge on a bare icon, or ×N in a named chip; seconds left after the name when timed
    const n = s.stacks > 1 && !opts.names ? `<b class="stn">${s.stacks}</b>` : '';
    const label = opts.names ? `<span class="stl">${esc(d.nameTh)}${s.stacks > 1 ? ` ×${s.stacks}` : ''}${opts.timer && s.left != null ? ` <small>${Math.ceil(s.left)}</small>` : ''}</span>` : '';
    return `<i class="sti" style="--c:${d.color}" title="${esc(d.nameTh)}">${statusIcon(d.icon)}${n}${label}</i>`;
  }).join('');
}
/** A key that changes only when the row would look different (ids, stacks, and whole seconds if timed). */
export const statusKey = (list, timer = false) => list.map((s) => s.id + (s.stacks > 1 ? s.stacks : '') + (timer && s.left != null ? ':' + Math.ceil(s.left) : '')).join(',');
