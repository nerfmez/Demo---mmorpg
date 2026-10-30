// Skill bars page (owner, 2026-10-28; docs/SKILL-GROWTH-TH.md): pick a skill on the left; on the right
// its grade, proficiency and bars, and gauges of what the points do in the HUD's bar look (a dark track
// of cells: ten cells are the skill before any points, gains light up gold past the white notch, losses
// drain to a red outline). + / - change a draft and the gauges move at once (patched in place, so the
// cells animate); "ยืนยัน" applies it, and taking points back out costs gold.
import { art } from './art.js';
import { computeSkill } from '../core/skills.js';
import { fanShots } from '../core/build-rules.js';
import { growthState, growthType, respecCost } from '../core/skill-growth.js';

const ICON = {
  dmg: '<path d="M19 3l-9 9-2 5 5-2 9-9V3z" fill="#ffd8a8"/><path d="M6 14l4 4M4 20l3-3" stroke="#ff9a52" stroke-width="2.4" stroke-linecap="round"/>',
  cd: '<path d="M6 3h12M6 21h12" stroke="#bff4ff" stroke-width="2" stroke-linecap="round"/><path d="M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9" stroke="#bff4ff" stroke-width="1.6" fill="none"/><path d="M9 19c1-2 5-2 6 0z" fill="#7fe3f0"/>',
  size: '<circle cx="12" cy="12" r="8.5" stroke="#d9c2ff" stroke-width="2" fill="none" stroke-dasharray="3 2.2"/><circle cx="12" cy="12" r="4" fill="#b48cff"/>',
  count: '<circle cx="6.5" cy="15" r="3.2" fill="#ffb35c"/><circle cx="12" cy="8" r="3.2" fill="#ffd166"/><circle cx="17.5" cy="15" r="3.2" fill="#ffb35c"/>',
  mp: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z" fill="#6fb6ff"/><path d="M10 15a2.5 2.5 0 0 0 2.5 2.5" stroke="#e0f2ff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  dps: '<path d="M13 2L5 13h6l-2 9 9-12h-6z" fill="#ffcf5c"/>',
  mps: '<path d="M9 4c2 3 4 5 4 7.5a4 4 0 0 1-8 0C5 9 7 7 9 4z" fill="#6fb6ff"/><path d="M16 11c1.5 2 3 3.5 3 5.3a3 3 0 0 1-6 0c0-1.8 1.5-3.3 3-5.3z" fill="#9fd0ff"/>',
};
const COLOR = { dmg: '#ff9a52', cd: '#4fd1dc', size: '#b48cff', count: '#ffb35c', mp: '#5aa8ff', dps: '#ffcf5c', mps: '#5aa8ff' };

/** What a skill would be with these bar points: per hit, cooldown, size or projectiles, MP, and the
 * per-second rates against one target (a fan's extra projectiles count as the build checks count them). */
export function barStats(g, id, bars) {
  const { ch, data } = g, st = growthState(ch, data, id), slot = ch.slots.find((x) => x.skill === id);
  const tmp = { ...ch, slots: [{ skill: id, mods: slot ? slot.mods : [] }], skillGrowth: { ...ch.skillGrowth, [id]: { grade: st.grade, bars, earned: st.earned, prof: st.prof } } };
  const s = computeSkill(tmp, data, g.derived, 0), pace = Math.max(s.cooldown, s.castTime, 0.35);
  const reach = s.radius ? s.radius ** 2 : (s.arc || 1) * (s.range || 1) ** 2;
  return { dmg: s.damage || 0, cd: s.cooldown, size: reach, count: s.projectiles || 1, mp: s.cost, dps: (s.damage || 0) * fanShots(s, data) / pace, mps: s.cost / pace };
}

function columns(hasCount) {
  return [
    [hasCount ? 'ดาเมจต่อลูก' : 'ดาเมจต่อครั้ง', 'dmg', 1, (v) => Math.round(v).toLocaleString(), 'แรงขึ้น', 'เบาลง'],
    ['คูลดาวน์', 'cd', -1, (v) => v.toFixed(2) + ' วิ', 'เร็วขึ้น', 'ช้าลง'],
    hasCount ? ['จำนวนลูก', 'count', 1, (v) => v + ' ลูก', 'เพิ่ม', 'ลด'] : ['ขนาดวง', 'size', 1, (v, b) => '×' + (v / b).toFixed(2), 'ใหญ่ขึ้น', 'เล็กลง'],
    ['มานาต่อครั้ง', 'mp', -1, (v) => Math.round(v).toLocaleString(), 'ประหยัด', 'เปลือง'],
    ['ดาเมจต่อวินาที (เป้าเดียว)', 'dps', 1, (v) => Math.round(v).toLocaleString(), 'แรงขึ้น', 'เบาลง'],
    ['มานาต่อวินาที', 'mps', -1, (v) => v.toFixed(1), 'ประหยัด', 'เปลือง'],
  ];
}

const draftOf = (ui, id, st) => (ui.sel.barDraft?.id === id ? ui.sel.barDraft.bars : { ...st.bars });

/** The bars page (growth workspace, kind "bars"). */
export function barsWorkspace(ui, { costHtml, frame }) {
  const { game: g, sel } = ui, { ch, data } = g;
  const ids = Object.keys(ch.skills).filter((id) => growthType(data, data.skills.combat[id]));
  const cur = ids.includes(sel.growthPick) ? sel.growthPick : ids[0];
  const list = ids.map((id) => {
    const st = growthState(ch, data, id);
    return `<button class="pg-row ${id === cur ? 'on' : ''}" data-act="growth-pick" data-id="${id}" aria-pressed="${id === cur}"><span class="pg-ic">${art('skill', id)}</span><span class="pg-tx"><b>${data.skills.combat[id].nameTh}</b><small>เกรด ${st.grade} · แต้ม ${st.spent}/${st.earned} (เกรดนี้ได้ ${st.limit})${st.free ? ` · ว่าง ${st.free}` : ''}</small></span>${st.free ? '<i class="pg-dot" aria-label="มีแต้มว่าง"></i>' : ''}</button>`;
  }).join('');
  const note = '<p class="muted">ตอนนี้มีหลอดเฉพาะ ฟันกวาด ลูกธนูพราน และลูกไฟ · สกิลอื่นตามมาทีหลัง</p>';
  return frame(list || '<p class="muted">ยังไม่มีสกิลที่มีหลอด · เรียนฟันกวาด ลูกธนูพราน หรือลูกไฟก่อน</p>', note, cur ? barsDetail(ui, cur, costHtml) : '');
}

function barsDetail(ui, id, costHtml) {
  const { game: g } = ui, { ch, data } = g, def = data.skills.combat[id], st = growthState(ch, data, id), G = data.progression.skillGrowth;
  const draft = draftOf(ui, id, st), hasCount = st.barIds.includes('count'), atService = g.nearby().skillUpgrade;
  const rows = st.barIds.map((b) => `<div class="sb-bar" data-bar="${b}"><span class="sb-name">${G.bars[b].nameTh}</span>
    <button class="sb-step" data-act="bar-step" data-id="${id}" data-bar="${b}" data-d="-1" aria-label="ลด${G.bars[b].nameTh}">−</button>
    <span class="sb-pips">${'<i></i>'.repeat(G.grades.S)}</span>
    <button class="sb-step" data-act="bar-step" data-id="${id}" data-bar="${b}" data-d="1" aria-label="เพิ่ม${G.bars[b].nameTh}">+</button>
    <span class="sb-hint">${G.bars[b].hint}</span></div>`).join('');
  const gauges = columns(hasCount).map(([label, key]) => `<div class="sb-stat" data-stat="${key}"><span class="sb-badge"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[key]}</svg></span><span class="sb-nm"><b>${label}</b><small></small></span><span class="sb-gauge" style="--c:${COLOR[key]}">${'<i></i>'.repeat(20)}</span><span class="sb-word"></span></div>`).join('');
  const grade = st.nextGrade
    ? `<div class="sb-grade-up"><div class="cost">${costHtml(ch, data, st.nextCost)}</div><button class="btn" data-act="bar-grade" data-id="${id}" ${atService ? '' : 'disabled'}>อัปเป็นเกรด ${st.nextGrade} (รวม ${G.gradeTotals[st.nextGrade]} แต้ม · หลอดละ ${G.grades[st.nextGrade]})</button>${atService ? '' : '<small class="muted">อัปเกรดได้ที่จุดคราฟต์หรือครูฝึก</small>'}</div>`
    : '<p class="muted">เกรดสูงสุดแล้ว</p>';
  const prof = st.earned >= st.total ? 'ความชำนาญเต็มแล้ว' : st.waiting ? `ความชำนาญเต็ม · เกรด ${st.grade} มีได้ ${st.limit} แต้ม · อัปเป็นเกรด ${st.nextGrade} เพื่อรับแต้มต่อ` : `ความชำนาญ ${Math.floor(st.prof)} / ${st.need} · ใช้สกิลนี้ระหว่างสู้เพื่อรับแต้ม`;
  return `<section class="card sb-card" data-bars="${id}">
    <div class="seeker-hero">${art('skill', id)}<div><h3>${def.nameTh}</h3><span>ประเภท${G.types[def.growth].nameTh} · หลอด ${st.barIds.map((b) => G.bars[b].nameTh).join(' · ')}</span></div><span class="sb-grade">เกรด ${st.grade}</span></div>
    <div class="sb-prof"><span style="width:${st.earned >= st.total ? 100 : Math.round(st.prof / st.need * 100)}%"></span></div><small class="muted">${prof}</small>
    <p class="sb-left" data-left></p>
    <div class="sb-bars">${rows}</div>
    <div class="sb-key"><span><i class="k-gain"></i>เพิ่มจากแต้ม</span><span><i class="k-loss"></i>เสียไป</span><span>เส้นขาว = ก่อนลงแต้ม</span></div>
    <div class="sb-stats">${gauges}</div>
    <div class="pg-foot"><span><p data-bar-cost></p><small>ลงแต้มฟรี · ถอนแต้มออกเสียทอง</small></span><span class="sb-actions"><button class="btn" data-act="bar-reset" data-id="${id}">คืนค่า</button><button class="btn primary" data-act="bar-apply" data-id="${id}">ยืนยัน</button></span></div>
    ${grade}
  </section>`;
}

/** Bring the page in line with the draft without rebuilding it (so the gauge cells animate). */
export function patchBars(ui) {
  const card = ui.body.querySelector('[data-bars]');
  if (!card) return;
  const { game: g } = ui, { ch, data } = g, id = card.dataset.bars, st = growthState(ch, data, id), draft = draftOf(ui, id, st);
  const used = st.barIds.reduce((a, b) => a + (draft[b] || 0), 0);
  for (const row of card.querySelectorAll('.sb-bar')) {
    const b = row.dataset.bar, n = draft[b] || 0;
    row.querySelectorAll('.sb-pips i').forEach((p, i) => { p.className = i < n ? 'on' : i < st.cap ? 'open' : ''; });
    const [minus, plus] = row.querySelectorAll('.sb-step');
    minus.disabled = n <= 0; plus.disabled = n >= st.cap || used >= st.earned;
  }
  card.querySelector('[data-left]').innerHTML = `แต้มว่าง <b>${st.earned - used}</b> จาก ${st.earned} · เกรด ${st.grade} มีได้รวม <b>${st.limit}</b> แต้ม หลอดละไม่เกิน <b>${st.cap}</b>`;
  const zero = Object.fromEntries(st.barIds.map((b) => [b, 0])), base = barStats(g, id, zero), now = barStats(g, id, draft);
  for (const [, key, dir, fmt, better, worse] of columns(st.barIds.includes('count'))) {
    const el = card.querySelector(`[data-stat="${key}"]`), ch1 = now[key] / base[key] - 1, pct = Math.round(Math.abs(ch1) * 100);
    const good = Math.abs(ch1) < 0.005 ? 0 : (ch1 > 0) === (dir > 0) ? 1 : -1, n = Math.min(10, Math.round(Math.abs(ch1) * 10));
    el.querySelectorAll('.sb-gauge i').forEach((cell, i) => {
      cell.style.setProperty('--d', (Math.abs(i - 9.5) * 0.018).toFixed(3) + 's');
      cell.className = i < 10 ? (good < 0 && i >= 10 - n ? 'loss' : 'base') : (good > 0 && i < 10 + n ? 'gain' : '');
    });
    el.querySelector('small').textContent = fmt(now[key], base[key]);
    const w = el.querySelector('.sb-word');
    w.className = 'sb-word ' + (good === 0 ? 's' : good > 0 ? 'g' : 'b');
    w.textContent = good === 0 ? 'เท่าเดิม' : (good > 0 ? '▲ ' + better : '▼ ' + worse) + ' ' + pct + '%';
  }
  const removed = st.barIds.reduce((a, b) => a + Math.max(0, st.bars[b] - (draft[b] || 0)), 0), gold = respecCost(ch, data, removed);
  const changed = st.barIds.some((b) => (draft[b] || 0) !== st.bars[b]);
  card.querySelector('[data-bar-cost]').innerHTML = !changed ? 'ยังไม่เปลี่ยน' : removed ? `ถอนออก ${removed} แต้ม · ใช้ <b class="${gold > ch.gold ? 'no' : ''}">${gold.toLocaleString()} G</b>` : 'ลงแต้มเพิ่ม · ไม่เสียอะไร';
  card.querySelector('[data-act="bar-apply"]').disabled = !changed || gold > ch.gold;
  card.querySelector('[data-act="bar-reset"]').disabled = !changed;
}

/** + / - on a bar: change the draft within the grade cap and the points earned. */
export function stepBar(ui, id, bar, d) {
  const { ch, data } = ui.game, st = growthState(ch, data, id), draft = { ...draftOf(ui, id, st) };
  const used = st.barIds.reduce((a, b) => a + (draft[b] || 0), 0), n = (draft[bar] || 0) + d;
  if (n < 0 || n > st.cap || (d > 0 && used >= st.earned)) return;
  draft[bar] = n;
  ui.sel.barDraft = { id, bars: draft };
}
