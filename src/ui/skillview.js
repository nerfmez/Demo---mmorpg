// Focused workspaces: equip skills, manage mods, movement, and material upgrades.
import { art } from './art.js';
import { icon } from './icons.js';
import { meetsRequires } from '../core/character.js';
import { modFits, modRequires, movementRank, skillRequires, levelInUse } from '../core/skills.js';
import { modUpgradeCost, skillUpgradeState, modUpgradeState, movementUpgradeState } from '../core/crafting.js';
import { skillGrowthPreview, modGrowthPreview, upgradeTrack, stateText } from './progressionview.js';
import { esc, FILTERS, tagsHtml, skillMeta, rulesHtml, modStatus, slotCapacity } from './buildmeta.js';
import { barsWorkspace } from './skill-bars.js';

function loadout(ui, modMode=false) {
  const {ch,data}=ui.game, selected=ui.sel.skill??0;
  return `<div class="loadout-bar seeker-loadout">${ch.slots.map((entry,i)=>{
    const s=data.skills.combat[entry.skill];
    return `<button class="loadout-slot ${i===selected?'on':''}" data-act="skill-slot" data-slot="${i}" aria-pressed="${i===selected}"><span class="slot-number">${i+1}</span>${s?art('skill',entry.skill):icon('plus')}<b>${s?.nameTh||'ช่องว่าง'}</b><small>${modMode?entry.mods.length+' / '+slotCapacity(ch,data,i)+' ม็อด':'ช่องต่อสู้'}</small></button>`;
  }).join('')}</div>`;
}
const heading=(title,copy)=>`<div class="seeker-heading"><div><span class="section-kicker">SEEKER / BUILD</span><h3>${title}</h3><p>${copy}</p></div></div>`;
const action=(page,label)=>`<button class="btn" data-act="workspace" data-page="${page}">${label} →</button>`;

export function skillsView(ui, {describeSkill}) {
  const {game:g,sel}=ui,{ch,data}=g, index=sel.skill??0,slot=ch.slots[index],def=data.skills.combat[slot.skill],s=g.skills[index];
  const filter=sel.skillFilter||'all';
  const choices=Object.entries(data.skills.combat).filter(([,d])=>filter==='all'||d.tags.includes(filter)).map(([id,d])=>{
    const learned=!!ch.skills[id],req=meetsRequires(ch,skillRequires(data,d,1),data);
    return `<article class="seeker-library-item ${slot.skill===id?'selected':''}">${art('skill',id)}<div><b>${d.nameTh}</b>${tagsHtml(d.tags)}<small>${learned?'Lv.'+ch.skills[id]:'ยังไม่เรียน'}${req.ok?'':' · ต้อง '+req.missing.join(', ')}</small></div><button class="btn small" data-act="choose-skill" data-slot="${index}" data-id="${id}" ${learned&&req.ok?'':'disabled'}>${slot.skill===id?'ใส่อยู่':'ใส่ช่อง '+(index+1)}</button></article>`;
  }).join('');
  return heading('จัดชุดสกิล','เลือกช่องก่อน แล้วเลือกสกิล · การดูรายละเอียดไม่ใช้วัตถุดิบ')+loadout(ui)+`<div class="seeker-build-grid"><section class="card seeker-focus">
    ${def?`<div class="seeker-hero">${art('skill',slot.skill)}<div><small>ช่อง ${index+1}</small><h3>${def.nameTh}</h3><span>${def.name} · Lv.${ch.skills[slot.skill]}</span></div></div><p>${esc(def.desc)}</p>${skillMeta(def,s)}<div class="seeker-result"><small>ผลสกิลปัจจุบัน รวมม็อดและพาสซีฟ</small><p>${describeSkill(s)}</p></div><div class="seeker-action-row"><button class="btn" data-act="choose-skill" data-slot="${index}" data-id="">ถอดสกิล</button><button class="btn primary" data-act="pick-socket" data-slot="${index}">จัดม็อด · ${slot.mods.length}/${slotCapacity(ch,data,index)}</button></div>`:`<h3>ช่อง ${index+1} ยังว่าง</h3><p>เลือกสกิลจากคลังด้านข้าง</p>`}
    <div class="seeker-links">${action('movement','สกิลเคลื่อนที่')}${action('growth','อัปเลเวลสกิล / ม็อด')}</div></section>
    <section class="seeker-library"><label class="seeker-filter">ประเภทสกิล <select data-workspace-select="skillFilter">${FILTERS.map(([id,n])=>`<option value="${id}" ${id===filter?'selected':''}>${n}</option>`).join('')}</select></label><div class="seeker-library-list">${choices||'<p>ยังไม่มีสกิลในประเภทนี้</p>'}</div><p class="muted">สกิลที่ยังไม่เรียนแสดงไว้เพื่อวางแผน · เรียนด้วยวัตถุดิบที่โต๊ะคราฟต์</p>${action('craft','ไปดูสูตร')}</section></div>`;
}

export function modsWorkspace(ui,{describeSkill}) {
 const {game:g,sel}=ui,{ch,data}=g,index=sel.skill??0,slot=ch.slots[index],def=data.skills.combat[slot.skill],compiled=g.skills[index];
 const shown=ch.mods.map(inst=>({inst,status:modStatus(ch,data,index,inst)})).filter(({status})=>!sel.compatibleOnly||status.fit.ok);
 const chosen=shown.find(({inst})=>inst.uid===sel.modUid)||shown[0];
 const list=shown.map(({inst,status:st})=>`<button class="seeker-mod-tile ${inst.uid===chosen?.inst.uid?'selected':''} ${st.fit.ok?'':'incompatible'}" data-act="inspect-mod" data-uid="${inst.uid}" aria-pressed="${inst.uid===chosen?.inst.uid}">${art('mod',inst.id)}<span><b>${data.mods.mods[inst.id].nameTh}</b><small>Lv.${inst.level} · ${st.own?'ใส่อยู่':st.fit.ok?'ประเภทตรง':'ประเภทไม่ตรง'}</small></span></button>`).join('');
 let detail='<h3>ยังไม่มีม็อด</h3><p>คราฟต์ม็อด หรือปิดตัวกรองเพื่อดูทั้งหมด</p>'+action('craft','ไปดูสูตร');
 if(chosen){
  const {inst,status:st}=chosen,md=data.mods.mods[inst.id];
  const matches=Object.values(data.skills.combat).filter(d=>modFits(d,md).ok).map(d=>d.nameTh);
  detail=`<div class="seeker-hero">${art('mod',inst.id)}<div><h3>${md.nameTh}</h3><span>${md.name} · Lv.${inst.level}</span></div></div><p>${esc(md.desc)}</p>${rulesHtml(md)}<div class="seeker-mod-status ${st.fit.ok?'':'no'}"><b>${esc(st.reason)}</b>${!st.req.ok?`<p>ใส่เก็บได้แต่ไม่ทำงาน · ต้อง ${st.req.missing.join(', ')}</p>`:st.own&&!st.active?'<p>ม็อดไม่ทำงาน: ขาดม็อดพื้นที่คงอยู่ที่ใช้งานได้</p>':''}${st.where>=0&&!st.own?`<p>ใส่อยู่ที่ช่อง ${st.where+1} · การกดใส่จะย้ายมายังช่องนี้</p>`:''}</div>
  <div class="seeker-action-row">${st.own?`<button class="btn" data-act="unsocket" data-uid="${inst.uid}">ถอดม็อด</button>`:`<button class="btn primary" data-act="socket" data-slot="${index}" data-uid="${inst.uid}" ${st.can?'':'disabled'}>${st.req.ok?'ใส่ม็อด':'ใส่ไว้ก่อน · ยังไม่ทำงาน'}</button>`}${action('growth','อัปเลเวล')}</div><details class="seeker-examples"><summary>สกิลพื้นฐานที่รองรับ (${matches.length})</summary><p>${matches.join(' · ')||'ต้องมีม็อดร่วม'}</p></details>`;
 }
 return heading('จัดม็อด','แยกเงื่อนไขประเภทสกิล ค่าสถานะ และจำนวนช่องให้เห็นก่อนใส่')+loadout(ui,true)+`<section class="seeker-target"><b>เป้าหมาย: ${def?.nameTh||'ช่องว่าง'}</b>${def?tagsHtml(def.tags):''}<div class="seeker-socket-row">${slot.mods.map(uid=>{const inst=ch.mods.find(m=>m.uid===uid),st=modStatus(ch,data,index,inst);return `<button class="btn ${st.active?'':'no'}" data-act="inspect-mod" data-uid="${uid}">${data.mods.mods[inst.id].nameTh}${st.active?'':' · ไม่ทำงาน'}</button>`;}).join('')||'<small>ยังไม่มีม็อด</small>'}</div></section>
 <div class="seeker-build-grid seeker-mod-grid"><section><button class="btn" data-act="mod-filter" aria-pressed="${!!sel.compatibleOnly}">${sel.compatibleOnly?'✓ เฉพาะประเภทที่เข้ากัน':'แสดงทั้งหมด · รวมที่ใช้ไม่ได้'}</button><div class="seeker-mod-list">${list}</div></section><section class="card seeker-focus">${detail}</section></div>${compiled?`<div class="seeker-result"><small>ผลสกิลที่ใช้อยู่จริง</small><p>${describeSkill(compiled)}</p></div>`:''}`;
}

export function movementWorkspace(ui) {
 const {ch,data}=ui.game;
 return heading('สกิลเคลื่อนที่','หนึ่งช่องแยก · ไม่แย่งช่องต่อสู้ · ม็อดต่อสู้ใช้กับช่องนี้ไม่ได้')+`<div class="seeker-movement-grid">${Object.entries(data.skills.movement).map(([id,d])=>{
  const learned=ch.movementSkills.includes(id), req=meetsRequires(ch,d.requires,data);
  return `<section class="card"><div class="seeker-hero">${art('skill',id)}<div><h3>${d.nameTh}</h3><small>${d.name}${learned?' · Lv.'+movementRank(ch,id):''}</small></div></div><p>${d.desc}</p>${skillMeta(d)}<p>ระยะ ${d.distance} ม. · ${d.charges} ชาร์จพื้นฐาน · คืนชาร์จ ${d.recharge} วิ</p><p>หลบดาเมจระหว่างใช้: ${d.invulnerable?'ได้':'ไม่ได้'}</p><button class="btn ${ch.movement===id?'on':'primary'}" data-act="movement" data-id="${id}" ${learned&&req.ok?'':'disabled'}>${ch.movement===id?'ใช้อยู่':learned?'เลือกใช้':'ยังไม่เรียน'}</button></section>`;
 }).join('')}</div><div class="seeker-result">สกิลที่ใช้อยู่: ${ui.game.move.def.nameTh} · ชาร์จสูงสุด ${ui.game.move.charges} · คืนชาร์จจริง ${ui.game.move.recharge.toFixed(1)} วิ</div>`;
}

export function growthWorkspace(ui,{costHtml,describeSkill}) {
 // List of skills or mods on the left; the picked one's level track, preview, cost and button on the right.
 const {game:g,sel}=ui,{ch,data}=g,kind=sel.growthKind||'skill',isSkill=kind==='skill',isMove=kind==='move',atService=g.nearby().skillUpgrade;
 const mu=data.progression.movementUpgrade;
 if(kind==='bars') return barsWorkspace(ui,{costHtml,frame:(list,note,detail)=>`<div class="pg pg-growth"><section class="pg-col"><div class="pg-seg2"><button class="btn" data-act="growth-filter" data-id="skill">สกิล</button><button class="btn" data-act="growth-filter" data-id="mod">ม็อด</button></div>
  ${moveTab(kind)}${barsTab(kind)}${note}<div class="pg-list">${list}</div></section><section class="pg-col seeker-growth-grid">${detail}</section></div>`});
 if(isMove) return growthFrame(ui,kind,atService,ch.movementSkills.map(id=>({id,level:movementRank(ch,id),def:data.skills.movement[id],state:movementUpgradeState(ch,data,id)})),e=>moveDetail(ch,data,e,atService,costHtml,mu));
 const entries=isSkill?Object.entries(ch.skills).filter(([id])=>data.skills.combat[id]).map(([id,level])=>({id,level,def:data.skills.combat[id],state:skillUpgradeState(ch,data,id)})):ch.mods.map(inst=>({...inst,def:data.mods.mods[inst.id],state:modUpgradeState(ch,data,inst)}));
 const key=e=>String(isSkill?e.id:e.uid);
 const cur=entries.find(e=>key(e)===String(sel.growthPick))||entries[0];
 const sub=e=>isSkill?`Lv.${e.level} / ${e.state.cap??e.level}${e.state.reason==='cap'?' · เต็มตามเลเวลตัวละคร':e.state.reason==='max'?' · สูงสุด':` · EXP ${e.state.exp}/${e.state.need}`}`:`Lv.${e.level}${e.state.cost?' → Lv.'+(e.level+1):' · สูงสุด'}`;
 const list=entries.map(e=>`<button class="pg-row ${e===cur?'on':''}" data-act="growth-pick" data-id="${key(e)}" aria-pressed="${e===cur}"><span class="pg-ic">${art(isSkill?'skill':'mod',e.id)}</span><span class="pg-tx"><b>${e.def.nameTh}</b><small>${sub(e)}</small></span>${atService&&e.state.ok?'<i class="pg-dot" aria-label="อัปได้"></i>':''}</button>`).join('');
 const detail=e=>{
  if(isSkill) return skillLevelDetail(ui,e,atService,describeSkill);
  const ready=atService&&e.state.ok;
  const status=e.state.ok&&!atService?'ต้องอยู่ใกล้จุดคราฟต์หรือครูฝึก':stateText(e.state);
  const reqText=r=>Object.entries(r).map(([k,v])=>k+' '+v).join(', ')||'ไม่มีเงื่อนไข';
  const levels=data.progression.modUpgrade.cost.map((_,i)=>reqText(modRequires(data,e.def,i+2)));
  return `<section class="card"><div class="seeker-hero">${art('mod',e.id)}<div><h3>${e.def.nameTh}</h3><span>Lv.${e.level}${e.state.cost?' → Lv.'+(e.level+1):' · สูงสุด'}</span></div></div>${rulesHtml(e.def)}${upgradeTrack(levels,e.level-1,'Lv.',2)}${e.state.cost?`${modGrowthPreview(e.def,e.level)}<div class="cost">${costHtml(ch,data,e.state.cost)}</div><div class="pg-foot"><span><p class="${ready?'ok':'no'}" data-growth-status>${status}</p><small>สำเร็จแน่นอน · ใช้ผลึกทักษะและทอง ไม่ใช้แต้มต้นไม้</small></span><button class="btn primary" data-act="mod-up" data-uid="${e.uid}" ${ready?'':'disabled'}>อัปเป็น Lv.${e.level+1}</button></div>`:''}</section>`;
 };
 return `<div class="pg pg-growth"><section class="pg-col"><div class="pg-seg2"><button class="btn ${isSkill?'on':''}" data-act="growth-filter" data-id="skill">สกิล</button><button class="btn ${!isSkill?'on':''}" data-act="growth-filter" data-id="mod">ม็อด</button></div>
  ${moveTab(kind)}${barsTab(kind)}<small class="muted">${atService?'อยู่ใกล้จุดคราฟต์หรือครูฝึก · อัปเกรดได้':'กลับจุดคราฟต์หรือครูฝึกเพื่ออัปเกรด'}</small>
  <div class="pg-list">${list||'<p class="muted">ยังไม่มีรายการในหมวดนี้</p>'}</div></section>
  <section class="pg-col seeker-growth-grid">${cur?detail(cur):''}</section></div>`;
}

// A skill's level (core/crafting.js feedSkill): up to the character's level; crystals fed give skill EXP,
// gold per EXP; the skill's stat gates each band of levels. One row per crystal size.
function skillLevelDetail(ui,e,atService,describeSkill){
 const {ch,data}=ui.game,inUse=levelInUse(ui.game.derived.stats,e.level,L=>skillRequires(data,e.def,L)),st=e.state,su=data.progression.skillUpgrade,open=!['cap','max','not_learned'].includes(st.reason)&&st.room>0;
 const status=st.reason==='max'?'เลเวลสูงสุดของสกิลแล้ว':st.reason==='cap'?`เท่าเลเวลตัวละครแล้ว (Lv.${st.cap}) · เลเวลตัวละครขึ้นแล้วอัปต่อได้`:!st.gate.ok&&st.exp>=st.need?`EXP ครบแล้ว · ต้องมี ${st.gate.stat} ${st.gate.need} เพื่อไป Lv.${st.level+1}`:!atService?'ป้อนผลึกได้ที่จุดคราฟต์หรือครูฝึก':'ป้อนผลึกเพื่อรับ EXP สกิล';
 const rows=Object.entries(su.crystals).map(([id,per])=>{
  const have=ch.materials[id]||0,useful=open?Math.min(have,Math.ceil(st.room/per),Math.floor(ch.gold/(per*su.goldPerExp))):0,can=atService&&useful>0;
  return `<div class="sl-crystal"><span class="pg-ic">${art('material',id)}</span><span class="pg-tx"><b>${data.items.materials[id].nameTh}</b><small>มี ${have} · ${per} EXP ต่อเม็ด · ${(per*su.goldPerExp).toLocaleString()} G ต่อเม็ด</small></span><span class="sl-feed"><button class="btn" data-act="skill-feed" data-skill="${e.id}" data-crystal="${id}" data-n="1" ${can?'':'disabled'}>ป้อน 1</button>${useful>1?`<button class="btn primary" data-act="skill-feed" data-skill="${e.id}" data-crystal="${id}" data-n="${useful}" ${can?'':'disabled'}>ป้อน ${useful}</button>`:''}</span></div>`;
 }).join('');
 const preview=st.reason==='cap'||st.reason==='max'?'':skillGrowthPreview(ch,data,e.id,describeSkill);
 return `<section class="card"><div class="seeker-hero">${art('skill',e.id)}<div><h3>${e.def.nameTh}</h3><span>Lv.${e.level} / ${st.cap} · สกิลขึ้นได้ไม่เกินเลเวลตัวละคร</span>${inUse<e.level?`<span class="no" data-skill-in-use>ตอนนี้ทำงานที่ Lv.${inUse||0} · ต้องมี ${Object.entries(skillRequires(data,e.def,e.level)).map(([k,v])=>`${k} ${v}`).join(', ')} จึงใช้ Lv.${e.level} เต็ม</span>`:''}</div></div>${tagsHtml(e.def.tags)}
  <div class="sl-exp"><span style="width:${Math.min(100,Math.round(st.exp/st.need*100))}%"></span></div><small class="muted">EXP สกิล ${st.exp} / ${st.need} → Lv.${st.level+1} · ต้องมี ${Object.entries(st.gate.requires).map(([k,v])=>{const have=ui.game.derived.stats?.[k]??ch.stats[k];return `${k} ${v} <span class="${have>=v?'ok':'no'}">(มี ${have})</span>`;}).join(' · ')}</small>
  ${preview}<div class="sl-crystals">${rows}</div><div class="pg-foot"><span><p class="${(open||st.pending)&&atService?'ok':'no'}" data-growth-status>${st.pending?'EXP ที่สะสมไว้พอขึ้นเลเวลแล้ว':status}</p><small>สำเร็จแน่นอน · ป้อนเฉพาะที่ใช้ได้ EXP ที่เกินเก็บไว้ · ไม่ใช้แต้มต้นไม้</small></span>${st.pending?`<button class="btn primary" data-act="skill-feed" data-skill="${e.id}" data-crystal="skill_crystal" data-n="0" ${atService?'':'disabled'}>ขึ้นเป็น Lv.${st.level+1}</button>`:''}</div></section>`;
}

// Movement skills rank up with their main stat (data.progression.movementUpgrade): the same list-and-detail page.
const moveTab=kind=>`<button class="btn ${kind==='move'?'on':''}" data-act="growth-filter" data-id="move" aria-pressed="${kind==='move'}">สกิลเคลื่อนที่</button>`;
// Skill bars (core/skill-growth.js, ui/skill-bars.js): points from use, shaped bar by bar.
const barsTab=kind=>`<button class="btn ${kind==='bars'?'on':''}" data-act="growth-filter" data-id="bars" aria-pressed="${kind==='bars'}">หลอดสกิล</button>`;
function growthFrame(ui,kind,atService,entries,detail){
 const cur=entries.find(e=>e.id===String(ui.sel.growthPick))||entries[0];
 const list=entries.map(e=>`<button class="pg-row ${e===cur?'on':''}" data-act="growth-pick" data-id="${e.id}" aria-pressed="${e===cur}"><span class="pg-ic">${art('skill',e.id)}</span><span class="pg-tx"><b>${e.def.nameTh}</b><small>Lv.${e.level}${e.state.cost?' → Lv.'+(e.level+1):' · สูงสุด'}</small></span>${atService&&e.state.ok?'<i class="pg-dot" aria-label="อัปได้"></i>':''}</button>`).join('');
 return `<div class="pg pg-growth"><section class="pg-col"><div class="pg-seg2"><button class="btn" data-act="growth-filter" data-id="skill">สกิล</button><button class="btn" data-act="growth-filter" data-id="mod">ม็อด</button></div>
  ${moveTab(kind)}${barsTab(kind)}<small class="muted">${atService?'อยู่ใกล้จุดคราฟต์หรือครูฝึก · อัปเกรดได้':'กลับจุดคราฟต์หรือครูฝึกเพื่ออัปเกรด'}</small>
  <div class="pg-list">${list||'<p class="muted">ยังไม่มีสกิลเคลื่อนที่</p>'}</div></section>
  <section class="pg-col seeker-growth-grid">${cur?detail(cur):''}</section></div>`;
}
function moveDetail(ch,data,e,atService,costHtml,mu){
 const ready=atService&&e.state.ok, status=e.state.ok&&!atService?'ต้องอยู่ใกล้จุดคราฟต์หรือครูฝึก':stateText(e.state);
 const at=l=>({dist:e.def.distance*(1+mu.distancePerLevel*(l-1)),rech:e.def.recharge*(1-mu.rechargePerLevel*(l-1))});
 const now=at(e.level),next=at(e.level+1),levels=mu.steps.map(s=>e.def.upgradeStat+' '+s.requiresStat);
 return `<section class="card"><div class="seeker-hero">${art('skill',e.id)}<div><h3>${e.def.nameTh}</h3><span>Lv.${e.level}${e.state.cost?' → Lv.'+(e.level+1):' · สูงสุด'}</span></div></div>${upgradeTrack(levels,e.level-1,'Lv.',2)}
  <div class="growth-preview"><div><small>ตอนนี้</small><p>ระยะ ${now.dist.toFixed(1)} ม. · คืนชาร์จ ${now.rech.toFixed(1)} วิ</p></div>${e.state.cost?`<span>→</span><div><small>หลังอัป</small><p>ระยะ ${next.dist.toFixed(1)} ม. · คืนชาร์จ ${next.rech.toFixed(1)} วิ</p></div>`:''}</div>
  ${e.state.cost?`<div class="cost">${costHtml(ch,data,e.state.cost)}</div><div class="pg-foot"><span><p class="${ready?'ok':'no'}" data-growth-status>${status}</p><small>สำเร็จแน่นอน · ใช้ผลึกทักษะและทอง · ต้องมี AGI ตามขั้น</small></span><button class="btn primary" data-act="move-up" data-id="${e.id}" ${ready?'':'disabled'}>อัปเป็น Lv.${e.level+1}</button></div>`:''}</section>`;
}
