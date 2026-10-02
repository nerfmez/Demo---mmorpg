// One vocabulary for native skill tags and the rules enforced by core/skills.js.
import { modFits, modSlotOf } from '../core/skills.js';
import { meetsRequires } from '../core/character.js';
import { ELEMENT_TAGS, DAMAGE_TAGS } from '../core/skill-tags.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TAGS = {
  Attack:'กายภาพ',Spell:'เวท',Melee:'ประชิด',Projectile:'โปรเจกไทล์',Area:'วงกว้าง',Damage:'ทำดาเมจ',
  DoT:'ดาเมจต่อเนื่อง',Persistent:'พื้นที่คงอยู่',Chain:'เด้งต่อ',Control:'ควบคุม',Debuff:'ดีบัฟ',
  Curse:'คำสาป',Guard:'เกราะ/การ์ด',Buff:'บัฟ',Warcry:'คำราม',Heal:'ฟื้นฟู',Summon:'อัญเชิญ',
  Minion:'ลูกสมุน',Movement:'เคลื่อนที่',Trigger:'ทริกเกอร์',Leech:'ดูดเลือด',
  Fire:'ไฟ',Earth:'ดิน',Cold:'น้ำแข็ง',Lightning:'สายฟ้า',Poison:'พิษ',Arcane:'อาร์เคน',Physical:'ดาเมจกายภาพ',
};
export const ELEMENTS = {physical:'กายภาพ',fire:'ไฟ',cold:'น้ำแข็ง',lightning:'สายฟ้า',poison:'พิษ',arcane:'อาร์เคน',none:'ไม่มีดาเมจธาตุ'};
export const FILTERS = [['all','ทั้งหมด'],['Attack','กายภาพ'],['Spell','เวท'],['Melee','ประชิด'],['Projectile','โปรเจกไทล์'],['Area','วงกว้าง'],['DoT','ต่อเนื่อง'],['Persistent','คงอยู่'],['Control','ควบคุม'],['Guard','ป้องกัน'],['Heal','ฟื้นฟู'],['Summon','อัญเชิญ'],...ELEMENT_TAGS.map(tag=>[tag,'ธาตุ: '+TAGS[tag]])];
export function tagsHtml(tags, scope='native') {
  return `<div class="seeker-tags" data-tag-scope="${esc(scope)}">${[...tags].map(t=>`<span class="seeker-tag" data-skill-tag="${esc(t)}"${ELEMENT_TAGS.includes(t)?' data-element-tag="'+esc(t)+'"':''}>${esc(TAGS[t] || t)}</span>`).join('')}</div>`;
}
export function elementHtml(element) {
  return element && element!=='none' ? `<span class="seeker-element" data-damage-element="${esc(element)}">ดาเมจ: ${esc(ELEMENTS[element] || element)}</span>` : '';
}
export function requirementsHtml(def) {
  const req=Object.entries(def.requires||{});
  return `<p class="seeker-requires">ค่าสถานะที่ต้องมี: <b>${req.length?req.map(([s,v])=>`${esc(s)} ${v}`).join(' · '):'ไม่มีเงื่อนไข'}</b></p>`;
}
export function modRules(mod) {
  const name=t=>TAGS[t]||t, rules=[];
  if(mod.requiresAll?.length) rules.push('ต้องมีครบ: '+mod.requiresAll.map(name).join(' + '));
  if(mod.requiresAny?.length) rules.push('และมีอย่างน้อยหนึ่ง: '+mod.requiresAny.map(name).join(' / '));
  if(mod.excludes?.length) rules.push('ใช้ไม่ได้กับ: '+mod.excludes.map(name).join(' / '));
  if(mod.requiresPersistent) rules.push('ต้องมีพื้นที่คงอยู่: บึงพิษ / น้ำพุฟื้นฟู หรือใส่ทิ้งไฟบนพื้นก่อน');
  return rules.length?rules:['ไม่จำกัดประเภทสกิล'];
}
export function modRuleChips(mod, compact=false) {
  const row=(kind,label,tags)=>tags?.length?`<div class="seeker-rule" data-mod-rule="${kind}"><span>${label}</span>${tagsHtml(tags,'rule')}</div>`:'';
  const rules=row('all',compact?'ต้องมี':'ต้องมีครบทุกแท็ก',mod.requiresAll)+row('any',compact?'อย่างน้อยหนึ่ง':'และมีอย่างน้อยหนึ่งแท็ก',mod.requiresAny)+row('exclude','ห้ามใช้กับ',mod.excludes)+
    (mod.requiresPersistent?'<div class="seeker-rule" data-mod-rule="persistent"><span>ต้องมี</span><span class="seeker-tag" data-required-capability="persistent">พื้นที่คงอยู่</span><small>จากสกิล หรือม็อดทิ้งไฟบนพื้นที่ทำงาน</small></div>':'');
  return `<div class="seeker-compatibility ${compact?'compact':''}">${rules||'<span class="muted">ทุกประเภทสกิล</span>'}</div>`;
}
export function rulesHtml(mod) {
  const output=mod.effect?.element?`<p>เปลี่ยนธาตุเป็น ${TAGS[DAMAGE_TAGS[mod.effect.element]]||mod.effect.element}</p>`:mod.effect?.groundDps?'<p>เพิ่มพื้นที่ธาตุไฟ · ไม่เปลี่ยนธาตุดาเมจโจมตี</p>':'';
  return `<div class="seeker-mod-rules"><small>แท็กม็อด</small>${tagsHtml(mod.tags||[],'mod')}<b>แท็กสกิลที่รองรับ</b>${modRuleChips(mod)}${output}${requirementsHtml(mod)}<small>ประเภทตรวจจากสกิลพื้นฐาน · ธาตุตรวจหลังม็อดเปลี่ยนธาตุที่ทำงาน · เอฟเฟคเสริมไม่ปลดแท็กให้สกิลหลัก</small></div>`;
}
export function fitReason(fit) {
  if(fit.ok)return 'ประเภทตรงกัน';
  if(fit.reason==='needs_persistent')return 'ต้องมีพื้นที่คงอยู่ หรือใส่ทิ้งไฟบนพื้นก่อน';
  const [prefix,raw='']=fit.reason.split(' for ').length>1?['not',fit.reason.slice(8)]:['needs',fit.reason.replace(/^needs /,'')];
  return (prefix==='not'?'ห้ามใช้กับ ':'ขาดประเภท ')+raw.split(/([+/])/).map(x=>x==='+'?' + ':x==='/'?' หรือ ':TAGS[x]||x).join('');
}
/** Separate type fit, activation, ownership and socket capacity. Browsing never mutates. */
export function modStatus(ch,data,index,inst) {
  const slot=ch.slots[index], md=data.mods.mods[inst.id];
  const companions=(slot?.mods||[]).map(u=>data.mods.mods[ch.mods.find(m=>m.uid===u)?.id]).filter(Boolean);
  const activeCompanions=companions.filter(m=>meetsRequires(ch,m.requires).ok);
  const fit=modFits(data.skills.combat[slot?.skill],md,activeCompanions), req=meetsRequires(ch,md?.requires), where=modSlotOf(ch,inst.uid);
  const duplicate=!!slot?.mods.some(u=>u!==inst.uid&&ch.mods.find(m=>m.uid===u)?.id===inst.id);
  const full=(slot?.mods.length||0)>=data.mods.maxModsPerSkill;
  const own=where===index;
  const activeFit=modFits(data.skills.combat[slot?.skill],md,activeCompanions);
  const reason=!slot?.skill?'เลือกสกิลในช่องนี้ก่อน':!fit.ok?fitReason(fit):own?'ใส่ในช่องนี้แล้ว':duplicate?'มีม็อดชนิดนี้อยู่แล้ว':full?'ช่องม็อดเต็ม · ถอดหนึ่งชิ้นก่อน':'พร้อมใส่';
  return {fit,req,where,own,reason,active:req.ok&&activeFit.ok,can:!!slot?.skill&&fit.ok&&!own&&!duplicate&&!full};
}
export function skillMeta(def, compiled) {
  const native=def.tags||[], current=compiled?[...compiled.tags]:native;
  const elements=current.filter(t=>ELEMENT_TAGS.includes(t)), original=native.filter(t=>ELEMENT_TAGS.includes(t));
  const effective=current.filter(t=>!native.includes(t)&&!ELEMENT_TAGS.includes(t));
  const converted=elements.join('/')!==original.join('/');
  return `<div class="seeker-skill-meta"><small>ประเภทสกิล</small>${tagsHtml(native.filter(t=>!ELEMENT_TAGS.includes(t)))}<small>ธาตุปัจจุบัน${elements.length?'':' · ไม่มีธาตุ'}</small>${tagsHtml(elements,'element')}${elementHtml(compiled?.element||def.element)}${converted?`<small>เปลี่ยนจาก ${original.map(t=>TAGS[t]).join(' · ')} → ${elements.map(t=>TAGS[t]).join(' · ')}</small>`:''}${compiled?.ground?`<small>ธาตุของพื้นที่เสริม</small>${tagsHtml(['Fire'],'secondary')}`:''}${effective.length?`<small>แท็กที่ม็อดเพิ่ม</small>${tagsHtml(effective,'added')}`:''}${requirementsHtml(def)}</div>`;
}
