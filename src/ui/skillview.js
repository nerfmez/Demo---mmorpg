// Focused workspaces: equip skills, manage mods, movement, and material upgrades.
import { art } from './art.js';
import { icon } from './icons.js';
import { meetsRequires } from '../core/character.js';
import { modFits } from '../core/skills.js';
import { skillUpgradeCost, modUpgradeCost, skillUpgradeState, modUpgradeState } from '../core/crafting.js';
import { skillGrowthPreview, modGrowthPreview, upgradeTrack, stateText } from './progressionview.js';
import { esc, FILTERS, tagsHtml, elementHtml, skillMeta, rulesHtml, modRuleChips, modStatus } from './buildmeta.js';

function loadout(ui, modMode=false) {
  const {ch,data}=ui.game, selected=ui.sel.skill??0;
  return `<div class="loadout-bar seeker-loadout">${ch.slots.map((entry,i)=>{
    const s=data.skills.combat[entry.skill];
    return `<button class="loadout-slot ${i===selected?'on':''}" data-act="skill-slot" data-slot="${i}" aria-pressed="${i===selected}"><span class="slot-number">${i+1}</span>${s?art('skill',entry.skill):icon('plus')}<b>${s?.nameTh||'ช่องว่าง'}</b><small>${modMode?entry.mods.length+' / '+data.mods.maxModsPerSkill+' ม็อด':'ช่องต่อสู้'}</small></button>`;
  }).join('')}</div>`;
}
const heading=(title,copy)=>`<div class="seeker-heading"><div><span class="section-kicker">SEEKER / BUILD</span><h3>${title}</h3><p>${copy}</p></div></div>`;
const action=(page,label)=>`<button class="btn" data-act="workspace" data-page="${page}">${label} →</button>`;

export function skillsView(ui, {describeSkill}) {
  const {game:g,sel}=ui,{ch,data}=g, index=sel.skill??0,slot=ch.slots[index],def=data.skills.combat[slot.skill],s=g.skills[index];
  const filter=sel.skillFilter||'all';
  const choices=Object.entries(data.skills.combat).filter(([,d])=>filter==='all'||d.tags.includes(filter)).map(([id,d])=>{
    const learned=!!ch.skills[id],req=meetsRequires(ch,d.requires);
    return `<article class="seeker-library-item ${slot.skill===id?'selected':''}">${art('skill',id)}<div><b>${d.nameTh}</b>${tagsHtml(d.tags)}${elementHtml(d.element)}<small>${learned?'Lv.'+ch.skills[id]:'ยังไม่เรียน'}${req.ok?'':' · ต้อง '+req.missing.join(', ')}</small></div><button class="btn small" data-act="choose-skill" data-slot="${index}" data-id="${id}" ${learned&&req.ok?'':'disabled'}>${slot.skill===id?'ใส่อยู่':'ใส่ช่อง '+(index+1)}</button></article>`;
  }).join('');
  return heading('จัดชุดสกิล','เลือกช่องก่อน แล้วเลือกสกิล · การดูรายละเอียดไม่ใช้วัตถุดิบ')+loadout(ui)+`<div class="seeker-build-grid"><section class="card seeker-focus">
    ${def?`<div class="seeker-hero">${art('skill',slot.skill)}<div><small>ช่อง ${index+1}</small><h3>${def.nameTh}</h3><span>${def.name} · Lv.${ch.skills[slot.skill]}</span></div></div><p>${esc(def.desc)}</p>${skillMeta(def,s)}<div class="seeker-result"><small>ผลสกิลปัจจุบัน รวมม็อดและพาสซีฟ</small><p>${describeSkill(s)}</p></div><div class="seeker-action-row"><button class="btn" data-act="choose-skill" data-slot="${index}" data-id="">ถอดสกิล</button><button class="btn primary" data-act="pick-socket" data-slot="${index}">จัดม็อด · ${slot.mods.length}/${data.mods.maxModsPerSkill}</button></div>`:`<h3>ช่อง ${index+1} ยังว่าง</h3><p>เลือกสกิลจากคลังด้านข้าง</p>`}
    <div class="seeker-links">${action('movement','สกิลเคลื่อนที่')}${action('growth','อัปเลเวลสกิล / ม็อด')}</div></section>
    <section class="seeker-library"><label class="seeker-filter">ประเภท / ธาตุ <select data-workspace-select="skillFilter">${FILTERS.map(([id,n])=>`<option value="${id}" ${id===filter?'selected':''}>${n}</option>`).join('')}</select></label><div class="seeker-library-list">${choices||'<p>ยังไม่มีสกิลในประเภทนี้</p>'}</div><p class="muted">สกิลที่ยังไม่เรียนแสดงไว้เพื่อวางแผน · เรียนด้วยวัตถุดิบที่โต๊ะคราฟต์</p>${action('craft','ไปดูสูตร')}</section></div>`;
}

export function modsWorkspace(ui,{describeSkill}) {
 const {game:g,sel}=ui,{ch,data}=g,index=sel.skill??0,slot=ch.slots[index],def=data.skills.combat[slot.skill],compiled=g.skills[index];
 const shown=ch.mods.map(inst=>({inst,status:modStatus(ch,data,index,inst)})).filter(({status})=>!sel.compatibleOnly||status.fit.ok);
 const chosen=shown.find(({inst})=>inst.uid===sel.modUid)||shown[0];
 const list=shown.map(({inst,status:st})=>`<button class="seeker-mod-tile ${inst.uid===chosen?.inst.uid?'selected':''} ${st.fit.ok?'':'incompatible'}" data-act="inspect-mod" data-uid="${inst.uid}" aria-pressed="${inst.uid===chosen?.inst.uid}">${art('mod',inst.id)}<span class="seeker-mod-info"><b>${data.mods.mods[inst.id].nameTh}</b>${modRuleChips(data.mods.mods[inst.id],true)}<small>Lv.${inst.level} · ${st.own?'ใส่อยู่':st.fit.ok?'ประเภทตรง':'ประเภทไม่ตรง'}</small></span></button>`).join('');
 let detail='<h3>ยังไม่มีม็อด</h3><p>คราฟต์ม็อด หรือปิดตัวกรองเพื่อดูทั้งหมด</p>'+action('craft','ไปดูสูตร');
 if(chosen){
  const {inst,status:st}=chosen,md=data.mods.mods[inst.id];
  const matches=Object.values(data.skills.combat).filter(d=>modFits(d,md).ok).map(d=>d.nameTh);
  detail=`<div class="seeker-hero">${art('mod',inst.id)}<div><h3>${md.nameTh}</h3><span>${md.name} · Lv.${inst.level}</span></div></div><p>${esc(md.desc)}</p>${rulesHtml(md)}<div class="seeker-mod-status ${st.fit.ok?'':'no'}"><b>${esc(st.reason)}</b>${!st.req.ok?`<p>ใส่เก็บได้แต่ไม่ทำงาน · ต้อง ${st.req.missing.join(', ')}</p>`:st.own&&!st.active?'<p>ม็อดไม่ทำงาน: ขาดม็อดพื้นที่คงอยู่ที่ใช้งานได้</p>':''}${st.where>=0&&!st.own?`<p>ใส่อยู่ที่ช่อง ${st.where+1} · การกดใส่จะย้ายมายังช่องนี้</p>`:''}</div>
  <div class="seeker-action-row">${st.own?`<button class="btn" data-act="unsocket" data-uid="${inst.uid}">ถอดม็อด</button>`:`<button class="btn primary" data-act="socket" data-slot="${index}" data-uid="${inst.uid}" ${st.can?'':'disabled'}>${st.req.ok?'ใส่ม็อด':'ใส่ไว้ก่อน · ยังไม่ทำงาน'}</button>`}${action('growth','อัปเลเวล')}</div><details class="seeker-examples"><summary>สกิลพื้นฐานที่รองรับ (${matches.length})</summary><p>${matches.join(' · ')||'ต้องมีม็อดร่วม'}</p></details>`;
 }
 return heading('จัดม็อด','แยกเงื่อนไขประเภทสกิล ค่าสถานะ และจำนวนช่องให้เห็นก่อนใส่')+loadout(ui,true)+`<section class="seeker-target"><b>เป้าหมาย: ${def?.nameTh||'ช่องว่าง'}</b>${def?tagsHtml(compiled?.tags||def.tags):''}<div class="seeker-socket-row">${slot.mods.map(uid=>{const inst=ch.mods.find(m=>m.uid===uid),st=modStatus(ch,data,index,inst);return `<button class="btn ${st.active?'':'no'}" data-act="inspect-mod" data-uid="${uid}">${data.mods.mods[inst.id].nameTh}${st.active?'':' · ไม่ทำงาน'}</button>`;}).join('')||'<small>ยังไม่มีม็อด</small>'}</div></section>
 <div class="seeker-build-grid seeker-mod-grid"><section><button class="btn" data-act="mod-filter" aria-pressed="${!!sel.compatibleOnly}">${sel.compatibleOnly?'✓ เฉพาะประเภทที่เข้ากัน':'แสดงทั้งหมด · รวมที่ใช้ไม่ได้'}</button><div class="seeker-mod-list">${list}</div></section><section class="card seeker-focus">${detail}</section></div>${compiled?`<div class="seeker-result"><small>ผลสกิลที่ใช้อยู่จริง</small><p>${describeSkill(compiled)}</p></div>`:''}`;
}

export function movementWorkspace(ui) {
 const {ch,data}=ui.game;
 return heading('สกิลเคลื่อนที่','หนึ่งช่องแยก · ไม่แย่งช่องต่อสู้ · ม็อดต่อสู้ใช้กับช่องนี้ไม่ได้')+`<div class="seeker-movement-grid">${Object.entries(data.skills.movement).map(([id,d])=>{
  const learned=ch.movementSkills.includes(id), req=meetsRequires(ch,d.requires);
  return `<section class="card"><div class="seeker-hero">${art('skill',id)}<div><h3>${d.nameTh}</h3><small>${d.name}</small></div></div><p>${d.desc}</p>${skillMeta(d)}<p>ระยะ ${d.distance} ม. · ${d.charges} ชาร์จพื้นฐาน · คืนชาร์จ ${d.recharge} วิ</p><p>หลบดาเมจระหว่างใช้: ${d.invulnerable?'ได้':'ไม่ได้'}</p><button class="btn ${ch.movement===id?'on':'primary'}" data-act="movement" data-id="${id}" ${learned&&req.ok?'':'disabled'}>${ch.movement===id?'ใช้อยู่':learned?'เลือกใช้':'ยังไม่เรียน'}</button></section>`;
 }).join('')}</div><div class="seeker-result">สกิลที่ใช้อยู่: ${ui.game.move.def.nameTh} · ชาร์จสูงสุด ${ui.game.move.def.charges+ui.game.derived.extraMovementCharges} · คืนชาร์จจริง ${ui.game.move.recharge.toFixed(1)} วิ</div>`;
}

export function growthWorkspace(ui,{costHtml,describeSkill}) {
 const {game:g,sel}=ui,{ch,data}=g,kind=sel.growthKind||'skill',isSkill=kind==='skill';
 const entries=isSkill?Object.entries(ch.skills).filter(([id])=>data.skills.combat[id]).map(([id,level])=>({id,level,def:data.skills.combat[id],state:skillUpgradeState(ch,data,id)})):ch.mods.map(inst=>({...inst,def:data.mods.mods[inst.id],state:modUpgradeState(ch,data,inst)}));
 return heading('ฝึกสกิล / พัฒนาม็อด','ใช้วัตถุดิบจากโลกและ Gold · สกิลเพิ่มพลังทีละขั้น ม็อดเปลี่ยนวิธีเล่น')+`<div class="seeker-action-row"><button class="btn ${isSkill?'on':''}" data-act="growth-filter" data-id="skill">สกิล</button><button class="btn ${!isSkill?'on':''}" data-act="growth-filter" data-id="mod">ม็อด</button><span>${g.nearby().workbench?'อยู่ใกล้โต๊ะคราฟต์':'กลับโต๊ะคราฟต์เพื่ออัปเกรด'}</span></div><div class="seeker-growth-grid">${entries.map(e=>{
 const levels=isSkill?data.progression.skillUpgrade.steps.map(s=>s.requiresLevel):data.progression.modUpgrade.requiresLevel;
 return `<section class="card"><div class="seeker-hero">${art(isSkill?'skill':'mod',e.id)}<div><h3>${e.def.nameTh}</h3><span>Lv.${e.level}${e.state.cost?' → Lv.'+(e.level+1):' · สูงสุด'}</span></div></div>${isSkill?tagsHtml(e.def.tags):rulesHtml(e.def)}${upgradeTrack(levels,e.level-1,'Lv.',2)}${e.state.cost?`${isSkill?skillGrowthPreview(ch,data,e.id,describeSkill):modGrowthPreview(e.def,e.level)}<p class="${e.state.ok?'ok':'no'}">${stateText(e.state)}</p><div class="cost">${costHtml(ch,data,e.state.cost)}</div><small>สำเร็จแน่นอน · ใช้วัตถุดิบ ไม่ใช้แต้มต้นไม้</small><button class="btn primary" data-act="${isSkill?'skill-up':'mod-up'}" ${isSkill?`data-skill="${e.id}"`:`data-uid="${e.uid}"`} ${g.nearby().workbench&&e.state.ok?'':'disabled'}>อัปเป็น Lv.${e.level+1}</button>`:''}</section>`;
 }).join('')||'<p>ยังไม่มีรายการในหมวดนี้</p>'}</div>`;
}
