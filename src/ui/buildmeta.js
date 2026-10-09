// One vocabulary for native skill tags and the rules enforced by core/skills.js.
import { modFits, modSlotOf, modRequires } from '../core/skills.js';
import MODS from '../../data/mods.json' with {type:'json'};
import { meetsRequires } from '../core/character.js';
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TAGS = {
  Attack:'โจมตี',Spell:'เวท',Melee:'ประชิด',Projectile:'กระสุน',Area:'วงกว้าง',Damage:'ทำดาเมจ',
  DoT:'ดาเมจต่อเนื่อง',Persistent:'พื้นที่คงอยู่',Chain:'เด้งต่อ',Control:'ควบคุม',Debuff:'ดีบัฟ',
  Curse:'คำสาป',Guard:'เกราะ/การ์ด',Buff:'บัฟ',Warcry:'คำราม',Heal:'ฟื้นฟู',Summon:'อัญเชิญ',
  Physical:'กายภาพ',Counter:'สวนกลับ',Line:'แนวตรง',Rain:'ยิงระลอก',Channel:'ร่ายต่อเนื่อง',Cone:'กรวย',Construct:'สิ่งสร้าง',Target:'เป้าหมาย',Cleanse:'ล้างสถานะ',Aura:'ออร่า',Charge:'ชาร์จ',Minion:'ลูกสมุน',Movement:'เคลื่อนที่',Trigger:'ทริกเกอร์',Leech:'ดูดเลือด',
  Fire:'ไฟ',Earth:'ดิน',Cold:'น้ำแข็ง',Lightning:'สายฟ้า',Poison:'พิษ',
};
export const ELEMENTS = {physical:'กายภาพ',fire:'ไฟ',cold:'น้ำแข็ง',lightning:'สายฟ้า',poison:'พิษ',arcane:'อาร์เคน',none:'ไม่มีดาเมจธาตุ'};
export const FILTERS = [['all','ทั้งหมด'],['Melee','ประชิด'],['Projectile','กระสุน'],['Area','วงกว้าง'],['DoT','ต่อเนื่อง'],['Persistent','คงอยู่'],['Control','ควบคุม'],['Guard','ป้องกัน'],['Heal','ฟื้นฟู'],['Summon','อัญเชิญ']];
export function tagsHtml(tags) {
  return `<div class="seeker-tags">${[...tags].map(t=>`<span class="seeker-tag" data-skill-tag="${esc(t)}">${esc(TAGS[t] || t)}</span>`).join('')}</div>`;
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
  if(mod.requiresKinds)rules.push('รูปแบบที่รองรับ: '+mod.requiresKinds.map(k=>({projectile:'กระสุน',chain:'เด้ง',melee_arc:'ฟันวง',melee_line:'ฟันแนว',melee_nova:'หมุนฟัน',nova:'ระเบิดรอบตัว',ground_area:'พื้นที่กระแทก',heal_zone:'พื้นที่ฮีล',dot_zone:'พื้นที่ดาเมจต่อเนื่อง',heal_target:'ฮีลเป้าหมาย',self_barrier:'เกราะ',curse_zone:'คำสาป',summon:'อัญเชิญ',buff:'บัฟ'}[k]||k)).join(' / '));
  if(mod.requiresElement)rules.push('ต้องเป็นธาตุ '+ELEMENTS[mod.requiresElement]+' หรือมีม็อดเปลี่ยนธาตุที่ใช้งานได้');
  if(mod.conflicts)rules.push('ใช้ร่วมกับม็อดนี้ไม่ได้: '+mod.conflicts.map(id=>MODS.mods[id]?.nameTh||id).join(' / '));
  if(mod.requiresPersistent) rules.push('ต้องมีพื้นที่คงอยู่: บึงพิษ / น้ำพุฟื้นฟู หรือใส่ทิ้งไฟบนพื้นก่อน');
  return rules.length?rules:['ไม่จำกัดประเภทสกิล'];
}
export function rulesHtml(mod) {
  return `<div class="seeker-mod-rules"><b>ใช้ร่วมกับสกิล</b>${modRules(mod).map(r=>`<div>${esc(r)}</div>`).join('')}${requirementsHtml(mod)}<small>ตรวจจากแท็กพื้นฐานของสกิล · เงื่อนไขพื้นที่คงอยู่ตรวจม็อดร่วมด้วย</small></div>`;
}
export function fitReason(fit) {
  if(fit.ok)return 'ประเภทตรงกัน';
  if(fit.reason==='delivery')return 'รูปแบบการร่ายไม่รองรับม็อดนี้';
  if(fit.reason==='conflict')return 'มีม็อดที่ใช้ร่วมกันไม่ได้ · ถอดม็อดนั้นก่อน';
  if(fit.reason==='element')return 'ต้องเป็นธาตุน้ำแข็ง หรือใส่เปลี่ยนเป็นน้ำแข็งร่วมกัน';
  if(fit.reason==='needs_persistent')return 'ต้องมีพื้นที่คงอยู่ หรือใส่ทิ้งไฟบนพื้นก่อน';
  const [prefix,raw='']=fit.reason.split(' for ').length>1?['not',fit.reason.slice(8)]:['needs',fit.reason.replace(/^needs /,'')];
  return (prefix==='not'?'ห้ามใช้กับ ':'ขาดประเภท ')+raw.split(/([+/])/).map(x=>x==='+'?' + ':x==='/'?' หรือ ':TAGS[x]||x).join('');
}
/** Separate type fit, activation, ownership and socket capacity. Browsing never mutates. */
export function modStatus(ch,data,index,inst) {
  const slot=ch.slots[index], md=data.mods.mods[inst.id];
  const companionInsts=(slot?.mods||[]).map(u=>ch.mods.find(m=>m.uid===u)).filter(m=>m&&data.mods.mods[m.id]);
  const companions=companionInsts.map(m=>data.mods.mods[m.id]);
  // Higher ranks ask for more stats (modRequires).
  const fit=modFits(data.skills.combat[slot?.skill],md,companions), req=meetsRequires(ch,modRequires(data,md,inst.level||1)), where=modSlotOf(ch,inst.uid);
  const duplicate=!!slot?.mods.some(u=>u!==inst.uid&&ch.mods.find(m=>m.uid===u)?.id===inst.id);
  const full=(slot?.mods.length||0)>=data.mods.maxModsPerSkill;
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
