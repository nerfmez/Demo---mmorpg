// HUD navigation and stateless presentation. Original skill artwork stays in art.js.
import { expToNext, jobExpToNext } from '../core/character.js';
import { sigil } from './sigils.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg = body => `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
// Navigation decoration only. Skill illustrations come from art.js unchanged.
export function joystickMarks() {
  return svg('<path d="m24 4 3 4h-6zM44 24l-4 3v-6zM24 44l-3-4h6zM4 24l4-3v6z" fill="currentColor" stroke="none"/>');
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
