import { pathValue } from './tuning.js';
const LABELS = {
  cast: 'เตรียม / ชาร์จ', swing: 'ฟันและรอยอาวุธ', projectile: 'พุ่งและหาง', impact: 'ปะทะ', colors: 'สี', replay: 'จังหวะทดสอบ',
  castTime: 'เวลาเตรียมโจมตี', speed: 'ความเร็วพุ่ง', range: 'ระยะทาง', projectileRadius: 'ขนาดสำหรับทดสอบการชน', spread: 'มุมกระจาย',
  rim: 'สีขอบ', body: 'สีเนื้อเอฟเฟกต์', hot: 'ชั้นร้อน', core: 'สีแกนสว่าง', size: 'ขนาด', length: 'ความยาว', width: 'ความกว้าง',
  glowRadius: 'รัศมีแสง', glowStrength: 'ความสว่างแสง', trailRate: 'จำนวนริ้วต่อวินาที', trailLife: 'เวลาริ้วค้าง', trailSize: 'ขนาดริ้ว',
  headRadii: 'ขนาดหัว', tailHalfWidth: 'ความหนาหาง', tailSway: 'การแกว่งหาง', flowSpeed: 'ความเร็วการไหล', trailOffset: 'ตำแหน่งริ้ว',
  trailDrift: 'ความเร็วริ้วแยก', trailSpread: 'การกระจายริ้ว', headHeat: 'ความร้อนแกน', headTurbulence: 'การเคลื่อนไหวแกน',
  flashLife: 'เวลาแสงปะทะ', wisps: 'จำนวนเปลว', embers: 'จำนวนสะเก็ด', shake: 'กล้องสั่น', hitStop: 'หยุดเน้นจังหวะ',
  wispSize: 'ขนาดเปลว', emberSize: 'ขนาดสะเก็ด', wispLife: 'เวลาเปลวค้าง', emberLife: 'เวลาสะเก็ดค้าง',
  wispSpeed: 'ความเร็วเปลวแยก', emberSpeed: 'ความเร็วสะเก็ด', emberWidth: 'ความหนาสะเก็ด', emberShrink: 'การหดสะเก็ด',
  scale: 'ขนาดรวม', glowScale: 'ขนาดแสง', glowOpacity: 'ความเข้มแสง', trailScale: 'ขนาดหาง', trailSpeed: 'ความเร็วหาง',
  life: 'เวลาค้าง', opacity: 'ความเข้ม', growth: 'การขยาย', particles: 'จำนวนสะเก็ด', particleSize: 'ขนาดสะเก็ด',
  particleSpeed: 'ความเร็วสะเก็ด', particleLife: 'เวลาสะเก็ดค้าง', up: 'การกระเด็นขึ้น',
  trailStart: 'เริ่มรอยอาวุธช่วงเตรียม', trailEnd: 'รอยอาวุธต่อหลังฟัน', tilt: 'ความเอียงรอยฟัน', height: 'ความสูงรอยฟัน',
  finisherWidth: 'ความหนาคอมโบสาม', trailOpacity: 'ความเข้มรอยอาวุธ', trailCoreWidth: 'ความหนาขอบคม', zoneOpacity: 'ความเข้มพื้นที่ฟัน',
  flashSize: 'ความยาวแสงปะทะ', flashWidth: 'ความหนาแสงปะทะ', sparks: 'จำนวนสะเก็ด', sparkLength: 'ความยาวสะเก็ด', sparkWidth: 'ความหนาสะเก็ด', sparkLife: 'เวลาสะเก็ดค้าง',
  critScale: 'ขนาดเมื่อคริติคอล', heavyScale: 'ขนาดเมื่อฟันหนัก', arc: 'มุมพื้นที่ฟัน', radius: 'รัศมี',
  burst: 'หินปะทุและเศษหิน', attack: 'รอยกัด', delay: 'เวลารอก่อนปะทุ', turn: 'ระยะหมุนรอยฟัน',
  trailLength: 'ความยาวรอยพุ่ง', trailWidth: 'ความหนารอยพุ่ง',
  shaft: 'ก้านธนู', tip: 'หัวธนู', fletch: 'ขนธนู', trail: 'รอยพุ่ง', shadow: 'รอยแตก', rock: 'หิน', debris: 'เศษหิน',
  rocks: 'จำนวนหิน', rockWidth: 'ความกว้างหิน', rise: 'เวลาหินพุ่งขึ้น', hold: 'เวลาหินเริ่มยุบ',
  chipCount: 'จำนวนเศษหิน', chipSize: 'ขนาดเศษหิน', chipSpeed: 'ความเร็วเศษหิน', chipLife: 'เวลาเศษหินค้าง',
  dust: 'จำนวนฝุ่น', dustSize: 'ขนาดฝุ่น', dustLife: 'เวลาฝุ่นค้าง', crackWidth: 'ความหนารอยแตก', boundaryOpacity: 'ความเข้มขอบพื้นที่',
};
const label = (key) => LABELS[key] || String(key).replace(/([a-z])([A-Z])/g, '$1 $2');
function fieldLabel(path) {
  const key = path.at(-1);
  const group = path.at(-2);
  if (group === 'burst' && key === 'height') return 'ความสูงหิน';
  if (group === 'attack' && key === 'height') return 'ความสูงรอยกัด';
  if (group === 'swing' && key === 'arc') return 'มุมรอยฟัน';
  if (group === 'attack' && key === 'arc') return 'มุมรอยกัด';
  if (typeof key !== 'number') return label(key);
  const parent = path.at(-2);
  const suffix = parent === 'headRadii' ? ['ตามแนวพุ่ง', 'แนวขวาง'][key] : parent === 'trailOffset' ? ['ต้นช่วง', 'ปลายช่วง'][key] : String(key + 1);
  return label(parent) + ' · ' + suffix;
}
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}
function action(parent, text, fn, cls = '') {
  const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); parent.append(b); return b;
}
export function mountTuningPanel(parent, ctx) {
  const { tuning, state } = ctx;
  const entry = tuning.get(state.skill);
  const card = el('section', 'tuning-card'); card.setAttribute('aria-label', 'ปรับเอฟเฟกต์'); parent.append(card);
  const header = el('div', 'tuning-header'); header.append(el('strong', '', 'ปรับเอฟเฟกต์'));
  const select = el('select'); select.setAttribute('aria-label', 'สกิลที่ปรับ');
  for (const [id, skill] of Object.entries(ctx.skills)) {
    const option = el('option', '', skill.nameTh || skill.name); option.value = id; option.disabled = !ctx.playable(skill);
    select.append(option);
  }
  select.value = state.skill; select.addEventListener('change', () => ctx.onSkill(select.value)); header.append(select); card.append(header);
  card.append(el('p', 'tuning-note', 'ค่าปรับใช้ทดลองใน Lab จำแยกตามสกิล และส่งออกไปใช้ต่อได้'));
  const stages = el('div', 'row phase-buttons');
  const phases = entry.fx._labPhases || { cast: 'ชาร์จ', projectile: 'พุ่ง', impact: 'ปะทะ' };
  for (const [id, name] of [['full', 'ทั้งหมด'], ...Object.entries(phases)]) {
    const b = action(stages, name, () => ctx.onPreview(id), state.reviewPhase === id ? 'on' : '');
    b.dataset.phase = id; b.disabled = id !== 'full' && !entry.fx[id];
  }
  card.append(stages);
  const auto = el('label', 'tuning-auto'); const check = el('input'); check.type = 'checkbox'; check.checked = state.tuningAuto;
  check.addEventListener('change', () => (state.tuningAuto = check.checked)); auto.append(check, document.createTextNode('ปรับแล้วลองอัตโนมัติ')); card.append(auto);
  const groups = new Map();
  for (const field of entry.fields) {
    const group = field.path[0] === 'replay' ? 'replay' : field.path[1];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(field);
  }
  const ordered = ['swing', 'projectile', 'burst', 'attack', 'impact', 'cast', 'colors', 'replay', ...groups.keys()];
  for (const group of [...new Set(ordered)]) {
    const fields = groups.get(group);
    if (!fields) continue;
    const details = el('details', 'tuning-section'); details.open = state.tuningSections[group] ?? ['projectile', 'swing', 'burst', 'attack'].includes(group);
    details.addEventListener('toggle', () => (state.tuningSections[group] = details.open));
    details.append(el('summary', '', label(group)));
    const grid = el('div', 'tuning-fields'); details.append(grid);
    for (const field of fields) {
      const row = el('div', 'tuning-field'); const title = fieldLabel(field.path);
      const name = el('label', 'field-label', title); const id = 'tune-' + field.path.join('-'); name.htmlFor = id; row.append(name);
      const value = pathValue(entry, field.path);
      const input = el('input'); input.id = id; input.dataset.field = field.path.join('.'); input.setAttribute('aria-label', title);
      input.type = field.type === 'color' ? 'color' : field.type === 'boolean' ? 'checkbox' : 'range';
      let number;
      if (field.type === 'number') {
        number = el('input', 'field-number'); number.type = 'number'; number.inputMode = 'decimal';
        number.setAttribute('aria-label', title + ' ตัวเลข'); number.dataset.field = field.path.join('.');
        for (const node of [input, number]) { node.min = field.min; node.max = field.max; node.step = field.step; node.value = value; }
      } else if (field.type === 'boolean') input.checked = value;
      else input.value = value;
      const change = (node) => {
        const val = field.type === 'number' ? Number(node.value) : field.type === 'boolean' ? node.checked : node.value;
        if (field.type === 'number' && node.value === '') return;
        if (!tuning.set(state.skill, field.path, val)) return;
        const actual = pathValue(tuning.get(state.skill), field.path);
        if (number) { input.value = actual; if (node !== number) number.value = actual; }
        ctx.onChange();
      };
      input.addEventListener('input', () => change(input));
      if (number) {
        number.addEventListener('change', () => { change(number); number.value = pathValue(entry, field.path); });
        row.append(input, number);
      } else row.append(input);
      grid.append(row);
    }
    const reset = el('div', 'tuning-section-footer');
    action(reset, 'คืนค่าช่วงนี้', () => ctx.onReset(group === 'replay' ? ['replay'] : ['fx', group])); details.append(reset); card.append(details);
  }
  const footer = el('div', 'row tuning-actions');
  action(footer, 'ลองช่วงนี้', () => ctx.onPreview(state.reviewPhase), 'go');
  action(footer, 'คืนค่าทั้งสกิล', () => ctx.onReset(null));
  action(footer, 'ส่งออกค่าปรับ', () => {
    const blob = new Blob([JSON.stringify(tuning.export(state.skill), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = 'skill-lab-' + state.skill + '.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    ctx.onStatus('ส่งออกค่าปรับแล้ว');
  });
  action(footer, 'คัดลอกค่าปรับ', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(tuning.export(state.skill), null, 2)); ctx.onStatus('คัดลอกแล้ว'); }
    catch { ctx.onStatus('คัดลอกไม่ได้ ใช้ส่งออกค่าปรับแทนได้'); }
  });
  const file = el('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.setAttribute('aria-label', 'ไฟล์ค่าปรับ');
  action(footer, 'นำเข้าค่า', () => file.click());
  file.addEventListener('change', async () => {
    try {
      const data = JSON.parse(await file.files[0].text());
      if (!ctx.playable(ctx.skills[data.skill])) throw new Error('สกิลนี้ยังทดลองใน Lab ไม่ได้');
      const result = tuning.import(data); if (!result.applied) throw new Error('ไม่มีค่าที่ใช้กับสกิลนี้ได้'); ctx.onSkill(result.skill); ctx.onChange(); ctx.onStatus('นำเข้าค่าปรับแล้ว');
    } catch (error) { ctx.onStatus(error.message || 'อ่านไฟล์ไม่ได้'); }
  });
  footer.append(file); card.append(footer);
  const status = el('p', 'tuning-status', state.tuningStatus || 'พร้อมทดลอง'); status.id = 'tuning-status'; status.setAttribute('role', 'status'); card.append(status);
}
