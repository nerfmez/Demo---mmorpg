// The wheel Job Tree screen (owner, 2026-11-03, phase B; data/wheeltree.json, rules in core/character.js).
// Two levels for an iPad: the wheel (the inner ring's six sectors around the centre, the heavy weapon and
// dual wield side lines, and the twelve jobs around the outside) with pan and pinch zoom; and a job's page
// (its trunk and its branches as columns, forks side by side). Tapping a node opens its card: name,
// effects, cost, why it cannot be taken yet, and the buttons that spend points. It only reads the rules'
// answers (jobNodeState, jobRoute) and calls them to spend; it never decides what a node allows.
import {
  jobNodeState, allocateJobNode, jobRoute, allocateJobRoute, respecCost, respecJob, currentJob, nodeCost,
  jobPointsSpent, jobChoiceLevel,
} from '../core/character.js';
import { ICONS } from './icons.js';

export const isWheelTree = (data) => !!data.jobtree?.jobs;

// Layout (presentation only). SVG degrees: 0 = right, 90 = down. INT at the top, STR/DEX at the bottom.
const SECTOR_ANGLE = { int: -90, dexint: -30, dex: 30, strdex: 90, str: 150, intstr: 210 };
const SIDE_LINE = { heavy: { from: 'in.str.s4', turn: 16 }, dual: { from: 'in.strdex.sd4', turn: -16 } };
const JOB_SECTOR = {
  guardian: 'str', heavy: 'str', blade: 'strdex', duelist: 'strdex', power: 'dex', hunter: 'dex',
  trapper: 'dexint', spellarcher: 'dexint', elemage: 'int', summoner: 'int', priest: 'intstr', spellblade: 'intstr',
};
const JOB_ICON = {
  heavy: 'hammer', guardian: 'ward', blade: 'slash', duelist: 'sword', power: 'arrow', hunter: 'wolf',
  trapper: 'hex', spellarcher: 'spark', elemage: 'fire', summoner: 'portal', priest: 'heal', spellblade: 'whirl',
};
const jobGlyph = (job) => (ICONS[JOB_ICON[job]] || ICONS.plus).replace('<svg ', '<svg x="-15" y="-15" width="30" height="30" class="wt-jobicon" ');
const HUE = {
  center: '#ffd166', str: '#ff7a59', strdex: '#ffa94d', dex: '#7be07a', dexint: '#4fd1c5', int: '#6ea8ff',
  intstr: '#c59bff', heavy: '#ff9d5c', dual: '#4ee0c8',
};
const R0 = 62, STEP = 24, R_JOB = 392, VIEW = 440;
const ROLE_TH = { pack: 'กวาดฝูง', single: 'เป้าเดี่ยว', team: 'ช่วยทีม', survival: 'เอาตัวรอด', income: 'หาของ' };
const TYPE_TH = { minor: 'โหนดผ่าน', notable: 'โหนดเด่น', keystone: 'โหนดยอด', job: 'อาชีพ' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const polar = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];

/** Positions of the wheel's nodes (inner ring and job entries), in SVG units around (0, 0). */
export function wheelLayout(tree) {
  const at = {};
  const nodes = tree.nodes;
  for (const [id, n] of Object.entries(nodes)) {
    if (n.ring !== 'inner') continue;
    const k = Number(id.match(/(\d+)$/)?.[1] || 0);
    if (n.sector === 'center') at[id] = k === 1 ? [0, 0] : polar(34, -60 + (k - 2) * 60);
    else if (SECTOR_ANGLE[n.sector] != null) at[id] = polar(R0 + (k - 1) * STEP, SECTOR_ANGLE[n.sector]);
  }
  for (const [sector, side] of Object.entries(SIDE_LINE)) {
    const base = nodes[side.from];
    if (!base) continue;
    const k0 = Number(side.from.match(/(\d+)$/)[1]), r0 = R0 + (k0 - 1) * STEP;
    for (const [id, n] of Object.entries(nodes)) {
      if (n.ring !== 'inner' || n.sector !== sector) continue;
      const k = Number(id.match(/(\d+)$/)[1]);
      at[id] = polar(r0 + k * STEP, SECTOR_ANGLE[base.sector] + side.turn);
    }
  }
  const pairs = {};
  for (const [job, j] of Object.entries(tree.jobs)) {
    const s = JOB_SECTOR[job] || 'str', i = (pairs[s] = (pairs[s] ?? -1) + 1);
    at[j.entry] = polar(R_JOB, SECTOR_ANGLE[s] + (i ? 12 : -12));
  }
  return at;
}

const REASON = {
  taken: () => 'ลงแต้มแล้ว',
  prerequisite: () => 'ต้องลงโหนดก่อนหน้าให้ถึงก่อน',
  job_level: (st) => `ปลดล็อกที่ Job Lv ${st.need}`,
  one_job: (st, tree) => `เลือกอาชีพ ${tree.nodes[st.other]?.nameTh || ''} ไปแล้ว · คืนแต้มเพื่อเปลี่ยน`,
  requires_job: (st, tree) => `เฉพาะอาชีพ ${tree.jobs[st.need]?.nameTh || st.need}`,
  fork_taken: () => 'เลือกทางแยกอื่นในขั้นนี้ไปแล้ว',
  no_points: (st) => `แต้มไม่พอ (ต้องใช้ ${st.need})`,
  fork_choice: () => 'บนเส้นทางมีทางแยก · เลือกทางแยกก่อน',
  job_choice: () => 'เลือกอาชีพก่อน',
};
const reasonText = (st, tree) => (REASON[st.reason] || (() => st.reason))(st, tree);

export function createWheel(root, ui, { effectText }) {
  const { data } = ui.game;
  const tree = data.jobtree, N = tree.nodes;
  const at = wheelLayout(tree);
  const wheelIds = Object.keys(at);
  const view = { x: 0, y: 0, k: 1 };
  let page = 'wheel', selected = null, confirm = false, fresh = new Set();
  const ch = () => ui.game.ch;

  root.innerHTML = `
    <div class="wt-bar">
      <div class="wt-switch" role="tablist">
        <button class="wt-tab" data-w="page" data-page="wheel" role="tab">วงล้อ</button>
        <button class="wt-tab" data-w="page" data-page="job" role="tab" data-jobtab></button>
      </div>
      <div class="wt-points" aria-live="polite"></div>
      <button class="wt-respec" data-w="respec">คืนแต้ม</button>
    </div>
    <div class="wt-main">
      <div class="wt-stage">
        <svg class="wt-svg" viewBox="${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="วงล้อ Job Tree">
          <g class="wt-cam"><g class="wt-art"></g></g>
        </svg>
        <div class="wt-zoom">
          <button data-w="zoom" data-z="1.35" aria-label="ซูมเข้า">+</button>
          <button data-w="zoom" data-z="0.74" aria-label="ซูมออก">−</button>
          <button data-w="fit" aria-label="พอดีจอ">⤢</button>
        </div>
        <div class="wt-hint">แตะโหนดเพื่อดูรายละเอียด · ลากเพื่อเลื่อน · สองนิ้วเพื่อซูม</div>
      </div>
      <div class="wt-jobpage" hidden></div>
      <aside class="wt-card" aria-live="polite"></aside>
    </div>`;
  const svg = root.querySelector('.wt-svg'), cam = root.querySelector('.wt-cam'), art = root.querySelector('.wt-art');
  const stage = root.querySelector('.wt-stage'), jobPage = root.querySelector('.wt-jobpage'), card = root.querySelector('.wt-card');

  // ---------- state of a node for drawing ----------
  const stateOf = (id) => {
    const st = jobNodeState(ch(), data, id);
    if (id === tree.origin || st.taken) return 'own';
    if (st.can) return 'open';
    if (st.reason === 'no_points') return 'next';
    if (st.reason === 'fork_taken') return 'shut';
    return 'lock';
  };

  // ---------- the wheel (SVG) ----------
  function drawWheel() {
    const c = ch(), owned = new Set(c.jobNodes);
    let links = '', dots = '', labels = '';
    for (const id of wheelIds) {
      const n = N[id];
      for (const p of n.requires || []) {
        if (!at[p] || p === tree.origin) continue;
        const on = owned.has(p) && owned.has(id);
        links += `<line x1="${at[p][0]}" y1="${at[p][1]}" x2="${at[id][0]}" y2="${at[id][1]}" class="wt-link ${on ? 'on' : ''}" style="--hue:${HUE[n.sector] || HUE.center}"/>`;
      }
    }
    // the centre chain c2..c6 hangs off c1 in a ring
    for (const s of Object.keys(SECTOR_ANGLE)) {
      const [x, y] = polar(R0 + 12 * STEP + 22, SECTOR_ANGLE[s]);
      labels += `<text x="${x}" y="${y}" class="wt-sector" style="--hue:${HUE[s]}">${esc(tree.sectors?.[s] || s)}</text>`;
    }
    for (const [s, side] of Object.entries(SIDE_LINE)) {
      const k0 = Number(side.from.match(/(\d+)$/)[1]);
      const [x, y] = polar(R0 + (k0 - 1) * STEP + 4.5 * STEP, SECTOR_ANGLE[N[side.from].sector] + side.turn * 2.1);
      labels += `<text x="${x}" y="${y}" class="wt-sector small" style="--hue:${HUE[s]}">${esc(tree.sectors?.[s] || s)}</text>`;
    }
    const job = currentJob(c, data);
    for (const id of wheelIds) {
      const n = N[id], [x, y] = at[id], s = stateOf(id), sel = id === selected ? ' sel' : '', nw = fresh.has(id) ? ' new' : '';
      if (n.type === 'job') {
        const mine = job && job.job === n.job, other = job && !mine;
        dots += `<g class="wt-jobdot ${s}${mine ? ' mine' : ''}${other ? ' other' : ''}${sel}" transform="translate(${x} ${y})" style="--hue:${HUE[JOB_SECTOR[n.job]]}">
          <circle r="25"/>${jobGlyph(n.job)}
          <text y="44" class="wt-joblabel">${esc(n.nameTh)}</text></g>`;
        continue;
      }
      const r = id === 'in.center.c1' ? 12 : n.type === 'notable' ? 10 : 6.5;
      const shape = n.type === 'notable'
        ? `<rect x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" rx="3" transform="rotate(45)"/>`
        : `<circle r="${r}"/>`;
      dots += `<g transform="translate(${x} ${y})"><g class="wt-dot ${s}${sel}${nw}" style="--hue:${HUE[n.sector] || HUE.center}">${shape}</g></g>`;
    }
    const lock = c.jobLevel < jobChoiceLevel(data);
    labels += `<circle r="${R_JOB}" class="wt-jobring"/>`;
    if (lock) labels += `<text x="0" y="${-R_JOB - 30}" class="wt-ringnote">อาชีพปลดล็อกที่ Job Lv ${jobChoiceLevel(data)}</text>`;
    art.innerHTML = `<g>${labels}</g><g>${links}</g><g>${dots}</g>`;
  }

  const applyCam = () => cam.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  const unitsPerPx = () => { const r = svg.getBoundingClientRect(); return (VIEW * 2) / Math.max(1, Math.min(r.width, r.height)); };
  const clampView = () => {
    view.k = Math.min(4, Math.max(0.85, view.k));
    const lim = VIEW * view.k;
    view.x = Math.max(-lim, Math.min(lim, view.x)); view.y = Math.max(-lim, Math.min(lim, view.y));
  };
  function zoomAt(f, sx, sy) { // sx, sy: SVG units from the centre of the view
    const k = Math.min(4, Math.max(0.85, view.k * f)), g = k / view.k;
    view.x = sx - (sx - view.x) * g; view.y = sy - (sy - view.y) * g; view.k = k;
    clampView(); applyCam();
  }
  const toSvg = (cx, cy) => { const r = svg.getBoundingClientRect(), u = unitsPerPx(); return [(cx - r.left - r.width / 2) * u, (cy - r.top - r.height / 2) * u]; };
  function nearest(cx, cy) {
    const [sx, sy] = toSvg(cx, cy), wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k;
    const reach = 26 * unitsPerPx() / view.k; // a finger: about 26 px from the node
    let best = null, bd = Infinity;
    for (const id of wheelIds) {
      const d = Math.hypot(at[id][0] - wx, at[id][1] - wy) - (N[id].type === 'job' ? 22 : 0);
      if (d < bd) { bd = d; best = id; }
    }
    return bd <= reach ? best : null;
  }

  // pointers: one finger pans, two pinch, a short still touch is a tap
  const pts = new Map();
  let gesture = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) gesture = { tap: true, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, t: performance.now() };
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      gesture = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k, mid: toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), vx: view.x, vy: view.y };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (gesture.pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const k = Math.min(4, Math.max(0.85, gesture.k * d / gesture.pinch)), g = k / gesture.k;
      const mid = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      view.k = k; view.x = mid[0] - (gesture.mid[0] - gesture.vx) * g; view.y = mid[1] - (gesture.mid[1] - gesture.vy) * g;
    } else if (pts.size === 1) {
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 8) gesture.tap = false;
      if (!gesture.tap) { const u = unitsPerPx(); view.x = gesture.vx + dx * u; view.y = gesture.vy + dy * u; }
    }
    clampView(); applyCam();
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (gesture?.tap && !pts.size && e.type === 'pointerup') {
      const id = nearest(e.clientX, e.clientY);
      select(id);
    }
    if (!pts.size) gesture = null;
    else if (gesture?.pinch) { const [p] = [...pts.values()]; gesture = { tap: false, x: p[0], y: p[1], vx: view.x, vy: view.y }; }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.15 : 0.87, sx, sy); }, { passive: false });

  // ---------- a job's page ----------
  const viewJob = () => {
    const mine = currentJob(ch(), data);
    return mine?.job || (selected && N[selected]?.job) || Object.keys(tree.jobs)[0];
  };
  function nodeButton(id) {
    const n = N[id], s = stateOf(id), eff = Object.entries(n.effects || {}).filter(([k]) => k !== 'perTargetCap');
    const main = n.type === 'minor' ? eff.map(([k, v]) => effectText(k, v)).join(' · ') : n.nameTh;
    const sub = n.type === 'minor' ? '' : `<small>${esc(eff.map(([k, v]) => effectText(k, v)).join(' · '))}</small>`;
    return `<button class="wt-node ${s} t-${n.type}${id === selected ? ' sel' : ''}${fresh.has(id) ? ' new' : ''}" data-w="node" data-id="${id}">
      <span class="wt-cost">${nodeCost(n)}</span><span class="wt-name">${esc(main)}</span>${sub}</button>`;
  }
  function drawJob() {
    const job = viewJob(), J = tree.jobs[job], ids = Object.keys(N).filter((id) => N[id].job === job && N[id].type !== 'job');
    const trunk = ids.filter((id) => id.startsWith(`job.${job}.trunk`));
    const hue = HUE[JOB_SECTOR[job]];
    const cols = Object.entries(J.branches).map(([bid, b]) => {
      const own = ids.filter((id) => N[id].branchId === bid);
      const rows = [], done = new Set();
      for (const id of own) {
        if (done.has(id)) continue;
        const g = N[id].forkGroup;
        if (g) {
          const forks = own.filter((f) => N[f].forkGroup === g);
          forks.forEach((f) => done.add(f));
          rows.push(`<div class="wt-fork"><span>ทางแยก · เลือก 1</span>${forks.map(nodeButton).join('')}</div>`);
        } else { done.add(id); rows.push(nodeButton(id)); }
      }
      const spent = own.filter((id) => ch().jobNodes.includes(id)).reduce((a, id) => a + nodeCost(N[id]), 0);
      return `<section class="wt-col"><header><b>${esc(b.nameTh)}</b><span class="wt-role">${ROLE_TH[b.role] || b.role}</span><em>${spent} แต้ม</em></header>${rows.join('')}</section>`;
    }).join('');
    const pick = Object.keys(tree.jobs).map((k) => `<button class="wt-jobchip ${k === job ? 'on' : ''}" data-w="job" data-job="${k}" style="--hue:${HUE[JOB_SECTOR[k]]}">${esc(tree.jobs[k].nameTh)}</button>`).join('');
    jobPage.style.setProperty('--hue', hue);
    jobPage.innerHTML = `
      <div class="wt-jobpick">${pick}</div>
      <div class="wt-jobhead">${nodeButton(J.entry)}<div class="wt-trunk">${trunk.map(nodeButton).join('<i class="wt-arrow">›</i>')}</div></div>
      <div class="wt-cols" style="--cols:${Object.keys(J.branches).length}">${cols}</div>`;
  }

  // ---------- the card ----------
  function drawCard() {
    const c = ch();
    if (confirm) {
      const cost = respecCost(c, data).job, town = ui.game.nearby?.().inTown, spent = jobPointsSpent(c, data);
      const ok = town && c.gold >= cost && spent > 0;
      card.innerHTML = `<h3>คืนแต้มทั้งหมด</h3><p>คืน ${spent} แต้มที่ลงไว้ รวมถึงอาชีพที่เลือก</p>
        <div class="wt-line"><span>ค่าธรรมเนียม</span><b>${cost.toLocaleString()} G</b></div>
        <p class="wt-why">${!town ? 'ต้องอยู่ในเมือง' : c.gold < cost ? `ทองไม่พอ (มี ${c.gold.toLocaleString()} G)` : spent ? 'ยืนยันแล้วคืนแต้มทันที' : 'ยังไม่ได้ลงแต้ม'}</p>
        <button class="wt-go" data-w="respec-yes" ${ok ? '' : 'disabled'}>ยืนยันคืนแต้ม</button>
        <button class="wt-quiet" data-w="respec-no">ยกเลิก</button>`;
      return;
    }
    const n = selected && N[selected];
    if (!n) {
      const job = currentJob(c, data);
      card.innerHTML = `<h3>Job Tree</h3>
        <p>ลงแต้มจากกลางวงออกไปทางไหนก็ได้ (Job Lv 1–${jobChoiceLevel(data) - 1}) แล้วเลือก 1 อาชีพที่ Job Lv ${jobChoiceLevel(data)}</p>
        <div class="wt-line"><span>อาชีพ</span><b>${job ? esc(job.nameTh) : 'ยังไม่เลือก'}</b></div>
        <div class="wt-line"><span>แต้มที่ลงแล้ว</span><b>${jobPointsSpent(c, data)}</b></div>
        <div class="wt-legend"><i class="own"></i>ลงแล้ว <i class="open"></i>ลงได้ <i class="lock"></i>ยังไม่ถึง</div>`;
      return;
    }
    const st = jobNodeState(c, data, selected);
    const where = n.ring === 'inner'
      ? `วงใน · ${esc(tree.sectors?.[n.sector] || n.sector)}`
      : n.type === 'job' ? 'อาชีพ' : `${esc(tree.jobs[n.job]?.nameTh)}${n.branchTh ? ' › ' + esc(n.branchTh) : ' › แกนอาชีพ'}${n.role ? ` · ${ROLE_TH[n.role] || n.role}` : ''}`;
    const eff = Object.entries(n.effects || {}).map(([k, v]) => k === 'perTargetCap' ? `<li>สูงสุด +${v}%</li>` : `<li>${esc(effectText(k, v))}</li>`).join('');
    let extra = '';
    if (n.type === 'job') {
      const J = tree.jobs[n.job];
      extra = `<p class="wt-note">${esc(n.entryTh || '')}</p><div class="wt-branchlist">${Object.values(J.branches).map((b) => `<span>${esc(b.nameTh)} <em>${ROLE_TH[b.role] || b.role}</em></span>`).join('')}</div>`;
    }
    if (n.forkGroup) {
      const sib = Object.keys(N).filter((id) => N[id].forkGroup === n.forkGroup && id !== selected).map((id) => esc(N[id].nameTh));
      extra += `<p class="wt-note">ทางแยก: เลือกได้ 1 · อีกทาง ${sib.join(', ')}</p>`;
    }
    if (n.uptime != null && n.uptime < 1) extra += `<p class="wt-note dim">ค่าที่แสดงเป็นค่าเฉลี่ยตามเงื่อนไข (ทำงานราว ${Math.round(n.uptime * 100)}% ของเวลา)</p>`;
    let act = '';
    if (st.taken || selected === tree.origin) act = `<p class="wt-why ok">ลงแต้มแล้ว</p>`;
    else if (st.can) act = `<button class="wt-go" data-w="buy">${n.type === 'job' ? 'เลือกอาชีพนี้' : 'ลงแต้ม'} <b>${nodeCost(n) ? '−' + nodeCost(n) : 'ฟรี'}</b></button>`;
    else {
      const r = st.reason === 'prerequisite' ? jobRoute(c, data, selected) : null;
      if (r?.can) act = `<button class="wt-go" data-w="route">ลงตามเส้นทาง ${r.path.length} โหนด <b>−${r.cost}</b></button>
        <p class="wt-note dim">ยังต่อไม่ถึง · ปุ่มนี้ลงโหนดที่ขาดตามเส้นทางให้ทั้งหมด</p>`;
      else act += `<p class="wt-why">${esc(reasonText(r && !r.can ? r : st, tree))}</p>`;
    }
    if (n.type === 'job') act += `<button class="wt-quiet" data-w="openjob" data-job="${n.job}">ดูสายอาชีพ ›</button>`;
    if (n.type === 'job' && st.can) act += `<p class="wt-note dim">เลือกได้ 1 อาชีพ · เปลี่ยนได้ด้วยการคืนแต้ม (เสียทอง)</p>`;
    card.innerHTML = `<div class="wt-cardhead" style="--hue:${HUE[n.sector || JOB_SECTOR[n.job]] || HUE.center}">
        <span class="wt-type">${TYPE_TH[n.type] || ''}</span><span class="wt-price">${nodeCost(n)} แต้ม</span></div>
      <h3>${esc(n.nameTh)}</h3><p class="wt-where">${where}</p><ul class="wt-eff">${eff || '<li>—</li>'}</ul>${extra}<div class="wt-act">${act}</div>
      <button class="wt-close" data-w="close" aria-label="ปิด">×</button>`;
  }

  // ---------- refresh and actions ----------
  function refresh() {
    const c = ch(), job = currentJob(c, data);
    root.querySelector('.wt-points').innerHTML = `<b>${c.jobPoints}</b> แต้มเหลือ <span>Job Lv ${c.jobLevel}</span>`;
    const jt = root.querySelector('[data-jobtab]');
    jt.textContent = job ? `อาชีพ: ${job.nameTh}` : 'อาชีพ';
    root.querySelectorAll('.wt-tab').forEach((b) => b.classList.toggle('on', b.dataset.page === page));
    root.querySelector('.wt-respec').textContent = `คืนแต้ม ${respecCost(c, data).job.toLocaleString()} G`;
    stage.hidden = page !== 'wheel'; jobPage.hidden = page !== 'job';
    root.classList.toggle('has-card', !!(selected || confirm));
    if (page === 'wheel') drawWheel(); else drawJob();
    drawCard();
    applyCam();
  }
  function select(id) { selected = id; confirm = false; refresh(); }
  function spent(ids) {
    fresh = new Set(ids);
    ui.game.notify?.({ type: 'job' });
    ui.changed(); // re-derives, saves, and calls refresh()
    setTimeout(() => { fresh = new Set(); }, 700);
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-w]');
    if (!t || !root.contains(t)) return;
    const c = ch();
    switch (t.dataset.w) {
      case 'page': page = t.dataset.page; return refresh();
      case 'job': selected = tree.jobs[t.dataset.job].entry; confirm = false; return refresh();
      case 'openjob': page = 'job'; selected = tree.jobs[t.dataset.job].entry; return refresh();
      case 'node': return select(t.dataset.id);
      case 'close': selected = null; confirm = false; return refresh();
      case 'zoom': return zoomAt(Number(t.dataset.z), 0, 0);
      case 'fit': view.x = 0; view.y = 0; view.k = 1; return applyCam();
      case 'respec': confirm = true; return refresh();
      case 'respec-no': confirm = false; return refresh();
      case 'respec-yes':
        if (ui.game.nearby?.().inTown && respecJob(c, data)) { confirm = false; selected = null; page = 'wheel'; ui.changed(); }
        return;
      case 'buy': {
        const r = allocateJobNode(c, data, selected);
        if (r.done) { if (r.job) page = 'job'; spent([selected]); }
        return;
      }
      case 'route': {
        const r = allocateJobRoute(c, data, selected);
        if (r.done) spent(r.path);
        return;
      }
    }
  });

  refresh();
  return { refresh, destroy() { root.replaceChildren(); }, root, select, view, layout: at };
}
