// One vocabulary for native skill tags and the rules enforced by core/skills.js.
import { modFits, modSlotOf, modRequires, modSlotsFor } from '../core/skills.js';
import { meetsRequires } from '../core/character.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Every tag in six groups (docs/SKILL-TAXONOMY-RESEARCH-TH.md): power (exactly one of Attack/Spell,
// none only for a Warcry), delivery, shape (mods may still require a shape: wide_arc on Arc),
// element (a damaging skill names its element; Earth is a kind of Physical), effect, mechanic.
// tests/core/skill-tags.test.js holds skills, movement skills and mods to this vocabulary.
export const TAG_GROUPS = {
  power: {Attack:'โจมตี',Spell:'เวท'},
  delivery: {Melee:'ประชิด',Strike:'ฟันเป้า',Slam:'ทุบพื้น',Projectile:'ยิง',Chain:'เด้งต่อ',Area:'วงกว้าง',Channel:'ร่ายต่อเนื่อง',Summon:'อัญเชิญ',Minion:'ลูกสมุน',Aura:'ออร่า',Warcry:'คำราม',Curse:'คำสาป',Movement:'เคลื่อนที่'},
  shape: {Arc:'ฟันโค้ง',Line:'แนวตรง',Cone:'กรวย',Nova:'รอบตัว',Rain:'ยิงระลอก',Ground:'เล็งพื้น',Zone:'ค้างบนพื้น',Construct:'สิ่งสร้าง',Target:'เป้าหมาย'},
  element: {Physical:'กายภาพ',Fire:'ไฟ',Cold:'น้ำแข็ง',Lightning:'สายฟ้า',Poison:'พิษ',Earth:'ดิน',Arcane:'อาร์เคน'},
  effect: {Damage:'ทำดาเมจ',DoT:'ดาเมจต่อเนื่อง',Control:'ควบคุม',Debuff:'ดีบัฟ',Buff:'บัฟ',Heal:'ฟื้นฟู',Barrier:'โล่เกราะ',Guard:'ตั้งรับ',Counter:'สวนกลับ',Cleanse:'ล้างสถานะ',Leech:'ดูดเลือด'},
  mechanic: {Duration:'มีระยะเวลา',Charge:'ชาร์จ',Persistent:'พื้นที่คงอยู่',Trigger:'ทริกเกอร์'},
};
export const TAGS = Object.assign({}, ...Object.values(TAG_GROUPS));
export const ELEMENTS = {physical:'กายภาพ',fire:'ไฟ',cold:'น้ำแข็ง',lightning:'สายฟ้า',poison:'พิษ',arcane:'อาร์เคน',none:'ไม่มีดาเมจธาตุ'};
export const FILTERS = [['all','ทั้งหมด'],['Melee','ประชิด'],['Projectile','ยิง'],['Area','วงกว้าง'],['DoT','ต่อเนื่อง'],['Persistent','คงอยู่'],['Control','ควบคุม'],['Guard','ป้องกัน'],['Heal','ฟื้นฟู'],['Summon','อัญเชิญ']];
export function tagsHtml(tags) {
  return `<div class="seeker-tags">${[...tags].map(t=>`<span class="seeker-tag" data-skill-tag="${esc(t)}">${esc(TAGS[t] || t)}</span>`).join('')}</div>`;
}
export function requirementsHtml(def) {
  const req=Object.entries(def.requires||{});
  return `<p class="seeker-requires">ค่าสถานะที่ต้องมี: <b>${req.length?req.map(([s,v])=>`${esc(s)} ${v}`).join(' · '):'ไม่มีเงื่อนไข'}</b></p>`;
}
const FAMILIES = {element:'เปลี่ยนธาตุ',trigger:'ร่ายอัตโนมัติ',trajectory:'เปลี่ยนทางยิง',displace:'ย้ายตำแหน่งศัตรู'};
const tagList = (tags, join) => tags.map(t=>TAGS[t]||t).join(join);
export function modRules(mod) {
  const rules=[];
  if(mod.needs?.length) rules.push('ต้องเป็น: '+tagList(mod.needs,' + '));
  if(mod.on?.length) rules.push('รูปแบบ: '+tagList(mod.on,' หรือ '));
  if(mod.not?.length) rules.push('ใช้ไม่ได้กับ: '+tagList(mod.not,' / '));
  if(mod.family) rules.push('กลุ่ม'+(FAMILIES[mod.family]||mod.family)+' · ใส่สกิลเดียวกันได้ตัวเดียว');
  if(mod.grants?.length) rules.push('ให้แท็กเพิ่มกับม็อดอื่น: '+tagList(mod.grants,' / '));
  return rules.length?rules:['ไม่จำกัดประเภทสกิล'];
}
export function rulesHtml(mod) {
  return `<div class="seeker-mod-rules"><b>ใช้ร่วมกับสกิล</b>${modRules(mod).map(r=>`<div>${esc(r)}</div>`).join('')}${requirementsHtml(mod)}<small>ตรวจจากแท็กของสกิล รวมแท็กที่ม็อดอื่นในช่องเดียวกันให้เพิ่ม</small></div>`;
}
export function fitReason(fit) {
  if(fit.ok)return 'ประเภทตรงกัน';
  if(fit.reason==='needs')return 'ต้องเป็น '+tagList(fit.tags,' + ');
  if(fit.reason==='on')return 'ต้องเป็น '+tagList(fit.tags,' หรือ ');
  if(fit.reason==='not')return 'ใช้กับ '+tagList(fit.tags,' / ')+' ไม่ได้';
  if(fit.reason==='family')return 'มีม็อดกลุ่ม'+(FAMILIES[fit.family]||fit.family)+'อยู่แล้ว · ถอดตัวนั้นก่อน';
  return 'ใช้กับสกิลนี้ไม่ได้';
}
/** Mod sockets the skill in combat slot `index` currently has (rank-based). */
export const slotCapacity = (ch, data, index) => modSlotsFor(data, ch.skills[ch.slots[index]?.skill] || 1);
/** Separate type fit, activation, ownership and socket capacity. Browsing never mutates. */
export function modStatus(ch,data,index,inst) {
  const slot=ch.slots[index], md=data.mods.mods[inst.id];
  const companionInsts=(slot?.mods||[]).map(u=>ch.mods.find(m=>m.uid===u)).filter(m=>m&&data.mods.mods[m.id]);
  const companions=companionInsts.map(m=>data.mods.mods[m.id]);
  // Higher ranks ask for more stats (modRequires).
  const fit=modFits(data.skills.combat[slot?.skill],md,companions), req=meetsRequires(ch,modRequires(data,md,inst.level||1)), where=modSlotOf(ch,inst.uid);
  const duplicate=!!slot?.mods.some(u=>u!==inst.uid&&ch.mods.find(m=>m.uid===u)?.id===inst.id);
  const full=(slot?.mods.length||0)>=slotCapacity(ch,data,index);
  const own=where===index;
  const activeCompanions=companionInsts.filter(m=>meetsRequires(ch,modRequires(data,data.mods.mods[m.id],m.level||1)).ok).map(m=>data.mods.mods[m.id]);
  const activeFit=modFits(data.skills.combat[slot?.skill],md,activeCompanions);
  const reason=!slot?.skill?'เลือกสกิลในช่องนี้ก่อน':!fit.ok?fitReason(fit):own?'ใส่ในช่องนี้แล้ว':duplicate?'มีม็อดชนิดนี้อยู่แล้ว':full?'ช่องม็อดเต็ม · ถอดหนึ่งชิ้นก่อน':'พร้อมใส่';
  return {fit,req,where,own,reason,active:req.ok&&activeFit.ok,can:!!slot?.skill&&fit.ok&&!own&&!duplicate&&!full};
}
export function skillMeta(def, compiled) {
  const native=def.tags||[], effective=compiled?[...compiled.tags].filter(t=>!native.includes(t)):[];
  return `<div class="seeker-skill-meta"><small>ประเภทพื้นฐาน</small>${tagsHtml(native)}${def.element?`<p>ธาตุดาเมจ: <b>${ELEMENTS[compiled?.element||def.element]||esc(def.element)}</b></p>`:''}${effective.length?`<small>ความสามารถเสริมจากม็อดที่ทำงาน</small>${tagsHtml(effective)}`:''}${requirementsHtml(def)}</div>`;
}
