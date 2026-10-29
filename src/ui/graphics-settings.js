// Settings -> graphics, shared by the title menu and the in-game settings page.
// Presets (low/medium/high) or 'custom' with each choice of data/rendering.json -> graphics;
// anti-aliasing is its own row for every preset. Reads and changes only through `graphics`
// (main.js): get() -> {quality, values, antialias, dpr, buffer}, setQuality, setCustom, setAntialias.
import { renderConfig } from '../render/settings.js';

const PRESETS = [['low', 'ต่ำ (ลื่นสุด)'], ['medium', 'กลาง'], ['high', 'สูง'], ['custom', 'ปรับแต่งเอง']];
const SHADOWS = { 0: 'ปิด', 1024: 'กลาง', 2048: 'คมชัด' };

const row = (label, buttons) => `<div class="gfx-row"><span class="gfx-label">${label}</span><div class="switch pg-seg2 gfx-seg">${buttons}</div></div>`;
const button = (on, attrs, text) => `<button class="btn ${on ? 'on' : ''}" aria-pressed="${on}" ${attrs}>${text}</button>`;

/** Resolution choices this screen can show (none above its own pixels), as % of the screen. */
export function resolutionChoices(dpr) {
  const list = renderConfig.graphics.pixelRatios.filter((r) => r <= dpr + 1e-6);
  if (!list.length) list.push(Math.min(...renderConfig.graphics.pixelRatios));
  return list.map((ratio) => ({ ratio, percent: Math.round((ratio / dpr) * 100) }));
}

export function graphicsSettingsHtml(graphics) {
  const { quality, values, antialias, dpr, buffer } = graphics.get();
  const custom = quality === 'custom';
  const drawn = Math.min(dpr, values.pixelRatio);
  let html = row('คุณภาพ', PRESETS.map(([k, t]) => button(quality === k, `data-act="quality" data-q="${k}"`, t)).join(''));
  html += row('ลดรอยหยัก', renderConfig.graphics.antialias.map((n) => button(antialias === n, `data-act="gfx-aa" data-v="${n}"`, n ? `×${n}` : 'ปิด')).join(''));
  if (custom) {
    html += row('ความละเอียด', resolutionChoices(dpr).map(({ ratio, percent }) => button(Math.abs(drawn - ratio) < 1e-6, `data-act="gfx" data-k="pixelRatio" data-v="${ratio}"`, `${percent}%`)).join(''));
    html += row('เงา', renderConfig.graphics.shadowMapSizes.map((n) => button(values.shadowMapSize === n, `data-act="gfx" data-k="shadowMapSize" data-v="${n}"`, SHADOWS[n] ?? n)).join(''));
    html += row('แสงเรืองและโทนสี', [true, false].map((v) => button(values.post === v, `data-act="gfx" data-k="post" data-v="${v}"`, v ? 'เปิด' : 'ปิด')).join(''));
    html += row('ลดความละเอียดเองเมื่อเครื่องหนัก', [true, false].map((v) => button(values.dynres === v, `data-act="gfx" data-k="dynres" data-v="${v}"`, v ? 'เปิด' : 'ปิด')).join(''));
  }
  const parts = [`ความละเอียด ${Math.round((drawn / dpr) * 100)}% ของจอ (${buffer[0]}×${buffer[1]})`, values.shadowMapSize ? 'มีเงา' : 'ไม่มีเงา', antialias ? `ลดรอยหยัก ×${antialias}` : 'ไม่ลดรอยหยัก'];
  html += `<div class="muted gfx-now">ตอนนี้: ${parts.join(' · ')}</div>`;
  html += `<div class="muted">ถ้า iPad กระตุกหรือเด้งออก ให้เลือก "ต่ำ" หรือปิดลดรอยหยัก</div>`;
  return `<div class="gfx-settings">${html}</div>`;
}

/** Handle a settings tap; true when it was a graphics control (the caller re-renders). */
export function graphicsAction(target, graphics) {
  const act = target.dataset.act;
  if (act === 'quality') graphics.setQuality(target.dataset.q);
  else if (act === 'gfx-aa') graphics.setAntialias(Number(target.dataset.v));
  else if (act === 'gfx') {
    const raw = target.dataset.v;
    graphics.setCustom(target.dataset.k, raw === 'true' ? true : raw === 'false' ? false : Number(raw));
  } else return false;
  return true;
}
