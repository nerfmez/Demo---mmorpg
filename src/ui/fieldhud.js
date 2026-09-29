// The field HUD's lightweight symbol language. No generated/raster art or game rules.
import { expToNext, jobExpToNext } from '../core/character.js';
import { sigil } from './sigils.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg = body => `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const paths = {
  slash: '<path d="M11 36L35 10l4-1-1 5-23 25z" fill="currentColor"/><path d="m10 30 9 9M13 36l-5 5m-2-2 4 4" stroke-width="3"/>',
  hunter_shot: '<path d="M16 7c23 5 23 29 0 34M16 7v34M8 24h31m-7-6 7 6-7 6"/><path d="m30 19 10 5-10 5" fill="currentColor" stroke="none"/>',
  whirl_blade: '<path d="M9 19C14 2 41 11 40 27 39 40 19 44 10 35M9 19l-2-9m2 9 9-4M34 20c-4-9-19-7-21 2-3 10 14 14 18 5" stroke-width="3"/>',
  firebolt: '<path d="M8 39 32 8l-3 13 11-3-22 20-6-6z" fill="currentColor" stroke="none"/><path d="m8 25 10-12m8 26 13-13" opacity=".55"/>',
  chain_spark: '<path d="M28 5 13 25h11l-4 17 16-22H25z" fill="currentColor" stroke="none"/><path d="m9 12 5-4m20 29 6-5M6 30l5-5"/>',
  stone_burst: '<path d="m7 37 6-16 7 5 6-20 7 21 4-7 5 17z"/><path d="m20 37 6-31 7 31z" fill="currentColor" opacity=".75"/><path d="M5 42h38"/>',
  frost_nova: '<path d="m24 4 3 14 13-7-9 11 14 2-14 4 9 12-13-8-3 13-4-14L7 40l10-12-14-4 14-3-10-11 13 8z" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="4" fill="#fff" stroke="none"/>',
  venom_mire: '<ellipse cx="24" cy="33" rx="18" ry="7"/><path d="M24 7c-4 6-10 11-10 17a10 10 0 0 0 20 0c0-6-6-11-10-17z"/><circle cx="11" cy="11" r="2"/><circle cx="39" cy="20" r="2"/>',
  hex: '<path d="m24 6 5 12 13 2-10 8 3 13-11-7-11 7 3-13-10-8 13-2z"/><circle cx="24" cy="24" r="19" opacity=".4"/>',
  ward: '<path d="m24 5 15 6v12c0 10-15 20-15 20S9 33 9 23V11z"/><path d="m24 11 6 13-6 12-6-12z" fill="currentColor"/>',
  war_cry: '<path d="M9 19h7L28 9v30L16 29H9z"/><path d="M34 16c6 4 6 12 0 16m5-22c10 8 10 20 0 28"/>',
  healing_spring: '<path d="M24 5c6 9 13 16 13 23a13 13 0 0 1-26 0c0-7 7-14 13-23z"/><path d="M24 20v13m-6-6h12" stroke-width="3"/>',
  spirit_wolf: '<path d="m9 37 3-17-3-12 11 9h8l11-9-3 12 3 17-15 6z"/><path d="m17 26 3 1m8 0 3-1M21 34h6l-3 3z"/>',
  dash: '<circle cx="29" cy="8" r="4" fill="currentColor" stroke="none"/><path d="m17 19 7-5 7 7 9 1m-16-8-6 13 8 6-2 10m-6-16-6 10H5" stroke-width="4"/><path d="M5 17h8M3 23h8" opacity=".65"/>',
  roll: '<path d="M37 16a16 16 0 1 0 1 15M37 6v10H27" stroke-width="3"/><path d="M29 30c3-7-8-12-12-5s6 12 10 7" stroke-width="3"/>',
  blink: '<path d="m25 4 4 15 15 5-15 5-4 15-5-15-15-5 15-5z" fill="currentColor" stroke="none"/><path d="M6 8h8M3 15h9M5 36h9" opacity=".6"/>',
  leap_slam: '<path d="M6 34C8 5 37 5 40 34m-8-6 8 6 4-9M29 40h16M5 41h16" stroke-width="3"/>',
  compass: '<path d="m24 4 3 4h-6zM44 24l-4 3v-6zM24 44l-3-4h6zM4 24l4-3v6z" fill="currentColor" stroke="none"/>',
};
// Names follow the live skill IDs (leap is used by the movement compiler).
paths.leap = paths.leap_slam;
export const FIELD_SKILL_IDS = Object.freeze(Object.keys(paths));
export function skillSymbol(id) {
  return `<span class="field-symbol" data-field-skill="${esc(id)}">${paths[id] ? svg(paths[id]) : sigil('compass')}</span>`;
}
export function fieldIcon(name) {
  const icons = {
    menu: '<path d="M10 13h28M10 24h28M10 35h28"/>',
    bag: '<path d="M11 17h26l2 23H9zM18 17v-5a6 6 0 0 1 12 0v5M10 24h28M20 22v7h8v-7"/>',
    pin: '<path d="M37 19c0 10-13 24-13 24S11 29 11 19a13 13 0 0 1 26 0z"/><circle cx="24" cy="18" r="4"/>',
    coin: '<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="12" opacity=".4"/><path d="M29 17h-6a4 4 0 1 0 0 8h2a4 4 0 1 1 0 8h-6m5-19v22"/>',
    map: '<path d="m5 12 12-5 14 5 12-5v29l-12 5-14-5-12 5zM17 7v29m14-24v29"/>',
    person: '<circle cx="24" cy="15" r="8"/><path d="M8 41c0-17 32-17 32 0z" fill="currentColor"/>',
    tree: '<path d="M24 13v11M10 37l14-13 14 13"/><circle cx="24" cy="8" r="5"/><circle cx="9" cy="39" r="5"/><circle cx="39" cy="39" r="5"/>',
    scroll: '<path d="M12 7h25v34H12zM18 17h13M18 24h13M18 31h8M9 7v9"/>',
    gear: '<circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="4"/><path d="M24 5v6m0 26v6M5 24h6m26 0h6M10 10l5 5m18 18 5 5M10 38l5-5m18-18 5-5"/>',
  };
  return icons[name] ? svg(icons[name]) : sigil(name);
}
export function seekerBrand() {
  return `${sigil('compass')}<span><b>SEEKER</b><small>FIND · EXPLORE · UNRAVEL</small></span>`;
}
export function xpMarkup() {
  const seg = name => `<div class="xpseg ${name}"><b class="xp-label"></b><div class="xp-track"><i class="fill"></i></div><span></span></div>`;
  return `<div class="xpstrip field-xp" aria-label="ค่าประสบการณ์"><small class="field-motto">FOCUS ON THE ADVENTURE.</small>${seg('exp')}${seg('job')}<small class="field-motto end">SAME SKY. DIFFERENT JOURNEYS.</small></div>`;
}
export function xpPresentation(ch, data) {
  const value = (v, total, maxed, prefix) => {
    const percent = maxed ? 100 : Math.max(0, Math.min(100, (Number(v) || 0) / Math.max(1, total) * 100));
    return { percent, text: maxed ? 'MAX' : `${prefix}${percent.toFixed(1)}%` };
  };
  return {
    exp: value(ch.exp, expToNext(data, ch.level), ch.level >= data.progression.character.maxLevel, 'EXP '),
    job: value(ch.jobExp, jobExpToNext(data, ch.jobLevel), ch.jobLevel >= data.progression.job.maxLevel, ''),
  };
}
export function trackerMarkup(game, id, pos) {
  const {ch, data} = game;
  if (!id) return '<div class="field-quest-row"><b>ภารกิจครบแล้ว</b><small>ลองคราฟต์ของใหม่หรือล่าบอสอีกครั้ง</small></div>';
  const q = data.quests.quests[id], st = ch.progress.quests[id];
  const distance = pos ? Math.round(Math.hypot(pos.x-game.player.x, pos.z-game.player.z)) : null;
  const secondary = [...data.quests.main, ...data.quests.side].find(key => key !== id && ch.progress.quests[key]?.status === 'active');
  const row = (def, state, cls, far = null) => `<div class="field-quest-row ${cls}"><span class="quest-diamond" aria-hidden="true">◇</span><div><b>${esc(def.nameTh)}</b><small>${esc(def.descTh)}</small></div><span class="quest-meta"><strong>${Math.min(state?.progress || 0, def.count)}/${def.count}</strong>${far !== null ? `<i>${far} ม.</i>` : ''}</span></div>`;
  return row(q, st, 'tracked', distance) + (secondary ? row(data.quests.quests[secondary], ch.progress.quests[secondary], 'secondary') : '');
}
