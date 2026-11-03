// The wheel Job Tree as the field journal of maps (owner, 2026-11-03: "สมุดเส้นทางสกิล", artifact
// NNGNp6fkVzKu1ue9k4Boq8, is the skill tree page). A compass of the six sectors, a map per sector (its
// ladder a winding road, its side line, its two job destinations), the camp (the centre), the jobs round
// a second compass, and a map per job branch. Spending a point inks the road from the place before it,
// footprints follow the pen, the place is stamped and ripples, and a line is written in the field record;
// changing page lays the next map over the last and tapes it down.
// The screen only reads the rules' answers (jobNodeState, jobRoute) and calls them to spend
// (allocateJobNode, allocateJobRoute, respecJob); layout lives in wheel-map-layout.js.
import {
  jobNodeState, allocateJobNode, jobRoute, allocateJobRoute, respecCost, respecJob, currentJob, nodeCost,
  jobPointsSpent, jobChoiceLevel,
} from '../core/character.js';
import { bookPages, pageMap, pageOf, radius, SECTOR_ORDER, SECTOR_ANGLE, SIDE_LINES, JOB_SECTOR } from './wheel-map-layout.js';
import { effectLabel, effectValue } from './effect-format.js';


// ---------- ink drawings (24px box) ----------
const G = {
  camp: '<path d="M5 19 12 6l7 13M9 19l3-5 3 5"/><path d="M3 19h18"/>',
  path: '<path class="f" d="M8 17c-1.6 0-2.4-1.3-2-2.6.3-1.2 1.6-1.7 2.6-1.2 1 .5 1.3 1.7.8 2.6-.3.6-.8 1.2-1.4 1.2z"/><path class="f" d="M15 10c-1.6 0-2.4-1.3-2-2.6.3-1.2 1.6-1.7 2.6-1.2 1 .5 1.3 1.7.8 2.6-.3.6-.8 1.2-1.4 1.2z"/>',
  hill: '<path d="M3 18 9 9l3 4 3-5 6 10z"/>',
  bridge: '<path d="M3 15h18M5 15c2-5 12-5 14 0M7 15v4M17 15v4M12 11v4"/>',
  stream: '<path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 13c3-2 5 2 8 0s5-2 8 0M4 18c3-2 5 2 8 0s5-2 8 0"/>',
  pine: '<path d="M12 3 7 10h3l-4 6h5v4h2v-4h5l-4-6h3z"/>',
  tower: '<path d="M8 21V9h8v12M7 9l5-5 5 5M10 13h4M11 21v-4h2v4"/>',
  slope: '<path d="M3 19 19 7M7 19l2-2M11 19l2-2M15 19l2-2M19 19V7"/>',
  fort: '<path d="M4 20V10h3v2h3v-2h4v2h3v-2h3v10zM10 20v-4h4v4"/>',
  pass: '<path d="M2 19 8 8l4 6 4-9 6 14"/><path d="M11 19l1-3 1 3"/>',
  arena: '<path d="M5 5l14 14M19 5 5 19M4 8l4-4M16 4l4 4"/>',
  meadow: '<path d="M4 19c1-4 2-6 2-9M9 19c0-3 1-6 3-8M14 19c0-3 0-5-1-8M19 19c-1-3-2-5-4-7"/>',
  castle: '<path d="M3 21V11h3V8h3v3h6V8h3v3h3v10zM10 21v-5h4v5M5 8V5M19 8V5"/>',
  anvil: '<path d="M4 9h12c0 3 2 4 5 4v1H15l1 3h3v2H6v-2h3l1-3c-3 0-6-2-6-5z"/>',
  mist: '<path d="M3 9h12M6 13h15M3 17h11"/>',
  crystal: '<path d="M12 3 7 10l5 11 5-11zM7 10h10M12 3v18"/>',
  well: '<circle cx="12" cy="14" r="5"/><path d="M5 8h14M8 8V4M16 8V4"/>',
  rune: '<circle cx="12" cy="12" r="8"/><path d="M12 6v12M8 9l8 6M16 9l-8 6"/>',
  library: '<path d="M4 20V6h4v14M10 20V4h4v16M16 20l2-14 3 .5-2 13.5z"/>',
  star: '<path class="f" d="M12 3l2.2 6.3H21l-5.4 4 2 6.4L12 15.8 6.4 19.7l2-6.4L3 9.3h6.8z"/>',
  seal: '<circle cx="12" cy="12" r="8"/><path d="M12 6l1.8 4.2 4.5.4-3.4 3 1 4.4-3.9-2.4-3.9 2.4 1-4.4-3.4-3 4.5-.4z"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  paw: '<circle class="f" cx="12" cy="15" r="3.6"/><circle class="f" cx="6.5" cy="10" r="1.8"/><circle class="f" cx="10" cy="6.5" r="1.8"/><circle class="f" cx="14" cy="6.5" r="1.8"/><circle class="f" cx="17.5" cy="10" r="1.8"/>',
  coin: '<circle cx="12" cy="12" r="7.5"/><path d="M12 7.5v9M9.5 9.5h4a1.6 1.6 0 0 1 0 3.2h-3a1.6 1.6 0 0 0 0 3.2h4"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/>',
  bow: '<path d="M7 3q12 9 0 18M7 3v18M3 12h16l-3-2.5m3 2.5-3 2.5"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  swords: '<path d="M4 4l11 11M20 4 9 15M13 17l-2 2-2-2M11 17l2 2 2-2M4 4h3v3M20 4h-3v3"/>',
};
const JOB_GLYPH = { guardian: 'shield', heavy: 'anvil', blade: 'swords', duelist: 'arena', power: 'bow', hunter: 'paw', trapper: 'bridge', spellarcher: 'crystal', elemage: 'flame', summoner: 'pine', priest: 'heart', spellblade: 'rune' };
const GLYPH_BY = [
  [/^(single)/, 'arena'], [/^(pack|perTarget|area)/, 'rune'], [/^(crit|dualCrit)/, 'star'], [/^(projectile|penetration|heavyPenetration)/, 'slope'],
  [/^(spell|elemental)/, 'crystal'], [/^(maxMp|mpRegen|manaCost|mpOnHit)/, 'well'], [/^(haste|dual|moveSpeed|extraMovement|dodge)/, 'pass'],
  [/^(hpRegen|leech)/, 'stream'], [/^(maxHp|heavyHp)/, 'meadow'], [/^(defense|selfTaken|teamTaken|resist|tenacity)/, 'tower'],
  [/^(block|barrier|maxShield)/, 'fort'], [/^(heal|teamBuff|potion)/, 'heart'], [/^(summon|companion)/, 'paw'], [/^trap/, 'bridge'],
  [/^(gold|gear|material)Find/, 'coin'], [/^(control|dot|poison)/, 'mist'], [/^teamDamage/, 'library'], [/^(melee|heavy|attack)/, 'hill'],
];
function glyphOf(n) {
  if (n.type === 'origin') return 'camp';
  if (n.type === 'job') return JOB_GLYPH[n.job] || 'castle';
  if (n.type === 'keystone') return 'seal';
  const k = Object.keys(n.effects || {})[0] || '';
  return GLYPH_BY.find(([re]) => re.test(k))?.[1] || 'path';
}
const SECTOR_META = {
  int: { name: 'หอคอยในหมอก', en: 'the misted towers', c: '#5a6aa8', art: '<path d="M-34 26V-22l7-13 7 13v48M4 26v-56l9-16 9 16v56M-58 12h44M-6 20h58M-50 26h104"/><path d="M-30-6h6M10-12h6M10 0h6"/><path class="f" d="M40-34l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM-48-24l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z"/>' },
  dexint: { name: 'หุบผาลูกศรเวท', en: 'the spellshot gorge', c: '#4f8f8a', art: '<path d="M-58 26L-38-14l14 20 14-26 16 22 18-30 26 54"/><path d="M-44-34L18-46M10-50l8 4-6 6"/><path class="f" d="M-48-36l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/>' },
  dex: { name: 'ป่าสนนายพราน', en: 'the hunter pines', c: '#6f9a5a', art: '<path d="M-52 26l11-22h-6l9-16h-5l9-14 9 14h-5l9 16h-6l11 22zM-30 26v-4"/><path d="M-12 26l9-18h-5l7-13h-4l7-11 7 11h-4l7 13h-5l9 18z"/><path d="M28-26q24 26 0 52M28-26v52M16 0h32l-6-4m6 4-6 4"/>' },
  strdex: { name: 'ทุ่งลานประลอง', en: 'the dueling fields', c: '#c08a3e', art: '<path d="M-54 24l16-28 16 28zM-38-4v28M-16 24l14-24 14 24zM-2 0v24M-60 26h120"/><path d="M24-22l28 32M52-22l-28 32M28-14l6-6M46-20l6 6"/><path d="M-38-4v-12l8 3-8 3"/>' },
  str: { name: 'เส้นทางเหล็กกล้า', en: 'the iron road', c: '#b5654a', art: '<path d="M-60 28q36-36 60-30 26 2 60 30"/><path d="M-24 2v-30h8v6h6v-6h8v6h6v-6h8v6h6v-6h8V2"/><path d="M-6 2v-10a6 6 0 0 1 12 0v10M0-28v-18l12 4-12 4"/><path d="M34 6l10-4 10 4-2 12-8 6-8-6z"/>' },
  intstr: { name: 'วิหารแห่งศรัทธา', en: 'the temple of faith', c: '#9a6a9a', art: '<path d="M-36 26V-4h72v30M-44-4L0-30 44-4M-22 26V-4M-8 26V-4M8 26V-4M22 26V-4M-50 26h100"/><path d="M0-38v-12M-12-36l-6-9M12-36l6-9"/><path d="M-6-14a6 6 0 0 1 12 0"/>' },
};
const SIDE_NAME = { heavy: 'ทางแยกช่างตีเหล็ก', dual: 'ทางแยกดาบคู่' };
const ROLE_TH = { pack: 'กวาดฝูง', single: 'เป้าเดี่ยว', team: 'ช่วยทีม', survival: 'เอาตัวรอด', income: 'หาของ' };
const KIND = { minor: 'ทางเดิน · โหนดเล็ก', notable: 'จุดสำคัญ · โหนดเด่น', keystone: 'ปลายสาย · จุดเปลี่ยน', job: 'ปลายทางอาชีพ', origin: 'จุดเริ่มต้น' };
const NOTES = {
  str: [[230, 455, -5, 'ทางลัด? น้ำลึกเกินไป'], [1030, 70, 3, 'ได้ยินเสียงค้อนตีเหล็ก']],
  strdex: [[260, 450, -4, 'ลานประลองเปิดทุกเช้า'], [1000, 66, 3, 'คนถือดาบสองเล่มชนะสามยกติด']],
  dex: [[240, 430, -4, 'รอยเท้ากวางสด ๆ'], [980, 60, 3, 'ระวังกับดักของนายพราน']],
  dexint: [[230, 430, -5, 'ลมในหุบพาลูกศรเลี้ยวได้'], [990, 60, 4, 'หินเรืองแสงตอนกลางคืน']],
  int: [[230, 430, -5, 'อย่าดื่มน้ำบ่อหลังเที่ยงคืน'], [980, 62, 3, 'ดาวเรียงกันทุกสี่คืน']],
  intstr: [[230, 430, -4, 'ระฆังวิหารดังทุกเย็น'], [990, 62, 3, 'แสงเทียนไม่เคยดับ']],
  camp: [[640, 90, -3, 'ทุกเส้นทางเริ่มจากกองไฟนี้']],
};

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const num2 = (n) => String(n).padStart(2, '0');
function rnd(seed) { let x = seed * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
// a wobbly closed blob (ink never dries perfectly round), deterministic from its seed
function blob(cx, cy, r, seed, wob = 0.13) {
  const R = rnd(seed), k = 16, pts = [];
  for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, rr = r * (1 + wob * (R() * 2 - 1) + 0.05 * Math.sin(a * 3 + seed)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  let d = '';
  for (let i = 0; i < k; i++) { const p = pts[i], q = pts[(i + 1) % k], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; d += (i ? ' Q' : `M${((pts[k - 1][0] + p[0]) / 2).toFixed(1)} ${((pts[k - 1][1] + p[1]) / 2).toFixed(1)} Q`) + `${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`; }
  return d + 'Z';
}
// a hand-drawn curve between two points (a gentle S, seeded by the names so it never changes)
function curve(a, b, seed) {
  const h = [...seed].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 997, 7) / 997 - 0.5;
  const dx = b.x - a.x, dy = b.y - a.y, nx = -dy, ny = dx, k = 0.18 + h * 0.2;
  return `M${a.x} ${a.y} C${a.x + dx * 0.35 + nx * k} ${a.y + dy * 0.35 + ny * k} ${a.x + dx * 0.65 - nx * k * 0.6} ${a.y + dy * 0.65 - ny * k * 0.6} ${b.x} ${b.y}`;
}
function label(parent, attrs, text) {
  // Thai stacks marks over neighbouring letters: a stroked copy underneath keeps every glyph whole
  const g = el('g', {}, parent), h = el('text', { ...attrs, class: `${attrs.class || ''} fm-halo` }, g), f = el('text', attrs, g);
  const set = (t) => { h.textContent = t; f.textContent = t; }; set(text);
  return { g, set };
}
function glyph(name, parent, size = 24, x = -12, y = -12) {
  const g = el('g', { class: 'fm-glyph', transform: `translate(${x} ${y}) scale(${size / 24})` }, parent);
  g.innerHTML = G[name] || G.path; return g;
}
function ripples(layer, x, y, r, delay = 0) {
  for (let i = 0; i < 2; i++) { const c = el('circle', { class: 'fm-ripple', cx: x, cy: y, r, style: `--d:${(delay + i * 0.18).toFixed(2)}s` }, layer); setTimeout(() => c.remove(), (delay + 1.5) * 1000); }
}
const cleanName = (n) => (n.nameTh || '').replace(/\s*\(เด่น\)/, '');

export function createWheel(root, ui) {
  const { data } = ui.game, tree = data.jobtree, N = tree.nodes;
  const ch = () => ui.game.ch;
  const pages = bookPages(tree), byId = Object.fromEntries(pages.map((p) => [p.id, p]));
  const linear = ['overview', 'camp', ...SECTOR_ORDER.map((s) => `sector.${s}`), 'jobs'];
  const state = ui.wheelState || (ui.wheelState = { page: 'overview', log: null });
  if (!byId[state.page]) state.page = 'overview';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = null, sel = null, confirm = false, turning = false, animating = 0, destroyed = false;
  const pending = new Set();
  const short = () => pageEl.clientHeight < 340;

  // ---------- the field record ----------
  const entryText = (id, day) => {
    const n = N[id], fx = Object.entries(n.effects || {}).filter(([k]) => k !== 'perTargetCap')[0];
    if (n.type === 'job') return `วันที่ ${day} · เลือกอาชีพ ${n.nameTh}`;
    const name = n.pass ? '' : cleanName(n), gain = fx ? `${effectLabel(fx[0])} ${effectValue(fx[0], fx[1])}` : '';
    return `วันที่ ${day} · ${name && !gain.startsWith(name) ? name + ' · ' : ''}${gain || name}`;
  };
  if (!state.log) { const own = ch().jobNodes.filter((id) => id !== tree.origin && N[id]); state.log = own.slice(-3).reverse().map((id) => entryText(id, own.indexOf(id) + 1)); if (!state.log.length) state.log = ['วันที่ 0 · ออกจากค่ายพักแรม']; }

  root.innerHTML = `
    <div class="fm-book">
      <nav class="fm-tabs" aria-label="บท"></nav>
      <div class="fm-ribbon" aria-hidden="true"></div>
      <div class="fm-spread">
        <header class="fm-top">
          <span class="fm-logo">S.</span>
          <span class="fm-crumb">บันทึกการสำรวจ &nbsp;/&nbsp; <b data-crumb></b></span>
          <span class="fm-sp"></span>
          <button class="fm-tool" data-f="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 5l2.5 7L12 19l-2.5-7z" fill="currentColor" fill-opacity=".25"/></svg><span>แผนที่รวม</span></button>
          <button class="fm-tool fm-exit" data-f="hub" aria-label="เมนูหลัก"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          <button class="fm-tool" data-f="respec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/></svg><span>คืนแต้ม</span></button>
          <div class="fm-points"><span class="fm-n" data-pts></span><small>แต้มพร้อมบันทึก<br><i data-lv></i></small></div>
          <button class="fm-tool fm-exit" data-f="exit" aria-label="ปิดสมุด กลับเข้าเกม"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </header>
        <main class="fm-page" data-page></main>
        <footer class="fm-bottom">
          <div class="fm-log"><h3>Field record · บันทึกล่าสุด</h3><ol data-log></ol></div>
          <div class="fm-legend" data-legend hidden>
            <span><svg viewBox="0 0 22 12"><path d="M1 6h20" stroke="#a99c80" stroke-width="1.4" stroke-dasharray="2 4" stroke-linecap="round"/></svg>ทางที่ยังไม่เดิน</span>
            <span><svg viewBox="0 0 22 12"><path d="M1 6h20" stroke="#2d433c" stroke-width="2.4" stroke-linecap="round"/></svg>ทางที่บันทึกแล้ว</span>
            <span><svg viewBox="0 0 22 12"><circle cx="11" cy="6" r="5" fill="#f8f0da" stroke="#4b7568" stroke-width="1.4"/></svg>ไปต่อได้</span>
            <span><svg viewBox="0 0 22 12"><circle cx="11" cy="6" r="5" fill="#a64b3c"/></svg>ปลายสาย</span>
          </div>
          <div class="fm-pager"><button data-f="prev" aria-label="หน้าก่อน">←</button><span class="fm-pg" data-pg></span><button data-f="next" aria-label="หน้าถัดไป">→</button></div>
        </footer>
        <div class="fm-curl" aria-hidden="true"></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s), pageEl = $('[data-page]'), legend = $('[data-legend]');

  // ---------- tabs ----------
  const tabDefs = [['overview', '00', 'แผนที่รวม', '#6b7a64'], ['camp', '01', 'ค่ายพักแรม', '#8a7a4a'],
    ...SECTOR_ORDER.map((s, i) => [`sector.${s}`, num2(i + 2), tree.sectors[s], SECTOR_META[s].c]), ['jobs', '08', 'อาชีพ', '#7d5a8a']];
  $('.fm-tabs').innerHTML = tabDefs.map(([id, no, name, c]) => `<button data-tab="${id}" style="--c:${c}">${no}<span>${esc(name)}</span></button>`).join('');

  function chrome() {
    const c = ch();
    $('[data-pts]').textContent = c.jobPoints;
    $('[data-lv]').textContent = `JOB LV.${c.jobLevel}`;
    const P = byId[state.page], tabOf = P.kind === 'job' ? 'jobs' : P.id;
    root.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tabOf)));
    const at = linear.indexOf(tabOf);
    $('[data-pg]').textContent = `${num2(at)} / ${num2(linear.length - 1)}`;
    $('[data-f="prev"]').disabled = state.page === 'overview';
    $('[data-f="next"]').disabled = state.page === 'jobs' || (P.kind === 'job' && !nextBranch(P));
    $('[data-f="home"]').hidden = state.page === 'overview';
  }
  const bump = () => { const n = $('[data-pts]'); n.classList.remove('fm-tick'); void n.offsetWidth; n.classList.add('fm-tick'); };
  const nextBranch = (P) => { const b = Object.keys(tree.jobs[P.job].branches), i = b.indexOf(P.branch); return b[i + 1] ? `job.${P.job}.${b[i + 1]}` : null; };
  const prevOf = (P) => { if (P.kind === 'job') { const b = Object.keys(tree.jobs[P.job].branches), i = b.indexOf(P.branch); return i > 0 ? `job.${P.job}.${b[i - 1]}` : 'jobs'; } return linear[Math.max(0, linear.indexOf(P.id) - 1)]; };
  const order = (id) => { const P = byId[id]; return P.kind === 'job' ? linear.length + pages.indexOf(P) : linear.indexOf(id); };

  // ---------- state of a node ----------
  function stateOf(id) {
    const c = ch(), st = jobNodeState(c, data, id);
    if (id === tree.origin || st.taken) return pending.has(id) ? 'learned pending' : 'learned';
    if (st.can) return 'open';
    if (st.reason === 'fork_taken') return 'shut';
    if (st.reason === 'no_points') return 'locked near';
    return 'locked';
  }

  // ---------- render a page ----------
  function render(intro = true, keep = null) {
    sel = null; confirm = false;
    pageEl.innerHTML = '<div class="fm-sheet" data-sheet><i class="fm-tape tl"></i><i class="fm-tape tr"></i><i class="fm-tape bl"></i><i class="fm-tape br"></i></div>';
    if (keep) pageEl.insertBefore(keep, pageEl.firstChild);
    const sheet = $('[data-sheet]');
    sheet.insertAdjacentHTML('beforeend', '<div class="fm-sky"><i class="fm-cloud" style="top:-10%"></i><i class="fm-cloud c2"></i></div>');
    const note = document.createElement('aside'); note.className = 'fm-note'; note.hidden = true; note.dataset.note = ''; pageEl.appendChild(note);
    drawLog(false);
    chrome();
    const P = byId[state.page];
    legend.hidden = P.kind !== 'overview';
    sheet.appendChild(legend);
    if (P.kind === 'overview') return renderCompass(sheet, intro);
    if (P.kind === 'jobs') return renderJobs(sheet, intro);
    renderMap(sheet, P, intro);
  }

  function head(sheet, eyebrow, title, sub) {
    const h = document.createElement('div'); h.className = 'fm-head fm-writing';
    h.innerHTML = `<div class="fm-eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p>`;
    sheet.appendChild(h);
  }

  function renderMap(sheet, P, intro) {
    const m = pageMap(tree, P), job = P.job && tree.jobs[P.job];
    if (P.kind === 'camp') { head(sheet, 'Expedition 01 / the camp', 'ค่ายพักแรม', 'กลางวง · ทุกทิศของวงในแยกจากที่นี่'); $('[data-crumb]').textContent = 'บท 01 · ค่ายพักแรม'; }
    else if (P.kind === 'sector') {
      const s = P.sector, meta = SECTOR_META[s], jobs = Object.keys(tree.jobs).filter((j) => JOB_SECTOR[j] === s).map((j) => tree.jobs[j].nameTh);
      head(sheet, `Expedition ${num2(SECTOR_ORDER.indexOf(s) + 2)} / ${meta.en}`, meta.name, `ภาค ${tree.sectors[s]} · ปลายทาง ${jobs.join(' · ')}`);
      $('[data-crumb]').textContent = `บท ${num2(SECTOR_ORDER.indexOf(s) + 2)} · ${meta.name}`;
    } else {
      const b = job.branches[P.branch];
      head(sheet, `Expedition 08 / ${P.job}`, `${job.nameTh} · ${b.nameTh}`, `${ROLE_TH[b.role] || b.role} · ความสามารถติดตัว: ${N[job.entry].entryTh || ''}`);
      $('[data-crumb]').textContent = `อาชีพ · ${job.nameTh}`;
      const bar = document.createElement('div'); bar.className = 'fm-branches';
      bar.innerHTML = Object.entries(job.branches).map(([id, B]) => `<button data-branch="${id}" aria-pressed="${id === P.branch}">${esc(B.nameTh)}<small>${ROLE_TH[B.role] || ''}</small></button>`).join('');
      sheet.appendChild(bar);
    }
    const wm = document.createElement('div'); wm.className = 'fm-watermark'; wm.textContent = P.kind === 'camp' ? '01' : P.kind === 'sector' ? num2(SECTOR_ORDER.indexOf(P.sector) + 2) : '08'; sheet.appendChild(wm);
    const wrap = document.createElement('div'); wrap.className = 'fm-mapwrap'; sheet.appendChild(wrap);
    // natural size: captions stay readable; a long road scrolls sideways under the finger
    const k = Math.max(short() ? 0.8 : 0.74, Math.min(1.15, (pageEl.clientHeight - 6) / m.height));
    const svg = el('svg', { class: 'fm-map' + (intro ? ' fm-intro' : ''), viewBox: `0 0 ${m.width} ${m.height}`, width: Math.round(m.width * k), height: Math.round(m.height * k), role: 'img', 'aria-label': 'แผนที่เส้นทาง' });
    wrap.appendChild(svg);
    terrain(svg, m.terrain, m.width, m.height, P.kind === 'sector' ? P.sector : P.kind === 'camp' ? 'camp' : null);
    const stains = el('g', {}, svg), routes = el('g', {}, svg), inks = el('g', {}, svg), steps = el('g', {}, svg), nodes = el('g', {}, svg);
    current = { P, m, svg, wrap, k, stains, routes, inks, steps, nodes, edgeEls: {}, nodeEls: {}, at: { ...m.coords } };
    const pt = (id) => ({ x: current.at[id][0], y: current.at[id][1] });
    for (const [a, b] of m.edges) {
      const d = curve(pt(a), pt(b), a + b);
      const r = el('path', { class: 'fm-route', d, style: `--d:${(0.3 + pt(a).x / 1200).toFixed(2)}s` }, routes);
      const ink = el('path', { class: 'fm-ink', d, pathLength: 1 }, inks);
      current.edgeEls[a + '>' + b] = { r, ink, a, b };
    }
    // the camp's signposts: roads out to each sector's map
    for (const s of m.signs || []) {
      const c1 = pt('in.center.c1'), d = curve(c1, { x: s.x, y: s.y - 14 }, s.sector);
      el('path', { class: 'fm-route fm-road-out', d }, routes);
      const g = el('g', { class: 'fm-sign', transform: `translate(${s.x} ${s.y})`, tabindex: 0, role: 'button', 'aria-label': `ไปยัง ${SECTOR_META[s.sector].name}`, 'data-go': `sector.${s.sector}` }, nodes);
      const w = 108;
      el('path', { class: 'fm-sign-board', d: `M${-w / 2} -12h${w - 10}l10 12-10 12h${-(w - 10)}z`, style: `--c:${SECTOR_META[s.sector].c}` }, g);
      label(g, { class: 'fm-sign-t', x: -4, y: 5 }, `${tree.sectors[s.sector]} →`);
    }
    for (const id of Object.keys(m.coords).sort((a, b) => m.coords[a][0] - m.coords[b][0])) drawNode(id, nodes, m.context.includes(id));
    for (const dst of m.destinations) { current.at[tree.jobs[dst.job].entry] = [dst.x, dst.y]; drawNode(tree.jobs[dst.job].entry, nodes, false, true); }
    for (const [x, y, r, t] of NOTES[P.kind === 'sector' ? P.sector : P.kind === 'camp' ? 'camp' : ''] || []) {
      if (x > m.width - 60) continue;
      const tx = el('text', { class: 'fm-ann', x, y, transform: `rotate(${r} ${x} ${y})` }, svg); tx.textContent = t;
    }
    refresh(true);
    // open where the road continues: the first place that can be taken, else the last one taken
    const ids = Object.keys(m.coords), next = ids.find((id) => stateOf(id) === 'open') || [...ids].reverse().find((id) => ch().jobNodes.includes(id));
    if (next) { wrap.scrollLeft = Math.max(0, m.coords[next][0] * k - wrap.clientWidth * 0.4); wrap.scrollTop = Math.max(0, m.coords[next][1] * k - wrap.clientHeight * 0.45); }
    if (intro) setTimeout(() => svg.classList.remove('fm-intro'), 2600);
  }

  function drawNode(id, layer, context, destination = false) {
    const n = N[id], [x, y] = current.at[id], R = radius(n);
    const g = el('g', { class: `fm-node t-${n.type}${context ? ' fm-context' : ''}`, transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', style: `--d:${(0.15 + x / 1300).toFixed(2)}s`, 'data-node': id }, layer);
    const inner = el('g', { class: 'fm-nin' }, g);
    el('circle', { class: 'fm-hit', r: Math.max(R + 10, 28) }, inner);
    el('circle', { class: 'fm-ring', r: R + 2 }, inner);
    const stamp = el('g', { class: 'fm-stamp' }, inner);
    el('circle', { class: 'fm-disc', r: R }, stamp);
    el('path', { class: 'fm-fillc', d: blob(0, 0, R - 0.6, Math.round(R * 13 + x), 0.05) }, stamp);
    if (n.type === 'keystone') el('circle', { class: 'fm-disc', r: R - 5, style: 'fill:none', 'stroke-dasharray': '2 3' }, stamp);
    glyph(glyphOf(n), stamp, R * 1.15, -R * 0.575, -R * 0.575);
    el('circle', { class: 'fm-splash', r: R + 4 }, inner);
    const fx = Object.entries(n.effects || {}).filter(([k]) => k !== 'perTargetCap');
    const cap = n.type === 'origin' ? 'ค่ายพักแรม' : n.pass ? effectLabel(fx[0]?.[0] || '') : cleanName(n);
    const sub = destination ? `ปลายทาง · Job Lv ${jobChoiceLevel(data)}` : n.type === 'origin' ? 'จุดเริ่มของทุกคน' : fx.map(([k, v]) => n.pass ? effectValue(k, v) : `${effectLabel(k)} ${effectValue(k, v)}`).slice(0, 2).join(' · ');
    label(inner, { class: 'fm-cap', y: R + 17 }, cap);
    label(inner, { class: 'fm-sub', y: R + 31 }, sub);
    if (nodeCost(n) > 1) { const c = el('g', { class: 'fm-cost', transform: `translate(${R * 0.72} ${-R * 0.72})` }, inner); el('circle', { r: 8 }, c); const t = el('text', { y: 3.6 }, c); t.textContent = nodeCost(n); }
    current.nodeEls[id] = g;
  }

  function refresh(instant) {
    if (destroyed) return;
    chrome();
    if (!current || !current.svg.isConnected) return;
    const owned = new Set(ch().jobNodes);
    for (const [id, g] of Object.entries(current.nodeEls)) {
      const s = stateOf(id);
      g.setAttribute('class', `fm-node t-${N[id].type}${g.classList.contains('fm-context') ? ' fm-context' : ''} ${s}${id === sel ? ' sel' : ''}${g.classList.contains('stamped') ? ' stamped' : ''}`);
      const st = jobNodeState(ch(), data, id);
      g.setAttribute('aria-label', `${cleanName(N[id])} · ${s.startsWith('learned') ? 'บันทึกแล้ว' : st.can ? 'ไปต่อได้' : 'ยังไปไม่ถึง'}`);
    }
    for (const e of Object.values(current.edgeEls)) {
      const both = owned.has(e.a) && owned.has(e.b) && !pending.has(e.b) && !pending.has(e.a), one = owned.has(e.a) || owned.has(e.b);
      if (!e.ink.classList.contains('drawing')) e.ink.style.display = both ? '' : 'none';
      if (instant) e.ink.classList.remove('drawing');
      e.r.classList.toggle('open', !both && one);
      e.r.classList.toggle('locked', !one);
    }
  }

  // ---------- terrain: a hand-drawn field map, deterministic per page ----------
  function terrain(svg, kind, W, H, notesKey) {
    const R = rnd(W + H + (kind || '').length * 7);
    const c = el('g', { class: 'fm-contour' }, svg), t = el('g', { class: 'fm-terrain' }, svg);
    for (let i = 0; i < 7; i++) el('path', { d: `M-20 ${H * 0.15 + i * H * 0.13} C ${W * 0.22} ${H * 0.07 + i * H * 0.14}, ${W * 0.42} ${H * 0.25 + i * H * 0.1}, ${W * 0.62} ${H * 0.12 + i * H * 0.13} S ${W * 0.9} ${H * 0.2 + i * H * 0.12}, ${W + 40} ${H * 0.1 + i * H * 0.13}`, pathLength: 1 }, c);
    // motifs live in the margins above and below the road
    const spots = [];
    for (let x = 160; x < W - 80; x += 150 + R() * 90) spots.push([x, 60 + R() * 40], [x + 60, H - 70 - R() * 30]);
    const peak = (x, y, s) => el('path', { d: `M${x - 30 * s} ${y + 18 * s} L${x - 8 * s} ${y - 14 * s} L${x + 4 * s} ${y} L${x + 16 * s} ${y - 20 * s} L${x + 38 * s} ${y + 18 * s}` }, t);
    const pine = (x, y, s) => el('path', { d: `M${x} ${y - 16 * s} l-8 ${12 * s} h5 l-7 ${10 * s} h20 l-7 ${-10 * s} h5 z M${x} ${y + 6 * s} v${5 * s}` }, t);
    const mist = (x, y) => el('path', { d: `M${x - 30} ${y}h44M${x - 14} ${y + 10}h50M${x - 34} ${y + 20}h36` }, t);
    const column = (x, y) => el('path', { d: `M${x - 6} ${y + 18}v-30M${x + 6} ${y + 18}v-30M${x - 10} ${y - 12}h20M${x - 10} ${y + 18}h20` }, t);
    const grass = (x, y) => el('path', { d: `M${x} ${y + 8}l4-10 4 10M${x + 14} ${y + 8}l3-8 3 8` }, t);
    for (const [x, y] of spots) {
      const s = 0.7 + R() * 0.5, r = R();
      if (kind === 'str') r < 0.6 ? peak(x, y, s) : grass(x, y);
      else if (kind === 'dex') r < 0.75 ? pine(x, y, s) : grass(x, y);
      else if (kind === 'int') r < 0.6 ? mist(x, y) : el('circle', { cx: x, cy: y, r: 10 + R() * 22 }, t);
      else if (kind === 'dexint') r < 0.5 ? peak(x, y, s * 0.8) : mist(x, y);
      else if (kind === 'intstr') r < 0.55 ? column(x, y) : grass(x, y);
      else if (kind === 'strdex') r < 0.5 ? grass(x, y) : el('path', { d: `M${x} ${y + 16}v-28l12 5-12 5` }, t);
      else r < 0.5 ? grass(x, y) : pine(x, y, s * 0.8);
    }
    el('path', { class: 'fm-river', d: `M${W * 0.18} ${H + 20} C ${W * 0.22} ${H * 0.86}, ${W * 0.3} ${H * 0.8}, ${W * 0.33} ${H * 0.72} S ${W * 0.3} ${H * 0.56}, ${W * 0.38} ${H * 0.5}` }, svg);
    el('path', { class: 'fm-river thin', d: `M${W * 0.38} ${H * 0.5} C ${W * 0.44} ${H * 0.52}, ${W * 0.5} ${H * 0.6}, ${W * 0.6} ${H * 0.58}` }, svg);
    // north arrow and a scale bar, like a field map
    const na = el('g', { transform: `translate(${W - 50} ${H - 120})`, opacity: 0.55 }, svg);
    el('path', { d: 'M0 -26 L7 6 L0 0 L-7 6Z', fill: '#7d6544' }, na); el('circle', { r: 16, fill: 'none', stroke: '#7d6544', 'stroke-width': 0.8 }, na);
    const nt = el('text', { y: -32, 'text-anchor': 'middle', class: 'fm-mapnote' }, na); nt.textContent = 'N';
    const sb = el('g', { transform: `translate(${W - 200} ${H - 28})`, opacity: 0.5 }, svg);
    for (let i = 0; i < 4; i++) el('rect', { x: i * 30, y: 0, width: 30, height: 5, fill: i % 2 ? '#f6efd9' : '#7d6544', stroke: '#7d6544', 'stroke-width': 0.8 }, sb);
    const st = el('text', { x: 124, y: 6, class: 'fm-mapnote' }, sb); st.textContent = '1 วันเดิน';
    void notesKey;
  }

  // ---------- the overview: a world map round the compass ----------
  function compassBase(svg, title, eye) {
    const CX = 500, CY = 330;
    const c = el('g', { class: 'fm-contour' }, svg);
    for (let i = 1; i <= 5; i++) el('ellipse', { cx: CX, cy: CY, rx: 90 + i * 70, ry: 50 + i * 42, fill: 'none', stroke: '#967f59', 'stroke-width': 1, opacity: 0.1, 'stroke-dasharray': i % 2 ? '2 7' : 'none' }, c);
    const tg = el('g', { class: 'fm-titlegrp' }, svg);
    const e1 = el('text', { class: 'fm-titleeye', x: CX, y: 34 }, tg); e1.textContent = eye;
    const e2 = el('text', { class: 'fm-titleban', x: CX, y: 64 }, tg); e2.textContent = title;
    el('path', { d: `M${CX - 150} 76h110m80 0h110M${CX - 6} 76l6-4 6 4-6 4z`, stroke: '#9b8869', 'stroke-width': 1, fill: 'none' }, tg);
    return { CX, CY };
  }
  function rose(svg, CX, CY, hubAction) {
    const all = el('g', { class: 'fm-rose-all', style: `transform-origin:${CX}px ${CY}px` }, svg), R = 74, q = 1;
    for (const r of [R, R - 7, R - 30]) el('circle', { class: 'fm-rose-ring', cx: CX, cy: CY, r, pathLength: 1 }, all);
    for (let i = 0; i < 72; i++) { const a = i * 5 * Math.PI / 180, l = i % 9 === 0 ? 7 : i % 3 === 0 ? 4.5 : 2.5; el('line', { class: 'fm-rose-tick', x1: CX + Math.cos(a) * R, y1: CY + Math.sin(a) * R, x2: CX + Math.cos(a) * (R - l), y2: CY + Math.sin(a) * (R - l) }, all); }
    const point = (deg, len, wid, dark, light) => {
      const a = (deg - 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, tip = `${CX + ux * len} ${CY + uy * len}`;
      el('path', { class: dark, d: `M${CX} ${CY}L${tip}L${CX + px * wid} ${CY + py * wid}Z` }, all);
      el('path', { class: light, d: `M${CX} ${CY}L${tip}L${CX - px * wid} ${CY - py * wid}Z` }, all);
    };
    for (let k = 0; k < 8; k++) point(22.5 + k * 45, R - 34, 4, 'fm-rose-gold', 'fm-rose-gold-l');
    for (let k = 0; k < 4; k++) point(45 + k * 90, R - 20, 6, 'fm-rose-dark', 'fm-rose-light');
    for (let k = 0; k < 4; k++) point(k * 90, R - 4, 9, 'fm-rose-dark', 'fm-rose-light');
    const nl = el('text', { class: 'fm-rose-n', x: CX, y: CY - R - 8 }, all); nl.textContent = 'N';
    const needle = el('g', { class: 'fm-needle', style: `transform-origin:${CX}px ${CY}px` }, svg);
    el('path', { d: `M${CX} ${CY - 46 * q}l5 ${46 * q}h-10z`, fill: '#a64b3c' }, needle);
    el('path', { d: `M${CX} ${CY + 30 * q}l5 ${-30 * q}h-10z`, fill: '#5d6a5e' }, needle);
    const hub = el('g', { class: 'fm-hub', tabindex: 0, role: 'button', 'aria-label': 'ค่ายพักแรม' }, svg);
    el('circle', { cx: CX, cy: CY, r: 26, fill: 'transparent' }, hub);
    el('circle', { cx: CX, cy: CY, r: 13, fill: '#f6efd9', stroke: '#8f7350', 'stroke-width': 1.2 }, hub);
    glyph('camp', hub, 16, CX - 8, CY - 8).style.stroke = '#4b7568';
    if (hubAction) { hub.addEventListener('click', hubAction); hub.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hubAction(); } }); }
    return needle;
  }
  function region(regs, i, p, opt) {
    const g = el('g', { class: 'fm-region' + (opt.ready ? ' ready' : '') + (opt.mine ? ' mine' : ''), tabindex: 0, role: 'button', 'aria-label': opt.aria, transform: `translate(${p.x} ${p.y})`, style: `--d:${(i * 0.1 + 0.7).toFixed(2)}s` }, regs);
    const wash = el('g', { class: 'fm-wash' }, g);
    for (const [cx, cy, rx, ry, r] of opt.small ? [[-6, -8, 54, 34, -8], [12, 0, 44, 28, 10]] : [[-14, -14, 84, 50, -8], [22, -2, 70, 44, 12], [-4, 6, 62, 34, 4]]) el('ellipse', { cx, cy, rx, ry, transform: `rotate(${r} ${cx} ${cy})`, fill: `url(#fmwash${opt.wash})` }, wash);
    const lift = el('g', { class: 'fm-lift' }, g);
    if (opt.art) { const art = el('g', { class: 'fm-art', transform: 'translate(0 -14)' }, lift); art.innerHTML = opt.art; }
    else glyph(opt.glyph, el('g', { class: 'fm-art' }, lift), 30, -15, -32);
    const sh = short(), w = Math.max(opt.small ? 96 : 118, opt.name.length * (sh ? 12.5 : 11) + 30), by = opt.small ? 14 : 36;
    el('path', { class: 'fm-tail', d: `M${-w / 2 + 6} ${by - 4}h-20l7 9-7 9h20z` }, lift);
    el('path', { class: 'fm-tail', d: `M${w / 2 - 6} ${by - 4}h20l-7 9 7 9h-20z` }, lift);
    el('path', { class: 'fm-banner', d: `M${-w / 2} ${by - (sh ? 12 : 10)}q${w / 2} -6 ${w} 0v${sh ? 24 : 22}q${-w / 2} -6 ${-w} 0z` }, lift);
    const rn = el('text', { class: 'fm-rn', y: by + 5 }, lift); rn.textContent = opt.name;
    label(lift, { class: 'fm-rj', y: by + (sh ? 30 : 28) }, opt.line);
    label(lift, { class: 'fm-rp' + (opt.ok ? ' ok' : ''), y: by + (sh ? 46 : 43) }, opt.progress);
    return g;
  }
  function washDefs(svg, colors) {
    svg.innerHTML = `<defs>${colors.map((c, i) => `<radialGradient id="fmwash${i}"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset=".55" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('')}</defs>`;
  }
  function overviewSvg(sheet, intro, aria) {
    const wrap = document.createElement('div'); wrap.className = 'fm-mapwrap fm-fit'; sheet.appendChild(wrap);
    // on a short screen the compass is flatter and cropped to its places, its words larger
    const svg = el('svg', { class: 'fm-map' + (intro ? ' fm-intro' : '') + (short() ? ' fm-short' : ''), viewBox: short() ? (byId[state.page].kind === 'jobs' ? '20 92 960 500' : '30 96 940 484') : '0 0 1000 600', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': aria }); wrap.appendChild(svg);
    if (intro) setTimeout(() => svg.classList.remove('fm-intro'), 2600);
    current = { P: byId[state.page], svg, wrap, nodeEls: {}, edgeEls: {} };
    return svg;
  }
  const inkRoad = (layer, d, then) => { if (turning) return; el('path', { class: 'fm-ink drawing', d, pathLength: 1, style: 'animation-duration:.55s' }, layer); setTimeout(then, reduce ? 0 : 560); };

  function renderCompass(sheet, intro) {
    $('[data-crumb]').textContent = 'แผนที่รวม';
    const svg = overviewSvg(sheet, intro, 'แผนที่รวม เลือกภาค');
    washDefs(svg, SECTOR_ORDER.map((s) => SECTOR_META[s].c));
    const { CX, CY } = compassBase(svg, 'เลือกทิศของการเดินทาง', 'EXPEDITION 00 · CHOOSE A HEADING');
    const RX = 345, RY = 180, stainL = el('g', {}, svg), roads = el('g', {}, svg), regs = el('g', {}, svg), owned = new Set(ch().jobNodes);
    let needle;
    SECTOR_ORDER.forEach((s, i) => {
      const a = SECTOR_ANGLE[s], p = { x: CX + RX * Math.cos(a * Math.PI / 180), y: CY + RY * Math.sin(a * Math.PI / 180) };
      const ids = Object.keys(N).filter((id) => N[id].ring === 'inner' && (N[id].sector === s || N[id].sector === SIDE_LINES[s]));
      const have = ids.filter((id) => owned.has(id)).length, jobs = Object.keys(tree.jobs).filter((j) => JOB_SECTOR[j] === s).map((j) => tree.jobs[j].nameTh);
      const end = p.y < CY ? { x: p.x + (CX - p.x) * 0.12, y: p.y + 96 } : { x: CX + (p.x - CX) * 0.74, y: CY + (p.y - CY) * 0.74 };
      const road = el('path', { class: 'fm-road' + (have ? ' walked' : ''), d: curve({ x: CX, y: CY }, end, s), pathLength: 1, style: `--d:${i * 0.12 + 0.5}s` }, roads);
      const g = region(regs, i, p, { wash: i, art: SECTOR_META[s].art, name: SECTOR_META[s].name, line: `${tree.sectors[s]} · ${jobs.join(' · ')}`, progress: `บท ${num2(i + 2)} · บันทึกแล้ว ${have} / ${ids.length} จุด`, ok: have > 0, ready: true, aria: `${SECTOR_META[s].name} · ${tree.sectors[s]}` });
      const aim = () => { needle.style.transform = `rotate(${a + 90}deg)`; regs.querySelectorAll('.fm-region').forEach((x) => x.classList.toggle('hot', x === g)); };
      g.addEventListener('pointerenter', aim); g.addEventListener('focus', aim);
      const open = () => { aim(); inkRoad(roads, road.getAttribute('d'), () => turnTo(`sector.${s}`)); };
      g.addEventListener('click', open); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    needle = rose(svg, CX, CY, () => turnTo('camp'));
    const R = 74, have = Object.keys(N).filter((id) => N[id].sector === 'center' && owned.has(id)).length;
    label(svg, { x: CX, y: CY + R + 20, 'text-anchor': 'middle', class: 'fm-hubcap' }, `ค่ายพักแรม · กลางวง ${have} / 6 จุด`);
    if (intro && !reduce) {
      const drop = el('g', { class: 'fm-inkdrop' }, svg);
      el('path', { class: 'fm-tear', d: `M${CX} ${CY - 18}q7 10 7 16a7 7 0 0 1 -14 0q0 -6 7 -16z` }, drop);
      ripples(stainL, CX, CY, 16, 0.62);
    }
  }

  function renderJobs(sheet, intro) {
    $('[data-crumb]').textContent = 'บท 08 · อาชีพ';
    const svg = overviewSvg(sheet, intro, 'แผนที่อาชีพ');
    washDefs(svg, SECTOR_ORDER.map((s) => SECTOR_META[s].c));
    const c = ch(), lv = jobChoiceLevel(data), mine = currentJob(c, data)?.job;
    const { CX, CY } = compassBase(svg, mine ? `อาชีพของคุณ: ${tree.jobs[mine].nameTh}` : c.jobLevel < lv ? `ปลายทางอาชีพ · เปิดที่ Job Lv ${lv}` : 'เลือกปลายทางของคุณ', 'EXPEDITION 08 · THE FAR DESTINATIONS');
    const RX = 390, RY = 192, roads = el('g', {}, svg), regs = el('g', {}, svg), pairs = {};
    let needle;
    Object.keys(tree.jobs).forEach((job, i) => {
      const s = JOB_SECTOR[job], k = (pairs[s] = (pairs[s] ?? -1) + 1), a = SECTOR_ANGLE[s] + (k ? 15 : -15);
      const p = { x: CX + RX * Math.cos(a * Math.PI / 180), y: CY - 4 + RY * Math.sin(a * Math.PI / 180) };
      const J = tree.jobs[job], spent = c.jobNodes.filter((id) => N[id]?.job === job).length;
      const road = el('path', { class: 'fm-road' + (mine === job ? ' walked' : ''), d: curve({ x: CX, y: CY }, { x: CX + (p.x - CX) * 0.7, y: CY + (p.y - CY) * 0.7 }, job), pathLength: 1, style: `--d:${i * 0.06 + 0.5}s` }, roads);
      const g = region(regs, i, p, { small: true, wash: SECTOR_ORDER.indexOf(s), glyph: JOB_GLYPH[job], name: J.nameTh, line: Object.values(J.branches).map((b) => b.nameTh).join(' · '), progress: mine === job ? `อาชีพของคุณ · ${spent} จุด` : mine ? 'ดูได้ · เลือกไปแล้ว 1 อาชีพ' : c.jobLevel < lv ? `เปิดที่ Job Lv ${lv}` : 'เลือกได้', ok: mine === job || (!mine && c.jobLevel >= lv), ready: true, mine: mine === job, aria: J.nameTh });
      const aim = () => { if (needle) needle.style.transform = `rotate(${a + 90}deg)`; regs.querySelectorAll('.fm-region').forEach((x) => x.classList.toggle('hot', x === g)); };
      g.addEventListener('pointerenter', aim); g.addEventListener('focus', aim);
      const go = () => turnTo(`job.${job}.${Object.keys(J.branches)[0]}`);
      const open = () => { aim(); inkRoad(roads, road.getAttribute('d'), go); };
      g.addEventListener('click', open); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    needle = rose(svg, CX, CY, null);
  }

  // ---------- the note pinned on the map ----------
  function select(id) {
    if (!current?.nodeEls[id]) return;
    sel = id; confirm = false; refresh(true);
    const c = ch(), n = N[id], s = stateOf(id), note = $('[data-note]'), st = jobNodeState(c, data, id);
    const fx = Object.entries(n.effects || {});
    const rows = fx.length ? fx.map(([k, v]) => `<div class="fm-fx"><span>${esc(effectLabel(k))}</span><b>${esc(k === 'perTargetCap' ? v + '%' : effectValue(k, v))}</b></div>`).join('') : '';
    const hand = [];
    if (n.type === 'origin') hand.push('กองไฟยังอุ่นอยู่ ทุกเส้นทางเริ่มจากตรงนี้');
    if (n.type === 'job') hand.push(`ความสามารถติดตัว: ${n.entryTh || ''}`, `สาขา: ${Object.values(tree.jobs[n.job].branches).map((b) => b.nameTh).join(' · ')}`);
    if (n.forkGroup) hand.push(`ทางแยก เลือกได้ทางเดียว: ${Object.values(N).filter((m) => m.forkGroup === n.forkGroup).map((m) => m.nameTh).join(' / ')}`);
    if (n.uptime != null && n.uptime < 1) hand.push(`ค่าเฉลี่ย · เงื่อนไขทำงานราว ${Math.round(n.uptime * 100)}% ของเวลา`);
    if (SIDE_NAME[n.sector]) hand.push(`${SIDE_NAME[n.sector]} · ผลใช้เมื่อ${n.sector === 'heavy' ? 'ถืออาวุธหนัก' : 'ถืออาวุธสองมือ'}`);
    let act, route = null;
    if (n.type === 'origin' || st.taken) act = `<button class="fm-act" disabled>บันทึกแล้ว ✓</button>`;
    else if (st.can) act = `<button class="fm-act primary" data-f="buy">${n.type === 'job' ? 'เลือกอาชีพนี้ · ไม่ใช้แต้ม' : `บันทึกเส้นทางนี้ · ใช้ ${nodeCost(n)} แต้ม`}</button>`;
    else {
      route = st.reason === 'prerequisite' ? jobRoute(c, data, id) : null;
      if (route?.can) act = `<button class="fm-act primary" data-f="route">บันทึกตามเส้นทาง ${route.path.length} จุด · ใช้ ${route.cost} แต้ม</button>`;
      else act = `<button class="fm-act" disabled>${esc(reason(route && !route.can ? route : st))}</button>`;
    }
    if (n.type === 'job') act += `<button class="fm-act" data-go="job.${n.job}.${Object.keys(tree.jobs[n.job].branches)[0]}">ดูแผนที่อาชีพ →</button>`;
    note.innerHTML = `<button class="fm-close" data-f="close" aria-label="ปิด">×</button><div class="fm-kind">${KIND[n.type] || ''}${nodeCost(n) > 1 ? ` · ${nodeCost(n)} แต้ม` : ''}</div>
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="#4b7568" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${(G[glyphOf(n)] || G.path).replace(/class="f"/g, 'fill="#4b7568" stroke="none"')}</svg>${esc(n.type === 'origin' ? 'ค่ายพักแรม' : n.pass ? effectLabel(fx[0]?.[0] || '') : cleanName(n))}</h2>
      ${rows}${hand.length ? `<p class="fm-hand">${hand.map(esc).join('<br>')}</p>` : ''}<div class="fm-acts">${act}</div>`;
    current.inks.querySelectorAll('.fm-preview').forEach((x) => x.remove());
    const path = st.can ? [id] : route?.can ? route.path : [];
    for (const to of path) { const e = edgeTo(to); if (e) el('path', { class: 'fm-preview', d: e.r.getAttribute('d') }, current.inks); }
    note.hidden = false; note.classList.remove('in'); void note.offsetWidth; note.classList.add('in');
    if (short() && current.wrap && current.k) { const [x, y] = current.at[id]; current.wrap.scrollTo({ left: Math.max(0, x * current.k - (current.wrap.clientWidth - note.offsetWidth) * 0.5), top: Math.max(0, y * current.k - current.wrap.clientHeight * 0.5), behavior: reduce ? 'auto' : 'smooth' }); }
  }
  const REASON = {
    prerequisite: () => 'ต้องเดินทางมาถึงจุดก่อนหน้าก่อน', job_level: (st) => `ปลายทางเปิดที่ Job Lv ${st.need}`,
    one_job: () => 'เลือกอาชีพไปแล้ว · คืนแต้มเพื่อเปลี่ยน', requires_job: (st) => `เฉพาะ ${tree.jobs[st.need]?.nameTh || st.need}`,
    fork_taken: () => 'ทางแยกนี้เลือกอีกทางไปแล้ว', no_points: (st) => `แต้มไม่พอ · ต้องใช้ ${st.need}`,
    fork_choice: () => 'มีทางแยกก่อนถึง · เลือกทางแยกเองก่อน', job_choice: () => 'เลือกอาชีพที่ประตูอาชีพก่อน',
  };
  const reason = (st) => (REASON[st.reason] || (() => 'ยังไปไม่ได้'))(st);
  // the road into a place from a parent the hero already has (or the one taken just before it)
  function edgeTo(id) {
    const es = Object.values(current.edgeEls).filter((e) => e.b === id);
    return es.find((e) => ch().jobNodes.includes(e.a) && !pending.has(e.a)) || es.find((e) => ch().jobNodes.includes(e.a)) || es[0];
  }
  function closeNote() { const n = $('[data-note]'); if (n) n.hidden = true; sel = null; confirm = false; current?.inks?.querySelectorAll('.fm-preview').forEach((x) => x.remove()); refresh(true); }

  function respecNote() {
    const c = ch(), cost = respecCost(c, data).job, town = ui.game.nearby?.().inTown, spent = jobPointsSpent(c, data), note = $('[data-note]');
    confirm = true;
    const ok = town && c.gold >= cost && spent > 0;
    note.innerHTML = `<button class="fm-close" data-f="close" aria-label="ปิด">×</button><div class="fm-kind">ล้างรอยหมึก · คืนแต้ม</div><h2>เริ่มเส้นทางใหม่</h2>
      <div class="fm-fx"><span>แต้มที่ได้คืน</span><b>${spent}</b></div><div class="fm-fx"><span>ค่าธรรมเนียม</span><b>${cost.toLocaleString()} G</b></div>
      <p class="fm-hand">${!town ? 'ต้องกลับเข้าเมืองก่อน' : c.gold < cost ? `ทองไม่พอ · มี ${c.gold.toLocaleString()} G` : spent ? 'รอยหมึกทุกเส้นและอาชีพที่เลือกจะถูกลบ' : 'ยังไม่มีรอยทางให้ลบ'}</p>
      <div class="fm-acts"><button class="fm-act primary" data-f="respec-yes" ${ok ? '' : 'disabled'}>ยืนยันคืนแต้ม</button><button class="fm-act" data-f="close">ยกเลิก</button></div>`;
    note.hidden = false; note.classList.remove('in'); void note.offsetWidth; note.classList.add('in');
  }

  // ---------- spending: ink the road, walk it, stamp the place, write it down ----------
  function spend(route) {
    const c = ch(), id = sel, before = c.jobNodes.length;
    const r = route ? allocateJobRoute(c, data, id) : allocateJobNode(c, data, id);
    if (!r.done) return;
    const got = c.jobNodes.slice(before);
    got.forEach((g, i) => { pending.add(g); state.log.unshift(entryText(g, before + i)); });
    state.log = state.log.slice(0, 6);
    closeNote();
    bump();
    ui.game.notify?.({ type: 'job' });
    ui.changed(); // re-derives and saves; the map keeps its pending places unfilled until the pen arrives
    const job = got.find((g) => N[g].type === 'job');
    const per = got.length > 1 ? Math.max(380, Math.min(800, 2600 / got.length)) : 1050;
    animating++;
    let t = 0;
    got.forEach((g, i) => { setTimeout(() => walkTo(g, per, i === got.length - 1), t); t += reduce ? 0 : per + 60; });
    setTimeout(() => { animating--; drawLog(true); if (job && !destroyed) turnTo(`job.${N[job].job}.${Object.keys(tree.jobs[N[job].job].branches)[0]}`); }, reduce ? 0 : t + 300);
  }
  function walkTo(id, dur, last) {
    if (destroyed) return;
    const g = current?.nodeEls[id];
    const finish = () => {
      pending.delete(id);
      if (g?.isConnected) {
        g.classList.remove('stamped'); void g.getBBox(); g.classList.add('stamped');
        const sp = g.querySelector('.fm-splash'); sp.classList.remove('go'); void sp.getBBox(); sp.classList.add('go');
        const [x, y] = current.at[id]; ripples(current.stains, x, y, radius(N[id]));
      }
      refresh(false);
      if (last && navigator.vibrate) try { navigator.vibrate(12); } catch { /* not on every device */ }
    };
    const e = g?.isConnected && edgeTo(id);
    if (!e || reduce) return finish();
    const reversed = e.a === id;
    e.ink.style.display = ''; e.ink.classList.remove('drawing', 'rev'); void e.ink.getBBox(); e.ink.style.animationDuration = dur + 'ms'; e.ink.classList.add('drawing');
    // a wet, glossier stroke rides on the fresh line, then dries away
    const wet = el('path', { class: 'fm-ink fm-wet drawing' + (reversed ? ' rev' : ''), d: e.ink.getAttribute('d'), pathLength: 1, style: `animation-duration:${dur}ms` }, current.inks);
    const len = e.ink.getTotalLength(), bead = el('g', {}, current.svg);
    el('circle', { class: 'fm-bead', r: 3.4 }, bead); el('circle', { class: 'fm-bead-hi', cx: -1, cy: -1.2, r: 0.9 }, bead);
    const prints = [], K = Math.max(3, Math.floor(len / 26));
    for (let i = 1; i < K; i++) {
      const t = i / K, p = e.ink.getPointAtLength(len * t), q = e.ink.getPointAtLength(len * Math.min(1, t + 0.01));
      const ang = Math.atan2(q.y - p.y, q.x - p.x), side = i % 2 ? 5 : -5, cx = p.x - Math.sin(ang) * side, cy = p.y + Math.cos(ang) * side;
      prints.push({ f: el('ellipse', { class: 'fm-step', cx, cy, rx: 3.2, ry: 1.9, transform: `rotate(${ang * 180 / Math.PI} ${cx} ${cy})` }, current.steps), t: t + 0.08 });
    }
    const t0 = performance.now();
    (function write(now) {
      if (destroyed || !bead.isConnected) return;
      const t = Math.min(1, (now - t0) / dur), ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const p = e.ink.getPointAtLength(len * ease);
      bead.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${(1 + 0.12 * Math.sin(now / 70)).toFixed(3)})`);
      for (const pr of prints) if (pr.t <= ease && !pr.f.classList.contains('on')) pr.f.classList.add('on');
      if (t < 1) return requestAnimationFrame(write);
      bead.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => bead.remove();
      wet.animate([{ opacity: 0.85 }, { opacity: 0.85, offset: 0.2 }, { opacity: 0 }], { duration: 1600, easing: 'ease-out', fill: 'forwards' }).onfinish = () => wet.remove();
      e.ink.classList.remove('drawing');
      finish();
    })(t0);
  }
  function drawLog(fresh) {
    const ol = $('[data-log]'); if (!ol) return;
    ol.innerHTML = state.log.slice(0, 3).map((t, i) => `<li class="${fresh && i === 0 ? 'new' : ''}">${esc(t)}</li>`).join('');
  }
  function respec() {
    const c = ch();
    if (!ui.game.nearby?.().inTown || !respecJob(c, data)) return;
    state.log.unshift('ล้างรอยหมึกทั้งเล่ม · เริ่มเส้นทางใหม่'); pending.clear();
    const inks = current?.inks?.querySelectorAll('.fm-ink:not([style*="none"])') || [];
    inks.forEach((x) => x.classList.add('erasing'));
    ui.changed();
    setTimeout(() => { if (!destroyed) render(false); }, reduce ? 0 : 600);
  }

  // ---------- page change: the next map is laid over the last and taped down ----------
  function puff(dir) {
    const W = pageEl.clientWidth, H = pageEl.clientHeight;
    for (let i = 0; i < 14; i++) {
      const m = document.createElement('i'); m.className = 'fm-mote';
      const edge = i % 3, x = edge === 0 ? 18 + Math.random() * (W - 36) : edge === 1 ? 14 : W - 14, y = edge === 0 ? H - 6 : 30 + Math.random() * (H - 60);
      m.style.left = x + 'px'; m.style.top = y + 'px'; pageEl.appendChild(m);
      const dx = edge === 1 ? -14 - Math.random() * 22 : edge === 2 ? 14 + Math.random() * 22 : (Math.random() - 0.5) * 30, dy = edge === 0 ? 8 + Math.random() * 14 : (Math.random() - 0.5) * 18;
      m.animate([{ opacity: 0, transform: 'translate(0,0) scale(.6)' }, { opacity: 0.55, offset: 0.2 }, { opacity: 0, transform: `translate(${dx}px, ${dy - 10}px) scale(1.3)` }], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => m.remove();
    }
    void dir;
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function turnTo(id) {
    if (turning || destroyed || !byId[id] || id === state.page) return;
    if (reduce) { state.page = id; render(false); return; }
    turning = true;
    const dir = order(id) > order(state.page) ? 1 : -1, tilt = dir * (4 + Math.random() * 2);
    const old = $('[data-sheet]'); old.removeAttribute('data-sheet'); old.classList.add('under', 'hold'); old.querySelectorAll('.fm-intro').forEach((x) => x.classList.remove('fm-intro'));
    state.page = id; render(false, old);
    const sheet = $('[data-sheet]'), shadow = document.createElement('div'); shadow.className = 'fm-flyshadow';
    pageEl.insertBefore(shadow, sheet);
    sheet.classList.add('hold', 'flying'); sheet.style.transform = `translate(${dir * 75}%, -2%) rotate(${tilt}deg) scale(1.04)`; shadow.style.transform = `translate(${dir * 75}%, 4%) rotate(${tilt}deg) scale(1.04)`;
    pageEl.classList.add('laying');
    await frame(); await frame();
    const kf = (dy) => [
      { transform: `translate(${dir * 75}%, ${dy - 2}%) rotate(${tilt}deg) scale(1.04)`, easing: 'cubic-bezier(.2,.6,.35,1)' },
      { transform: `translate(${dir * 4}%, ${dy * 0.5 - 1}%) rotate(${tilt * 0.2}deg) scale(1.025)`, offset: 0.62, easing: 'cubic-bezier(.5,0,.8,.6)' },
      { transform: `translate(0, ${dy * 0.1}%) rotate(-.6deg) scale(.994)`, offset: 0.8, easing: 'ease-out' },
      { transform: 'none' },
    ];
    const opt = { duration: 1000, easing: 'linear', fill: 'forwards' };
    shadow.animate([{ opacity: 0.9 }, { opacity: 0.7, offset: 0.62 }, { opacity: 0 }], opt);
    shadow.animate(kf(6), { ...opt, composite: 'replace' });
    try { await sheet.animate(kf(0), opt).finished; } catch { /* cancelled when the panel closes */ }
    if (destroyed) return;
    sheet.style.transform = ''; sheet.getAnimations().forEach((x) => x.cancel());
    puff(dir);
    sheet.classList.remove('flying', 'hold');
    sheet.querySelectorAll('.fm-tape').forEach((t, i) => { t.style.setProperty('--td', `${i * 0.08}s`); t.classList.add('press'); });
    old.remove(); shadow.remove(); pageEl.classList.remove('laying'); turning = false;
  }

  // ---------- input ----------
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-f],[data-go],[data-branch],[data-node]');
    if (!t || !root.contains(t)) return;
    if (t.dataset.tab) {
      const mine = currentJob(ch(), data)?.job;
      return turnTo(t.dataset.tab === 'jobs' && mine ? `job.${mine}.${Object.keys(tree.jobs[mine].branches)[0]}` : t.dataset.tab);
    }
    if (t.dataset.go) return turnTo(t.dataset.go);
    if (t.dataset.branch) return turnTo(`job.${current.P.job}.${t.dataset.branch}`);
    if (t.dataset.node) return select(t.dataset.node);
    const P = byId[state.page];
    switch (t.dataset.f) {
      case 'home': return turnTo('overview');
      case 'exit': return ui.close();
      case 'hub': return ui.open('menu');
      case 'prev': return turnTo(prevOf(P));
      case 'next': return turnTo(P.kind === 'job' ? nextBranch(P) : linear[linear.indexOf(P.id) + 1]);
      case 'close': return closeNote();
      case 'respec': return respecNote();
      case 'respec-yes': return respec();
      case 'buy': return spend(false);
      case 'route': return spend(true);
    }
  });
  root.addEventListener('keydown', (e) => {
    const t = e.target.closest?.('[data-node],[data-go]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.dataset.node ? select(t.dataset.node) : turnTo(t.dataset.go); }
    if (e.key === 'Escape') closeNote();
  });
  let resizeTimer;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!destroyed && !turning && !animating) render(false); }, 200); };
  addEventListener('resize', onResize);

  const start = () => { if (!destroyed) render(true); };
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1200))]).then(() => requestAnimationFrame(start));

  return {
    root,
    refresh() { if (!animating) refresh(true); else chrome(); },
    turnTo, select,
    jump(id) { const p = pageOf(tree, id); if (p === state.page) return select(id); turnTo(p); },
    snapshot: () => ({ page: state.page, turning, animating, selected: sel, points: ch().jobPoints, pending: [...pending], log: [...state.log] }),
    destroy() { destroyed = true; clearTimeout(resizeTimer); removeEventListener('resize', onResize); root.replaceChildren(); },
  };
}
