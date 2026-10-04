// Journal lines (owner brief, October 2026): every build line can be followed alone to the
// character cap, and lines that suit each other can be mixed. Three related lines share a page
// in each stage. Inside a line the path forks (two focuses) and meets again; bridge nodes join
// neighbouring lines and a few cross to another page, so a player can stay pure or change line
// on the way. Nodes only give; the trade-off is the points not spent elsewhere (and MP: fast or
// many skills drain it unless MP is taken). Regenerates the line nodes and presentation in
// data/jobtree.json; idempotent.
import fs from 'node:fs';
const file = 'data/jobtree.json', raw = fs.readFileSync(file, 'utf8'), J = JSON.parse(raw);
const SEG = { 2: 6, 3: 8, 4: 8, 5: 6 }, MASTERY = 10;
const STAGE_MULT = { 2: 1, 3: 1.25, 4: 1.5, 5: 1.75 }, MASTERY_MULT = 0.6;
const GATES = { 4: 17, 5: 25 };
// Two alternating node shapes (A, B) per line, at stage-2 size; values grow with the stage.
const LINES = [
  { id: 'line.damage', name: 'ดาเมจล้วน', note: 'พลังโจมตี พลังเวท และดาเมจทุกแบบ', icon: 'sword', color: '#b0563f', entry: 'lesson.rhythm', category: 'melee',
    titles: ['ฝึกแรง', 'ทวีแรง', 'แรงล้น', 'แรงสุดขีด'], mastery: 'ชำนาญดาเมจ', aTitle: 'ฝีมือ', bTitle: 'ทวีคูณ',
    A: { attack: 0.9, magic: 0.55 }, B: { damagePct: 3 } },
  { id: 'line.crit', name: 'คริติคอล', note: 'โอกาสคริและคริแรงขึ้น', icon: 'eye', color: '#c08a2e', entry: 'lesson.rhythm', category: 'projectile',
    titles: ['ตาไว', 'เล็งจุดตาย', 'จุดตายซ้อน', 'หนึ่งตาสังหาร'], mastery: 'ชำนาญจุดตาย', aTitle: 'หาช่อง', bTitle: 'ปลิดชีพ',
    A: { critChancePct: 1.4 }, B: { critMultPct: 5.5 } },
  { id: 'line.speed', name: 'ตีเร็ว', note: 'ร่ายไวขึ้นและคูลดาวน์สั้นลง', icon: 'river', color: '#3f8a9e', entry: 'lesson.rhythm', category: 'mobility',
    titles: ['มือไว', 'จังหวะเร่ง', 'พายุจังหวะ', 'ไร้ช่องว่าง'], mastery: 'ชำนาญจังหวะ', aTitle: 'ร่ายไว', bTitle: 'ฟื้นคูลดาวน์',
    A: { castSpeedPct: 1.6 }, B: { cooldownPct: 1 } },
  { id: 'line.element', name: 'ธาตุ', note: 'ดาเมจธาตุไฟ น้ำแข็ง สายฟ้า พิษ และติดสถานะ', icon: 'drop', color: '#7a5bb0', entry: 'lesson.shelter', category: 'area',
    titles: ['สัมผัสธาตุ', 'ปลุกธาตุ', 'ธาตุคลั่ง', 'จ้าวธาตุ'], mastery: 'ชำนาญธาตุ', aTitle: 'ธาตุแรง', bTitle: 'ธาตุพิษ',
    A: { elementalDamagePct: 3.6 }, B: { elementalDamagePct: 1.8, poisonChancePct: 2 } },
  { id: 'line.physical', name: 'กายภาพ', note: 'ดาเมจของสกิลโจมตี (ไม่ใช่เวท) และเจาะเกราะ', icon: 'flag', color: '#8a6a4a', entry: 'lesson.rhythm', category: 'melee',
    titles: ['ร่างแกร่ง', 'คมเจาะ', 'ทะลวง', 'ทลายเกราะ'], mastery: 'ชำนาญกายภาพ', aTitle: 'กำลังกาย', bTitle: 'เจาะเกราะ',
    A: { attackDamagePct: 3 }, B: { penetrationPct: 1.85 } },
  { id: 'line.guardian', name: 'ป้องกันและโจมตี', note: 'HP เกราะ บล็อก และตีแรงขึ้นเล็กน้อย', icon: 'shield', color: '#4f7a5a', entry: 'lesson.shelter', category: 'support',
    titles: ['ยืนหยัด', 'โล่และดาบ', 'ป้อมเคลื่อนที่', 'กำแพงเหล็ก'], mastery: 'ชำนาญป้องกัน', aTitle: 'เกราะหนา', bTitle: 'โล่สวน',
    A: { maxHp: 10, defense: 1.5 }, B: { blockChancePct: 1, meleeDamagePct: 2 } },
  { id: 'line.agility', name: 'คล่องตัว', note: 'เดินเร็ว หลบไว ฟื้น HP', icon: 'horizon', color: '#5f8f6a', entry: 'lesson.shelter', category: 'mobility',
    titles: ['ก้าวเบา', 'ลมใต้เท้า', 'เงาว่องไว', 'ไร้ร่องรอย'], mastery: 'ชำนาญความคล่องตัว', aTitle: 'ฝีเท้า', bTitle: 'หลบไว',
    A: { moveSpeedPct: 1.2 }, B: { movementRechargePct: 1.6, hpRegen: 0.1 } },
  { id: 'line.mana', name: 'MP', note: 'MP สูงสุด ฟื้น MP และใช้ MP น้อยลง', icon: 'plus', color: '#4a6fb0', entry: 'lesson.shelter', category: 'lasting',
    titles: ['ลมหายใจ', 'ธารพลัง', 'บ่อพลัง', 'มหาสมุทรพลัง'], mastery: 'ชำนาญ MP', aTitle: 'คลังพลัง', bTitle: 'ประหยัด',
    A: { maxMp: 8, mpRegenPct: 4 }, B: { manaCostReductionPct: 1.5 } },
  { id: 'line.treasure', name: 'ล่าสมบัติ', note: 'สายธนู: ทอง วัตถุดิบ และอุปกรณ์ดรอปเพิ่ม', icon: 'compass', color: '#c9a03a', entry: 'lesson.rhythm', category: 'projectile',
    titles: ['ตาพราน', 'รอยทรัพย์', 'ถุงทองนักล่า', 'ราชาแห่งการล่า'], mastery: 'ชำนาญการล่า', aTitle: 'แกะรอย', bTitle: 'ถุงทอง',
    A: { materialFindPct: 1.4, projectileDamagePct: 1 }, B: { goldFindPct: 2, gearFindPct: 1.4 } },
];
// Pages: three lines that suit each other, side by side (lane order = left to right).
const FAMILIES = [
  { id: 'fam.weapon', name: 'สายอาวุธ', note: 'กายภาพ · ดาเมจล้วน · คริติคอล', icon: 'sword', color: '#a5603f', lanes: ['line.physical', 'line.damage', 'line.crit'] },
  { id: 'fam.arcane', name: 'สายเวทและจังหวะ', note: 'ธาตุ · MP · ตีเร็ว', icon: 'drop', color: '#6a5fa8', lanes: ['line.element', 'line.mana', 'line.speed'] },
  { id: 'fam.wild', name: 'สายเอาตัวรอดและล่า', note: 'ป้องกันและโจมตี · คล่องตัว · ล่าสมบัติ', icon: 'shield', color: '#4f7a5a', lanes: ['line.guardian', 'line.agility', 'line.treasure'] },
];
// Bridges that cross to another page (stages 3 and 4): pairs that work together across groups.
const CROSS = [
  { a: 'line.crit', b: 'line.treasure', name: 'ธนูนักล่า' },
  { a: 'line.speed', b: 'line.agility', name: 'ลมเร่ง' },
  { a: 'line.physical', b: 'line.guardian', name: 'นักรบโล่' },
];
const BRIDGE_NAMES = { 'line.physical|line.damage': 'คมหนัก', 'line.damage|line.crit': 'จุดอ่อน', 'line.element|line.mana': 'ธาตุไหลเวียน', 'line.mana|line.speed': 'ร่ายต่อเนื่อง', 'line.guardian|line.agility': 'ยืนหยัดว่องไว', 'line.agility|line.treasure': 'นักเดินทาง' };
const round = (v) => Math.round(v * 100) / 100;
const scale = (o, k) => Object.fromEntries(Object.entries(o).map(([s, v]) => [s, round(v * k)]));
const half = (a, b, k) => { const out = {}; for (const [s, v] of [...Object.entries(a), ...Object.entries(b)]) out[s] = round((out[s] || 0) + v * k / 2); return out; };
const byId = Object.fromEntries(LINES.map((l) => [l.id, l]));
// Remove earlier generated nodes, then rebuild.
for (const id of Object.keys(J.nodes)) if (J.nodes[id].line || J.nodes[id].bridge) delete J.nodes[id];
for (const n of Object.values(J.nodes)) n.links = n.links.filter((l) => J.nodes[l]);
for (const [stage, gate] of Object.entries(GATES)) J.sections[`stage-${stage}`] = { tier: Number(stage), requiresSpent: gate, nameTh: stage === '4' ? 'เส้นทางของตัวเอง' : 'สุดทาง' };
const stages = J.presentation.stages.filter((s) => s.id <= 3);
for (const s of stages) if (s.paths) s.paths = s.paths.filter((p) => !p.line);
const names = { 4: 'เส้นทางของตัวเอง', 5: 'สุดทาง' }, notes = { 4: 'ต่อจากขั้น 3 · เดินสายเดิมหรือข้ามสายผ่านจุดเชื่อม', 5: 'ปลายสาย จุดเชื่อมสุดท้าย และความชำนาญ' };
for (const s of [4, 5]) stages.push({ id: s, name: names[s], gate: GATES[s], note: notes[s], paths: [] });
J.presentation.groups = J.presentation.groups.filter((g) => !g.line);
const link = (a, b) => { if (!J.nodes[a].links.includes(b)) J.nodes[a].links.push(b); if (!J.nodes[b].links.includes(a)) J.nodes[b].links.push(a); };
const add = (id, node, parents) => { J.nodes[id] = { ...node, links: [], clusterPos: [0, 0] }; for (const p of parents) link(p, id); };
const last = {}; // line id -> the node the next stage continues from
for (const l of LINES) last[l.id] = l.entry;
const familyOf = (lineId) => FAMILIES.find((f) => f.lanes.includes(lineId));
for (const stage of [2, 3, 4, 5]) {
  const branch = (SEG[stage] - 2) / 2, mult = STAGE_MULT[stage], rowJoin = 1 + branch;
  const pages = Object.fromEntries(FAMILIES.map((f) => [f.id, { nodes: [], grid: {} }]));
  const ends = {}; // line id -> { entry, join }
  for (const f of FAMILIES) f.lanes.forEach((lineId, k) => {
    const L = byId[lineId], base = `${lineId}.${stage}`, page = pages[f.id], c0 = 2 * k, title = L.titles[stage - 2];
    const node = (id, nameTh, shape, type, extra = {}) => ({ name: nameTh, nameTh, stage, line: lineId, cost: 1, effects: scale(shape, mult), note: L.note, descTh: L.note, type, section: `stage-${stage}`, category: L.category, ...extra });
    const entry = `${base}.entry`, join = `${base}.join`;
    add(entry, node(entry, title, L.A, 'minor', { requires: [last[lineId]] }), [last[lineId]]);
    page.nodes.push(entry); page.grid[entry] = [c0 + 0.5, 0];
    const tips = [];
    for (const [side, shape, label, col] of [['a', L.A, L.aTitle, c0], ['b', L.B, L.bTitle, c0 + 1]]) {
      let prev = entry;
      for (let i = 1; i <= branch; i++) {
        const id = `${base}.${side}${i}`;
        add(id, node(id, `${label} ${i}`, shape, 'minor', { requires: [prev] }), [prev]);
        page.nodes.push(id); page.grid[id] = [col, i];
        prev = id;
      }
      tips.push(prev);
    }
    J.nodes[join] = node(join, `${title} · บรรจบ`, L.B, 'notable', { requires: [], requiresAny: [...tips] });
    J.nodes[join].links = []; J.nodes[join].clusterPos = [0, 0];
    for (const t of tips) link(t, join);
    page.nodes.push(join); page.grid[join] = [c0 + 0.5, rowJoin];
    ends[lineId] = { entry, join };
  });
  // Bridges: reachable from either line's entry; either line's join can be reached through it.
  const bridge = (a, b, nameTh, page, col, cross) => {
    const id = `bridge.${a.slice(5)}-${b.slice(5)}.${stage}`;
    J.nodes[id] = { name: nameTh, nameTh, stage, bridge: [a, b], cost: 1, effects: half(byId[a].A, byId[b].A, mult), note: `เชื่อม${byId[a].name}กับ${byId[b].name}`, descTh: `ลงจากสายใดก็ได้ แล้วไปต่ออีกสายได้`, type: 'notable', section: `stage-${stage}`, category: byId[a].category, requires: [], requiresAny: [ends[a].entry, ends[b].entry], links: [], clusterPos: [0, 0], cross: cross || undefined };
    for (const p of [ends[a].entry, ends[b].entry]) link(p, id);
    for (const l of [a, b]) { J.nodes[ends[l].join].requiresAny.push(id); link(id, ends[l].join); }
    page.nodes.push(id); page.grid[id] = [col, 0]; // beside the two entries it joins
  };
  for (const f of FAMILIES) for (let k = 0; k + 1 < f.lanes.length; k++) bridge(f.lanes[k], f.lanes[k + 1], BRIDGE_NAMES[`${f.lanes[k]}|${f.lanes[k + 1]}`], pages[f.id], 2 * k + 1.5);
  if (stage === 3 || stage === 4) for (const c of CROSS) { const f = familyOf(c.a), k = f.lanes.indexOf(c.a); bridge(c.a, c.b, c.name, pages[f.id], k === 0 ? -0.5 : 2 * k + 1.5, true); }
  for (const l of LINES) last[l.id] = ends[l.id].join;
  for (const f of FAMILIES) {
    const path = { id: `${f.id}.${stage}`, line: true, name: f.name, note: f.note, icon: f.icon, nodes: pages[f.id].nodes, grid: pages[f.id].grid };
    stages.find((s) => s.id === stage).paths.push(path);
    J.presentation.groups.push({ ...path, color: f.color });
  }
}
// Mastery: each line continues on its own after stage 5, one page per group.
for (const f of FAMILIES) {
  const page = { nodes: [], grid: {} };
  f.lanes.forEach((lineId, k) => {
    const L = byId[lineId];
    let prev = last[lineId];
    for (let i = 0; i < MASTERY; i++) {
      const id = `${lineId}.mastery.${i + 1}`, nameTh = `${L.mastery} ${i + 1}`, shape = i % 2 ? L.B : L.A;
      add(id, { name: nameTh, nameTh, stage: 5, line: lineId, requires: [prev], cost: 1, effects: scale(shape, MASTERY_MULT * STAGE_MULT[5]), note: 'ความชำนาญ: ลงแต้มต่อได้จนสุดสาย', descTh: L.note, type: i === MASTERY - 1 ? 'notable' : 'minor', section: 'stage-5', category: L.category }, [prev]);
      const column = Math.floor(i / 5), down = i % 5;
      page.nodes.push(id); page.grid[id] = [2.5 * k + column, column % 2 ? 4 - down : down]; // a half-column gap between lines
      prev = id;
    }
  });
  const path = { id: `${f.id}.mastery`, line: true, name: `ความชำนาญ · ${f.name}`, note: 'ลงแต้มต่อในสายเดิมได้จนสุด', icon: f.icon, nodes: page.nodes, grid: page.grid };
  stages.find((s) => s.id === 5).paths.push(path);
  J.presentation.groups.push({ ...path, color: f.color });
}
J.presentation.stages = stages;
let out = JSON.stringify(J, null, 2) + '\n';
if (/\\u[0-9a-f]{4}/.test(raw)) out = out.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(file, out);
console.log('pages', FAMILIES.length, 'line nodes', Object.values(J.nodes).filter((n) => n.line).length, 'bridges', Object.values(J.nodes).filter((n) => n.bridge).length);
