// Journal lines (owner brief, October 2026): every build line can be followed alone to the
// character cap. Each line runs through journal stages 2-5 and ends in a mastery chain, so a
// player who stays in one line spends every Job point there. Nodes only give; the trade-off is
// the points not spent elsewhere (and MP: fast or many skills drain it unless the MP line is
// taken). Regenerates the line nodes and presentation in data/jobtree.json; idempotent.
import fs from 'node:fs';
const file = 'data/jobtree.json', raw = fs.readFileSync(file, 'utf8'), J = JSON.parse(raw);
const SEG = { 2: 6, 3: 8, 4: 8, 5: 6 }, MASTERY = 10;
const STAGE_MULT = { 2: 1, 3: 1.25, 4: 1.5, 5: 1.75 }, MASTERY_MULT = 0.6;
const GATES = { 4: 17, 5: 25 };
// Two alternating node shapes (A, B) per line, at stage-2 size; values grow with the stage.
const LINES = [
  { id: 'line.damage', name: 'ดาเมจล้วน', note: 'พลังโจมตี พลังเวท และดาเมจทุกแบบ', icon: 'sword', color: '#b0563f', entry: 'lesson.rhythm', category: 'melee',
    titles: ['ฝึกแรง', 'ทวีแรง', 'แรงล้น', 'แรงสุดขีด'], mastery: 'ชำนาญดาเมจ',
    A: { attack: 0.9, magic: 0.55 }, B: { damagePct: 3 } },
  { id: 'line.crit', name: 'คริติคอล', note: 'โอกาสคริและคริแรงขึ้น', icon: 'eye', color: '#c08a2e', entry: 'lesson.rhythm', category: 'projectile',
    titles: ['ตาไว', 'เล็งจุดตาย', 'จุดตายซ้อน', 'หนึ่งตาสังหาร'], mastery: 'ชำนาญจุดตาย',
    A: { critChancePct: 1.4 }, B: { critMultPct: 5.5 } },
  { id: 'line.speed', name: 'ตีเร็ว', note: 'ร่ายไวขึ้นและคูลดาวน์สั้นลง', icon: 'river', color: '#3f8a9e', entry: 'lesson.rhythm', category: 'mobility',
    titles: ['มือไว', 'จังหวะเร่ง', 'พายุจังหวะ', 'ไร้ช่องว่าง'], mastery: 'ชำนาญจังหวะ',
    A: { castSpeedPct: 1.6 }, B: { cooldownPct: 1 } },
  { id: 'line.element', name: 'ธาตุ', note: 'ดาเมจธาตุไฟ น้ำแข็ง สายฟ้า พิษ และติดสถานะ', icon: 'drop', color: '#7a5bb0', entry: 'lesson.shelter', category: 'area',
    titles: ['สัมผัสธาตุ', 'ปลุกธาตุ', 'ธาตุคลั่ง', 'จ้าวธาตุ'], mastery: 'ชำนาญธาตุ',
    A: { elementalDamagePct: 3.6 }, B: { elementalDamagePct: 1.8, poisonChancePct: 2 } },
  { id: 'line.physical', name: 'กายภาพ', note: 'ดาเมจของสกิลโจมตี (ไม่ใช่เวท) และเจาะเกราะ', icon: 'flag', color: '#8a6a4a', entry: 'lesson.rhythm', category: 'melee',
    titles: ['ร่างแกร่ง', 'คมเจาะ', 'ทะลวง', 'ทลายเกราะ'], mastery: 'ชำนาญกายภาพ',
    A: { attackDamagePct: 3 }, B: { penetrationPct: 1.85 } },
  { id: 'line.guardian', name: 'ป้องกันและโจมตี', note: 'HP เกราะ บล็อก และตีแรงขึ้นเล็กน้อย', icon: 'shield', color: '#4f7a5a', entry: 'lesson.shelter', category: 'support',
    titles: ['ยืนหยัด', 'โล่และดาบ', 'ป้อมเคลื่อนที่', 'กำแพงเหล็ก'], mastery: 'ชำนาญป้องกัน',
    A: { maxHp: 10, defense: 1.5 }, B: { blockChancePct: 1, meleeDamagePct: 2 } },
  { id: 'line.agility', name: 'คล่องตัว', note: 'เดินเร็ว หลบไว ฟื้น HP', icon: 'horizon', color: '#5f8f6a', entry: 'lesson.shelter', category: 'mobility',
    titles: ['ก้าวเบา', 'ลมใต้เท้า', 'เงาว่องไว', 'ไร้ร่องรอย'], mastery: 'ชำนาญความคล่องตัว',
    A: { moveSpeedPct: 1.2 }, B: { movementRechargePct: 1.6, hpRegen: 0.1 } },
  { id: 'line.mana', name: 'MP', note: 'MP สูงสุด ฟื้น MP และใช้ MP น้อยลง', icon: 'plus', color: '#4a6fb0', entry: 'lesson.shelter', category: 'lasting',
    titles: ['ลมหายใจ', 'ธารพลัง', 'บ่อพลัง', 'มหาสมุทรพลัง'], mastery: 'ชำนาญ MP',
    A: { maxMp: 8, mpRegenPct: 4 }, B: { manaCostReductionPct: 1.5 } },
  { id: 'line.treasure', name: 'ล่าสมบัติ', note: 'สายธนู: ทอง วัตถุดิบ และอุปกรณ์ดรอปเพิ่ม', icon: 'compass', color: '#c9a03a', entry: 'lesson.rhythm', category: 'projectile',
    titles: ['ตาพราน', 'รอยทรัพย์', 'ถุงทองนักล่า', 'ราชาแห่งการล่า'], mastery: 'ชำนาญการล่า',
    A: { materialFindPct: 1.4, projectileDamagePct: 1 }, B: { goldFindPct: 2, gearFindPct: 1.4 } },
];
const round = (v) => Math.round(v * 100) / 100;
const scale = (o, k) => Object.fromEntries(Object.entries(o).map(([s, v]) => [s, round(v * k)]));
// Remove earlier generated lines, then rebuild.
for (const id of Object.keys(J.nodes)) if (J.nodes[id].line) delete J.nodes[id];
for (const n of Object.values(J.nodes)) n.links = n.links.filter((l) => J.nodes[l]);
for (const [stage, gate] of Object.entries(GATES)) J.sections[`stage-${stage}`] = { tier: Number(stage), requiresSpent: gate, nameTh: stage === '4' ? 'เส้นทางของตัวเอง' : 'สุดทาง' };
const stages = J.presentation.stages.filter((s) => s.id <= 3);
for (const s of stages) if (s.paths) s.paths = s.paths.filter((p) => !p.line);
const names = { 4: 'เส้นทางของตัวเอง', 5: 'สุดทาง' }, notes = { 4: 'แต่ละสายต่อจากขั้น 3 ของสายเดียวกัน', 5: 'ปลายสายและความชำนาญที่ลงแต้มได้ต่อเนื่อง' };
for (const s of [4, 5]) stages.push({ id: s, name: names[s], gate: GATES[s], note: notes[s], paths: [] });
J.presentation.groups = J.presentation.groups.filter((g) => !g.line);
const link = (a, b) => { J.nodes[a].links.push(b); J.nodes[b].links.push(a); };
for (const line of LINES) {
  let prev = line.entry, k = 0;
  for (const stage of [2, 3, 4, 5]) {
    const ids = [], count = SEG[stage] + (stage === 5 ? MASTERY : 0);
    for (let i = 0; i < count; i++) {
      const mastery = stage === 5 && i >= SEG[5], id = `${line.id}.${stage}.${i + 1}`;
      const shape = (k++ % 2 ? line.B : line.A), mult = mastery ? MASTERY_MULT * STAGE_MULT[5] : STAGE_MULT[stage];
      const nameTh = mastery ? `${line.mastery} ${i - SEG[5] + 1}` : `${line.titles[stage - 2]} ${i + 1}`;
      J.nodes[id] = { name: nameTh, nameTh, stage, line: line.id, requires: [prev], cost: 1, effects: scale(shape, mult),
        note: mastery ? 'ความชำนาญ: ลงแต้มต่อได้จนสุดสาย' : line.note, descTh: line.note, type: i === count - 1 || (!mastery && i === SEG[stage] - 1) ? 'notable' : 'minor',
        section: `stage-${stage}`, category: line.category, links: [], clusterPos: [0, 0] };
      link(prev, id);
      prev = id;
      ids.push(id);
    }
    const path = { id: `${line.id}.${stage}`, line: true, name: line.name, note: line.note, icon: line.icon, nodes: ids };
    stages.find((s) => s.id === stage).paths.push(path);
    J.presentation.groups.push({ ...path, color: line.color });
  }
}
J.presentation.stages = stages;
let out = JSON.stringify(J, null, 2) + '\n';
if (/\\u[0-9a-f]{4}/.test(raw)) out = out.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(file, out);
console.log('lines', LINES.length, 'nodes', Object.values(J.nodes).filter((n) => n.line).length);
