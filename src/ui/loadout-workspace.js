import {art} from './art.js';
import {wearRequirements as wearRequirementsHtml} from './progressionview.js';
import {equip, unequip, gearStats, gearRequirements, gearEquipState, equipmentNotice, meetsRequires, weaponImplicit, handsOf, wornSlot, arrowInUse, arrowTotal, chooseArrows} from '../core/character.js';
import {powerOf, powerDelta} from '../core/power.js';
import {sellGear, salvageGear, salvageMany, toggleGearLock, gearSellValue, salvageReturn, gearDisposalBlocker} from '../core/crafting.js';
import {equipmentItemLevel} from '../core/item-metadata.js';
import {equipSkill, socketMod, unsocketMod, setMovement, computeSkill, modRequires} from '../core/skills.js';
import {modStatus, modRules, TAGS} from './buildmeta.js';
import {modCoin as coin} from './mod-coins.js';
import {equipmentAvatar} from './equipment-avatar.js';
import './loadout-workspace.css';

// Owns presentation and selection only. Character state belongs to the existing game.
export function createLoadoutWorkspace(ui, {getAvatarContext, inventoryDetails} = {}) {
const g=ui.game, {ch,data}=g;
let screen='equipment', category='skill', bagCategory='gear', selected=null, materialId=null;
let skillId=null, modUid=null, slot=0, filter='all', page=0, pending=null, notice='', avatar='', avatarKey='';
let motionToken=0, motionAnimations=[], lastTrigger=null, avatarTimer=null, renderedModel='', renderedNotice='';
const root=document.createElement('div');root.id='atelier';root.hidden=true;root.tabIndex=-1;
root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','อุปกรณ์และชุดสกิล');ui.overlay.append(root);
const $=s=>root.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,extra='',cls='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const num=v=>Math.round(v*10)/10;
const shortLandscape=matchMedia('(max-height:480px)');
const bagPageSize=()=>shortLandscape.matches?24:32;
const pageSize=()=>screen==='equipment'?bagPageSize():category==='mod'?15:12;
const gradeStyle=grade=>data.items.grades.order.includes(grade)?`data-grade="${grade}" style="--grade-color:${data.items.grades.colors[grade]}"`:'';
const modName=(inst,tag='b')=>`<${tag} class="mod-name" ${gradeStyle(inst?.grade)}>${data.mods.mods[inst.id].nameTh}</${tag}>`;
const itemLevel=it=>`<span class="item-level" data-item-level="${equipmentItemLevel(data,it)}" title="${gearRequirements(it,data).level!==undefined?'เลเวลตัวละครที่ต้องการ':'เลเวลอุปกรณ์ · สวมใส่ตามสเตตัส'}">Lv. ${equipmentItemLevel(data,it)}</span>`;
const HAND_REASON={level:'เลเวลตัวละครยังไม่ถึง',two_hand:'ถืออาวุธสองมืออยู่ · มือซ้ายว่างไม่ได้',needs_light:'มือซ้ายถืออาวุธได้เมื่อมือขวาเป็นอาวุธเบา',slot:'ช่องนี้ใส่ของชิ้นนี้ไม่ได้',requires_pair:'สเตตัสไม่พอสำหรับถือสองมือ (รีเควสรวมสองชิ้น)',requires:'สเตตัสไม่ถึง',weapon:'มือขวาต้องถืออาวุธเสมอ',equipped:'สวมใส่อยู่',locked:'ล็อกอยู่'};
const weaponNames=d=>d.requiresWeapon.map(w=>data.items.weaponTypes[w]?.nameTh||w).join(' / ');
const statName={attack:'โจมตี',magic:'พลังเวท',defense:'ป้องกัน',maxHp:'HP',moveSpeedPct:'เร็ว %',critChancePct:'คริ %',spellDamagePct:'เวท %',meleeDamagePct:'ประชิด %',projectileDamagePct:'กระสุน %',materialFindPct:'วัตถุดิบ %',gearFindPct:'ดรอปอุปกรณ์ %',goldFindPct:'ทอง %'};
// The icon release owns all painted assets and the central art() resolver.
function picture(kind,id){return `<span class="object-art">${art(kind,id)}</span>`;}
function emptyShelf(message){return `<section class="selection-shelf empty-selection"><h2>${message}</h2><span>เลือกวัตถุจากคลัง</span></section>`;}
function normalizeSelection(){
 slot=Math.max(0,Math.min(ch.slots.length-1,slot));
 const gear=ch.gear.filter(i=>filter==='all'||data.items.gearBases[i.base].slot===filter);
 if(!gear.some(i=>i.uid===selected))selected=gear[0]?.uid??null;
 if(screen==='equipment'&&bagCategory==='gear')ui.sel.item=selected===null?null:String(selected);
 const materials=Object.entries(ch.materials).filter(([,n])=>n>0);
 if(!materials.some(([id])=>id===materialId))materialId=materials[0]?.[0]??null;
 if(!ch.mods.some(m=>m.uid===modUid))modUid=ch.mods[0]?.uid??null;
 const definitions=category==='movement'?data.skills.movement:data.skills.combat;
 if(!definitions[skillId])skillId=(category==='movement'?ch.movement:ch.slots[slot]?.skill)||Object.keys(definitions)[0];
 const count=screen==='equipment'?(bagCategory==='material'?materials.length:gear.length):category==='mod'?ch.mods.length:Object.keys(definitions).length;
 const size=pageSize();
 page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(count/size)-1)));
}
const tags=d=>`<div class="tags">${(d.tags||[]).slice(0,3).map(t=>`<span>${TAGS[t]||t}</span>`).join('')}</div>`;
const header=(en,title,right='')=>`<header class="window-head"><div><small>${en}</small><h1>${title}</h1></div>${right}</header>`;
const stats=it=>({...gearStats(it,data),...weaponImplicit(it,data)});
function gearShelf(){
  if(bagCategory==='material'){if(!materialId)return emptyShelf('ยังไม่มีวัตถุดิบ');const d=data.items.materials[materialId]; return `<section class="selection-shelf"><div class="selected-summary">${picture('material',materialId)}<div><small>วัตถุดิบ · มี ${ch.materials[materialId]} ชิ้น</small><h2>${d.nameTh}</h2><span class="compact-meta">${d.name}</span></div></div><div class="shelf-actions"><span>${esc(d.useTh || 'เลือกดูสูตรที่ใช้วัตถุดิบนี้')}</span>${btn('ดูการใช้งาน','details','','secondary')}</div></section>`;}
  const it=ch.gear.find(i=>i.uid===selected);if(!it)return emptyShelf('ยังไม่มีอุปกรณ์');
  const d=data.items.gearBases[it.base],at=wornSlot(ch,data,it),worn=!!at,light=handsOf(data,it)==='light';
  const target=worn?at:d.slot,old=ch.gear.find(i=>i.uid===ch.equipped[target]),a=stats(it),b=old&&!worn?stats(old):{},req=gearEquipState(ch,data,it,target);
  const delta=slot=>powerDelta(ch,data,c=>equip(c,data,it.uid,slot));
  const deltaHtml=r=>r.ok&&r.diff?`<em class="power-delta ${r.diff>0?'good':'bad'}">ค่าพลัง ${r.diff>0?'+':''}${r.diff.toLocaleString()}</em>`:'';
  const wear=worn?btn(at==='weapon'?(req.ok?'สวมใส่อยู่':'สถานะไม่ได้ใช้'):'ถอดอุปกรณ์','equip',at==='weapon'?'disabled':'','primary')
   :light?`<span class="hand-choice">${btn('มือขวา →','equip',`data-slot="weapon" ${req.ok?'':'disabled'}`,'primary')}${btn('มือซ้าย →','equip',`data-slot="offhand" ${gearEquipState(ch,data,it,'offhand').ok?'':'disabled'}`,'primary')}</span>`
   :btn('สวมใส่ →','equip',req.ok?'':'disabled','primary');
  const preview=worn?'':light?`${deltaHtml(delta('weapon'))} ${delta('offhand').ok?'· ซ้าย '+deltaHtml(delta('offhand')):''}`:deltaHtml(delta(d.slot));
  const block=gearDisposalBlocker(ch,data,it),town=g.nearby().inTown;
  const disposal=`${btn(it.locked?'🔒 ปลดล็อก':'🔓 ล็อก','lock','','secondary')}${btn('ขาย '+gearSellValue(data,it)+' G','sell-gear',block||!town?'disabled':'','secondary')}${btn('ย่อย','salvage-gear',block||!town?'disabled':'','secondary')}`;
  return `<section class="selection-shelf gear-shelf"><div class="selected-summary">${picture('gear',it.base)}<div><small>${data.items.slotNames[d.slot]}${light?' · ถือได้สองมือ':handsOf(data,it)==='two'?' · สองมือ':handsOf(data,it)==='heavy'?' · มือเดียว (หนัก)':''} · เกรด ${it.grade}${it.upgrade?' · +'+it.upgrade:''} · ${itemLevel(it)}</small><h2>${d.nameTh}</h2><div class="comparison">${Object.entries(a).slice(0,3).map(([k,v])=>`<span>${statName[k]||k} <b>${num(v)}</b> ${old&&!worn&&v!==(b[k]||0)?`<em class="${v>(b[k]||0)?'good':'bad'}">${v>(b[k]||0)?'↑':'↓'}${num(Math.abs(v-(b[k]||0)))}</em>`:''}</span>`).join('')} ${preview}</div></div></div>${wearRequirementsHtml(ch,req.requires,light&&Object.entries(req.requires).some(([k,v])=>v!==(gearRequirements(it,data)[k]||0))?'รีเควสรวมสองมือ':'เงื่อนไขสวมใส่')}<div class="shelf-actions"><span class="${req.ok?'':'bad'}">${worn?(req.ok?'สวมใส่อยู่ · ใช้งานได้':'สถานะไม่ได้ใช้ · ยังอยู่ในช่อง'):req.ok?'สเตตัสถึงเกณฑ์': 'สเตตัสไม่ถึงเกณฑ์'}${!town?' · ขาย/ย่อยได้ในนิคม':''}</span><div>${btn('รายละเอียด','details','','secondary')}${disposal}${wear}</div></div></section>`;
}
function equipment(){
 const item=ch.gear.find(i=>i.uid===selected);
 const arrow=g.derived.offhand==='arrows'?arrowInUse(ch,data):null,arrows=arrowTotal(ch),low=arrows<=data.items.arrows.capacity*.2;
 const eq=data.items.slots.map(s=>{const it=ch.gear.find(x=>x.uid===ch.equipped[s]),fits=bagCategory==='gear'&&item&&(data.items.gearBases[item.base].slot===s||s==='offhand'&&handsOf(data,item)==='light');
  // With a bow the left hand shows the arrows in use and how many are left.
  if(s==='offhand'&&!it&&arrow)return `<button class="wear-slot wear-offhand ${low?'ammo-low':''}" data-action="arrows" aria-label="ลูกธนู ${data.items.arrows.types[arrow].nameTh} เหลือ ${arrows}"><small>${data.items.slotNames[s]}</small><span class="empty-mark">➶</span><b>${data.items.arrows.types[arrow].nameTh}</b><span class="ammo-count">${arrows}</span></button>`;
  const inactive=it&&!gearEquipState(ch,data,it,s).ok;
  return `<button class="wear-slot wear-${s} ${fits?'target':''} ${inactive?'equipment-inactive':''}" ${it?gradeStyle(it.grade):''} data-action="wear" data-id="${it?.uid||''}" aria-label="${data.items.slotNames[s]} ${it?data.items.gearBases[it.base].nameTh:'ว่าง'}${inactive?' · สถานะไม่ได้ใช้':''}"><small>${data.items.slotNames[s]}</small>${it?picture('gear',it.base):'<span class="empty-mark">＋</span>'}<b>${it?data.items.gearBases[it.base].nameTh:'ว่าง'}</b>${inactive?'<span class="inactive-badge">ไม่ได้ใช้</span>':''}</button>`}).join('');
 const list=bagCategory==='material'?Object.entries(ch.materials).filter(([,n])=>n>0):ch.gear.filter(i=>filter==='all'||data.items.gearBases[i.base].slot===filter);
 const size=bagPageSize();
 const cells=list.slice(page*size,page*size+size).map(it=>{if(bagCategory==='material'){const [id,count]=it,d=data.items.materials[id];return `<button class="inventory-cell ${id===materialId?'selected':''}" data-action="material" data-id="${id}" aria-label="${d.nameTh} ${count} ชิ้น">${picture('material',id)}<b>${d.nameTh}</b><span class="stack-count">${count}</span></button>`;}const d=data.items.gearBases[it.base],worn=!!wornSlot(ch,data,it),inactive=worn&&!gearEquipState(ch,data,it).ok;return `<button class="inventory-cell grade-${it.grade} ${it.uid===selected?'selected':''} ${inactive?'equipment-inactive':''}" ${gradeStyle(it.grade)} data-action="item" data-id="${it.uid}" aria-label="${d.nameTh} · เกรด ${it.grade}${it.upgrade?' · +'+it.upgrade:''}${worn?' · สวมอยู่':''}"><span class="cell-corner">${it.grade}${it.upgrade?' +'+it.upgrade:''}</span>${picture('gear',it.base)}<b>${d.nameTh}</b>${worn?`<span class="worn ${inactive?'inactive-badge':''}">${inactive?'!':'✓'}</span>`:''}</button>`;}).join('');
 return `<section class="window character-window">${header('CHARACTER / EQUIPMENT','อุปกรณ์',`<span class="seal">${ch.level}<small>LEVEL</small></span>`)}<div class="character-stage"><div class="character-caption"><h2>${esc(ch.name)}</h2><small>นักผจญภัย · Azure Coast</small></div><div class="stage-ring"></div><div class="pedestal"></div>${avatar?`<img class="hero-art" src="${avatar}" alt="ตัวละครและอุปกรณ์ที่สวมอยู่">`:''}${eq}<span class="stage-inscription">AZURE COAST • ADVENTURER</span></div><div class="wear-stat-totals" aria-label="สเตตัสสำหรับสวมใส่">${Object.entries(ch.stats).map(([stat,value])=>`<span>${stat} <b>${value}</b></span>`).join('')}</div><footer class="character-stats"><span class="power"><small>ค่าพลัง</small><b>${powerOf(ch,data).power.toLocaleString()}</b></span>${[['โจมตี',g.derived.attack],['พลังเวท',g.derived.magic],['ป้องกัน',g.derived.defense]].map(([n,v])=>`<span><small>${n}</small><b>${num(v)}</b></span>`).join('')}</footer></section><section class="window library-window">${header('BELONGINGS / INVENTORY','กระเป๋า',`<span class="currency">◈ ${ch.gold.toLocaleString()} <small>G</small></span>`)}<nav class="category-tabs">${btn(`อุปกรณ์ <b>${ch.gear.length}</b>`,'bag-category','data-id="gear"',bagCategory==='gear'?'active':'')}${btn(`วัตถุดิบ <b>${Object.values(ch.materials).filter(n=>n>0).length}</b>`,'bag-category','data-id="material"',bagCategory==='material'?'active':'')}<span>เลือกเพื่อเทียบ / ดูรายละเอียด</span></nav><nav class="filters">${bagCategory==='material'?'<span>วัตถุดิบที่ตัวละครครอบครอง</span>':[['all','ทั้งหมด'],['weapon','อาวุธ'],['offhand','โล่'],['armor','เกราะ'],['helm','หมวก'],['gloves','ถุงมือ'],['boots','รองเท้า'],['charm','เครื่องราง']].map(([id,n])=>btn(n,'filter',`data-id="${id}"`,filter===id?'active':'')).join('')+btn('ย่อยเกรด C','salvage-c',g.nearby().inTown?'title="ย่อยเกรด C ที่ไม่ได้สวมและไม่ได้ล็อกทั้งหมด"':'disabled title="ย่อยได้ในนิคม"','secondary')}</nav><div class="inventory-grid bag-grid" data-page-size="${size}">${cells}${Array.from({length:Math.max(0,size-Math.min(size,list.length-page*size))},()=>'<span class="inventory-empty"></span>').join('')}</div>${pager(list.length)}${gearShelf()}</section>`;
}
function pager(count,size=pageSize()){return `<div class="grid-footer"><span>${count} ${bagCategory==='material'&&screen==='equipment'?'ชนิด':'ชิ้น'}</span><div>${btn('‹','prev',page===0?'disabled aria-label="หน้าก่อน"':'aria-label="หน้าก่อน"')}<span>${page+1} / ${Math.max(1,Math.ceil(count/size))}</span>${btn('›','next',(page+1)*size>=count?'disabled aria-label="หน้าถัดไป"':'aria-label="หน้าถัดไป"')}</div></div>`;}
function skillShelf(){
 const isMod=category==='mod',isMove=category==='movement',inst=ch.mods.find(m=>m.uid===modUid),d=isMod?data.mods.mods[inst?.id]:isMove?data.skills.movement[skillId]:data.skills.combat[skillId];if(!d)return emptyShelf('ยังไม่มีเหรียญม็อด');
 const st=isMod?modStatus(ch,data,slot,inst):null,req=meetsRequires(ch,d.requires),owned=isMod||isMove?isMod||ch.movementSkills.includes(skillId):!!ch.skills[skillId],already=isMod?st.own:isMove?ch.movement===skillId:ch.slots[slot].skill===skillId;
 const compiled=!isMod&&!isMove?computeSkill({...ch,slots:ch.slots.map((s,i)=>i===slot?{skill:skillId,mods:s.skill===skillId?s.mods:[]}:s)},data,g.derived,slot):null;
 let message=isMod?(st.fit.ok?(st.own?'ใส่อยู่ในช่อง '+(slot+1):st.where>=0?'ย้ายจากช่อง '+(st.where+1)+' → ช่อง '+(slot+1):'เป้าหมาย: ช่อง '+(slot+1)):(st.reason)):!owned?'ยังไม่เรียนสกิลนี้':!req.ok?'ต้อง '+req.missing.join(' · '):isMove?'ใช้ช่องเคลื่อนที่แยกต่างหาก':`ช่อง ${slot+1} · ${already?'ใส่อยู่':'เลือกเพื่อแทนที่'}`;
 if(isMod&&st.fit.ok&&!st.active)message+=' · '+(!st.req.ok?'ยังไม่ทำงาน: '+st.req.missing.join(', '):'ต้องมีม็อดพื้นที่ที่ทำงาน');
 const reqChip=Object.entries((isMod?modRequires(data,d,inst.level):d.requires)||{}).map(([k,v])=>`<span class="${ch.stats[k]<v?'unmet':''}">${k} ${v}</span>`).join('');
 const weaponChip=!isMod&&d.requiresWeapon?`<span class="${d.requiresWeapon.includes(g.derived.weaponType)?'':'unmet'}">ต้องถือ ${weaponNames(d)}</span>`:'';
 return `<section class="selection-shelf skill-shelf"><div class="selected-summary">${isMod?coin(inst):picture('skill',skillId)}<div><small>${isMod?'เหรียญม็อด · เกรด '+inst.grade+' · Lv.'+inst.level:isMove?'สกิลเคลื่อนที่':'สกิล · Lv.'+(ch.skills[skillId]||'—')}</small>${isMod?modName(inst,'h2'):`<h2>${d.nameTh}</h2>`}${isMod?`<div class="tags"><span>${modRules(d)[0].replace('และมีอย่างน้อยหนึ่ง:','ประเภท:')}</span>${reqChip}</div>`:isMove?tags(d):`<div class="comparison"><span>${compiled.damage!==undefined?'ดาเมจ <b>'+num(compiled.damage)+'</b>':compiled.barrier!==undefined?'เกราะ <b>'+num(compiled.barrier)+'</b>':compiled.heal!==undefined?'ฟื้นฟู <b>'+num(compiled.heal)+'</b>':''}</span><span>MP <b>${num(compiled.cost)}</b></span><span>CD <b>${num(compiled.cooldown)}s</b></span>${!req.ok?`<span class="bad">${req.missing.join(', ')}</span>`:''}${weaponChip?`<span class="${d.requiresWeapon.includes(g.derived.weaponType)?'':'bad'}">ต้องถือ ${weaponNames(d)}</span>`:''}</div>`}</div></div><div class="shelf-actions"><span class="${!req.ok||st&&!st.fit.ok||!owned?'bad':''}">${message}</span><div>${btn('รายละเอียด','details','','secondary')}${btn(isMod?(already?'ถอดเหรียญ':!st.fit.ok?'ใช้ไม่ได้':st.can?'ใส่เหรียญ →':'เปลี่ยน →'):already?(isMove?'ใช้อยู่':'ถอดสกิล'):isMove?'เลือกใช้ →':'ใส่ช่อง '+(slot+1)+' →','apply',isMove&&already?'disabled':'','primary')}</div></div></section>`;
}
function skills(){
 const selectedMod=ch.mods.find(m=>m.uid===modUid);
 const cards=ch.slots.map((s,i)=>{const d=data.skills.combat[s.skill],fit=category==='mod'&&selectedMod&&modStatus(ch,data,i,selectedMod).fit.ok;
 return `<section class="skill-card ${slot===i?'selected':''} ${fit?'compatible':''}" data-target="${i}"><span class="slot-number">0${i+1}</span>${fit?'<span class="fit-mark">✓</span>':''}<button class="skill-anchor" data-action="slot" data-id="${i}" aria-label="เลือกช่อง ${i+1} ${d?.nameTh||'ว่าง'}">${d?picture('skill',s.skill):'<span class="empty-mark">＋</span>'}<span><b>${d?.nameTh||'ช่องว่าง'}</b><small>${d?'Lv.'+ch.skills[s.skill]:'เลือกจากคลัง'}</small></span></button><div class="coin-links">${Array.from({length:data.mods.maxModsPerSkill},(_,j)=>{const m=ch.mods.find(m=>m.uid===s.mods[j]),active=m&&modStatus(ch,data,i,m).active;return `<button class="socket ${m?'occupied':''} ${active?'linked':'inactive'}" data-action="socket" data-slot="${i}" data-index="${j}" ${m?`data-uid="${m.uid}"`:''} aria-label="ช่อง ${i+1} ม็อด ${j+1} ${m?data.mods.mods[m.id].nameTh:'ว่าง'}">${m?coin(m):'<span class="socket-empty">＋</span>'}<small>${m?(active?'เชื่อมแล้ว':'ยังไม่ทำงาน'):'ว่าง'}</small></button>`;}).join('')}</div><div class="card-foot">${d?(d.tags.slice(0,2).map(t=>TAGS[t]||t).join(' / ')):'—'}<span>${s.mods.length}/${data.mods.maxModsPerSkill}</span></div></section>`;}).join('');
 const count=category==='mod'?ch.mods.length:category==='movement'?Object.keys(data.skills.movement).length:Object.keys(data.skills.combat).length;
 return `<section class="window loadout-window">${header('BATTLE / LOADOUT','ชุดสกิล',`<span class="quiet">${ch.slots.filter(s=>s.skill).length}/${ch.slots.length} ช่องต่อสู้</span>`)}<div class="loadout-intro"><b>เลือกช่อง · เหรียญเชื่อมกับสกิล</b><span>สกิลละ ${data.mods.maxModsPerSkill} ม็อด</span></div><div class="equipped-skills">${cards}</div><footer class="movement-bar">${data.skills.movement[ch.movement]?picture('skill',ch.movement):'<span class="empty-mark">＋</span>'}<span><small>เคลื่อนที่ · ช่องแยก</small><b>${data.skills.movement[ch.movement]?.nameTh||'ว่าง'}</b></span>${btn('เปลี่ยน','category','data-id="movement"','secondary')}</footer></section><section class="window library-window">${header('COLLECTION / SKILLS & MODS','คลังสกิลและม็อด',`<span class="quiet">${category==='mod'?ch.mods.filter(m=>ch.slots.some(s=>s.mods.includes(m.uid))).length+' / '+ch.mods.length+' ใส่อยู่':'เลือกวัตถุเพื่อจัดชุด'}</span>`)}<nav class="category-tabs">${[['skill','สกิล',Object.keys(ch.skills).length],['mod','เหรียญม็อด',ch.mods.length],['movement','เคลื่อนที่',ch.movementSkills.length]].map(([id,n,count])=>btn(`${n} <b>${count}</b>`,'category',`data-id="${id}"`,category===id?'active':'')).join('')}</nav><div class="library-note">${category==='mod'?'<span class="role-key power">● พลังโจมตี</span><span class="role-key mechanic">● กลไก</span><span class="role-key support">● สนับสนุน</span>':'<span>✓ ใส่อยู่</span><span>เลือกไอคอนเพื่อดูค่าสถานะ</span>'}</div><div class="inventory-grid skill-grid ${category==='mod'?'mod-grid':''}">${libraryCells()}</div>${category==='mod'?pager(ch.mods.length,15):pager(count)}${skillShelf()}</section>`;
}
function libraryCells(){
 if(category==='mod')return ch.mods.slice(page*15,page*15+15).map(m=>{const st=modStatus(ch,data,slot,m);return `<button class="inventory-cell coin-cell ${m.uid===modUid?'selected':''} ${!st.fit.ok?'incompatible':''}" data-action="mod" data-id="${m.uid}" aria-label="${data.mods.mods[m.id].nameTh}"><span class="cell-corner">Lv.${m.level}</span>${coin(m)}${modName(m)}${st.where>=0?`<span class="worn">${st.where+1}</span>`:''}<span class="fit-dot ${!st.req.ok?'unmet':''}">${st.fit.ok?st.req.ok?'✓':'!':'×'}</span></button>`;}).join('');
 const move=category==='movement';return Object.entries(move?data.skills.movement:data.skills.combat).slice(move?0:page*12,move?4:page*12+12).map(([id,d])=>{const owned=move?ch.movementSkills.includes(id):!!ch.skills[id],req=meetsRequires(ch,d.requires),at=move?(ch.movement===id?0:-1):ch.slots.findIndex(s=>s.skill===id);return `<button class="inventory-cell ${id===skillId?'selected':''} ${!owned||!req.ok?'locked':''}" data-action="skill" data-id="${id}" aria-label="${d.nameTh}"><span class="cell-corner">${owned?'Lv.'+(ch.skills[id]||1):'ยังไม่เรียน'}</span>${picture('skill',id)}<b>${d.nameTh}</b>${at>=0?`<span class="worn">${move?'✓':at+1}</span>`:''}${!req.ok?'<span class="require-mark">!</span>':''}</button>`;}).join('');
}
function cancelMotion(){motionToken++;motionAnimations.forEach(a=>a.cancel());motionAnimations=[];document.querySelectorAll('.flying-coin,.coin-trail').forEach(n=>n.remove());root.querySelectorAll('.arriving,.seated').forEach(n=>n.classList.remove('arriving','seated'));}
function modelKey(){return JSON.stringify([ch.name,ch.level,ch.progress.equipmentNotice,ch.appearance,ch.stats,ch.equipped,ch.gear,ch.materials,ch.mods,ch.slots,ch.skills,ch.movementSkills,ch.movement,ch.gold,g.derived]);}
function render(){if(root.hidden)return;cancelMotion();normalizeSelection();const active=document.activeElement;const activeData=root.contains(active)?{...active.dataset}:null;root.innerHTML=`<nav class="workspace-nav">${btn('<span aria-hidden="true">‹</span> เมนูหลัก','hub','aria-label="กลับเมนูหลัก"','hub-back')}${btn('อุปกรณ์ / กระเป๋า','screen','data-id="equipment"',screen==='equipment'?'active':'')}${btn('ชุดสกิล / ม็อด','screen','data-id="skills"',screen==='skills'?'active':'')}${ui.sel.returnCraftRecipe?btn('กลับไปคราฟต์','return-craft'):''}${btn('×','close','aria-label="ปิดหน้าจอจัดชุด"')}</nav><main class="two-windows ${screen}">${screen==='equipment'?equipment():skills()}</main><div class="atelier-notice" role="status">${esc(notice||plainResult(ui.lastResult)||(screen==='equipment'?equipmentNotice(ch,data):''))}</div><div class="rotate-message">หมุนอุปกรณ์เป็นแนวนอน</div>`;if(activeData){const next=[...root.querySelectorAll('button')].find(b=>Object.entries(activeData).every(([k,v])=>b.dataset[k]===v));(next||root).focus({preventScroll:true});}renderedModel=modelKey();renderedNotice=JSON.stringify([notice,ui.lastResult]);}
function dialog(title,body,action='confirm',label='ยืนยัน'){
 cancelMotion();lastTrigger=document.activeElement;const node=document.createElement('div');node.className='dialog-backdrop';node.innerHTML=`<section class="atelier-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><small>AZURE COAST</small>${action?`<h2 id="dialog-title">${title}</h2>`:`<header class="detail-heading"><h2 id="dialog-title">${title}</h2>${btn('×','cancel','aria-label="ปิดรายละเอียด"','detail-close')}</header>`}${body}${action?`<footer>${btn('ยกเลิก','cancel','','secondary')}${btn(label,action,'','primary')}</footer>`:''}</section>`;root.append(node);node.querySelector('button')?.focus({preventScroll:true});
}
function closeDialog(){pending=null;$('.dialog-backdrop')?.remove();(lastTrigger?.isConnected?lastTrigger:root).focus({preventScroll:true});}
function finish(result,text){notice=result?.ok===false?'ไม่สำเร็จ: '+(result.reason||'เงื่อนไขไม่ครบ'):text;pending=null;if(result?.ok===false)render();else ui.changed();}
const center=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2,size:r.width}:null;};
const libraryCenter=uid=>center($(`.inventory-cell[data-id="${uid}"] .coin`))||center($('.selected-summary>.coin'))||center($('.library-window .inventory-grid'));
async function animateTransfers(transfers,targetSelector){
 const token=++motionToken;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=$(targetSelector);if(target)target.classList.add('arriving');
 const jobs=transfers.filter(t=>t.from&&t.to).map(async({inst,from,to,remove=false,delay=0})=>{
  const dx=to.x-from.x,dy=to.y-from.y,size=from.size||48,ghost=document.createElement('div');ghost.className='flying-coin';ghost.innerHTML=coin(inst);ghost.style.cssText=`left:${from.x}px;top:${from.y}px;width:${size}px;height:${size}px`;document.body.append(ghost);
  const trail=document.createElementNS('http://www.w3.org/2000/svg','svg');trail.classList.add('coin-trail');trail.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);trail.innerHTML=`<path d="M${from.x},${from.y} Q${from.x+dx*.52},${from.y+dy*.52-70} ${to.x},${to.y}"/>`;document.body.append(trail);
  const duration=remove?560:880, endScale=(to.size||40)/size;
  const a=ghost.animate([{transform:'translate(-50%,-50%) scale(1) rotateZ(0deg) rotateY(0deg)',opacity:1},{transform:`translate(calc(-50% + ${dx*.52}px),calc(-50% + ${dy*.52-70}px)) scale(1.22) rotateZ(${remove?-190:210}deg) rotateY(58deg)`,offset:.52,opacity:1},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${endScale}) rotateZ(${remove?-360:360}deg) rotateY(0deg)`,opacity:1}],{duration,delay,easing:'cubic-bezier(.32,.05,.22,1)',fill:'both'});
  const ta=trail.animate([{opacity:0,strokeDashoffset:700},{opacity:.7,offset:.3},{opacity:0,strokeDashoffset:0}],{duration,delay});motionAnimations.push(a,ta);
  await a.finished.catch(()=>{});ghost.remove();trail.remove();
 });
 await Promise.all(jobs);
 if(token!==motionToken)return;
 target?.classList.remove('arriving');target?.classList.add('seated');motionAnimations=[];
 if(target){const a=target.animate([{filter:'brightness(2)',transform:'scale(.84)'},{filter:'brightness(1.3)',transform:'scale(1.08)',offset:.45},{filter:'brightness(1)',transform:'scale(1)'}],{duration:280});motionAnimations.push(a);await a.finished.catch(()=>{});if(token===motionToken){target.classList.remove('seated');motionAnimations=[];}}
}
function invalid(text){
 cancelMotion();notice=text;$('.atelier-notice').textContent=text;const node=$(`[data-target="${slot}"]`);
 if(node&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const animation=node.animate([{transform:'translateX(0)'},{transform:'translateX(4px)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}],{duration:220});motionAnimations.push(animation);
  animation.finished.catch(()=>{}).then(()=>{const index=motionAnimations.indexOf(animation);if(index>=0)motionAnimations.splice(index,1);});
 }
}
function performMod(index=null){
 const inst=ch.mods.find(m=>m.uid===modUid);if(!inst)return;const st=modStatus(ch,data,slot,inst),targetSlot=slot;
 if(!st.fit.ok&&!st.own){invalid(st.reason);return;}
 const from=libraryCenter(inst.uid), source=st.where>=0?center($(`[data-target="${st.where}"] .socket[data-uid="${inst.uid}"] .coin`)):from;
 if(st.own){const to=from;unsocketMod(ch,inst.uid);finish(null,'ถอด '+data.mods.mods[inst.id].nameTh+' กลับคลังแล้ว');animateTransfers([{inst,from:source,to,remove:true}],`[data-id="${inst.uid}"] .coin`);return;}
 const backup=structuredClone(ch.slots),oldUid=index!==null?ch.slots[slot].mods[index]:null,old=ch.mods.find(m=>m.uid===oldUid),oldFrom=old?center($(`[data-target="${slot}"] .socket[data-uid="${oldUid}"] .coin`)):null,oldTo=old?libraryCenter(oldUid):null;
 if(old)unsocketMod(ch,oldUid);
 const result=socketMod(ch,data,slot,inst.uid);if(!result.ok)ch.slots=backup;
 if(result.ok)g.notify({type:'socket'});finish(result,result.ok?(modStatus(ch,data,slot,inst).active?'เชื่อม '+data.mods.mods[inst.id].nameTh+' แล้ว':'ใส่เหรียญแล้ว · ค่าสถานะยังไม่ถึง'):'เงื่อนไขไม่ครบ');
 if(result.ok){const sel=`[data-target="${targetSlot}"] .socket[data-uid="${inst.uid}"]`,to=center($(sel+' .coin'));animateTransfers([...(old?[{inst:old,from:oldFrom,to:oldTo,remove:true}]:[]),{inst,from:source,to,delay:old?160:0}],sel);}
}
function details(){
 if(screen==='equipment'){
  const id=bagCategory==='material'?materialId:selected;if(id===null)return;
  const definition=bagCategory==='material'?data.items.materials[id]:data.items.gearBases[ch.gear.find(i=>i.uid===id).base];
  dialog(definition.nameTh,(bagCategory==='gear'?`<p class="equipment-level">${itemLevel(ch.gear.find(i=>i.uid===id))}</p>`:'')+inventoryDetails(bagCategory==='material'?'materials':'gear',id),null);return;
 }
 const inst=ch.mods.find(m=>m.uid===modUid),d=category==='mod'?data.mods.mods[inst?.id]:(category==='movement'?data.skills.movement:data.skills.combat)[skillId];
 if(!d)return;dialog(d.nameTh,`<div class="detail-object">${category==='mod'?coin(inst):picture('skill',skillId)}<span>${d.name}${category==='mod'?'<br>มีหนึ่งเหรียญ · เกรด '+inst.grade+' · Lv.'+inst.level:''}</span></div><p>${d.desc}</p>${category==='mod'?modRules(d).map(t=>`<p>${esc(t)}</p>`).join(''):tags(d)}<p>ต้องการ ${[...Object.entries(d.requires||{}).map(([k,v])=>k+' '+v),...(d.requiresWeapon?['ถือ '+weaponNames(d)]:[])].join(' · ')||'ไม่มี'}</p>${btn('อัปเลเวล →','growth','','secondary')}`,null);
}
root.addEventListener('click',e=>{
 const legacy=e.target.closest('[data-act]');if(legacy){const refreshDetails=['gear-up','gear-grade','sell','equip-gear','unequip'].includes(legacy.dataset.act);cancelMotion();notice='';ui.onClick(e);if(refreshDetails&&!root.hidden){makeAvatar();details();}return;}
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const id=b.dataset.id;
 switch(b.dataset.action){
  case 'screen':ui.open(id==='equipment'?'bag':'skills');break;
  case 'hub':ui.open('menu');break;
  case 'close':ui.close();break;
  case 'return-craft':ui.sel.craftRecipe=ui.sel.returnCraftRecipe;ui.sel.returnCraftRecipe=null;ui.open('craft');break;
  case 'growth':ui.open('growth');break;
  case 'bag-category':bagCategory=id;page=0;filter='all';notice='';render();break;
  case 'filter':filter=id;page=0;render();break;
  case 'prev':page--;render();break;
  case 'next':page++;render();break;
  case 'item':selected=+id;ui.sel.item=id;notice='';render();break;
  case 'material':materialId=id;notice='';render();break;
  case 'wear':if(id){bagCategory='gear';filter='all';selected=+id;ui.sel.item=id;page=Math.max(0,Math.floor(ch.gear.findIndex(i=>i.uid===selected)/bagPageSize()));render();}break;
  case 'equip':{const it=ch.gear.find(i=>i.uid===selected),d=data.items.gearBases[it.base],at=wornSlot(ch,data,it);if(at){finish(unequip(ch,data,at),'ถอดอุปกรณ์แล้ว');}else{const r=equip(ch,data,selected,b.dataset.slot||null);finish(r.ok?r:{...r,reason:HAND_REASON[r.reason]||r.reason},'สวมใส่ '+d.nameTh+(b.dataset.slot==='offhand'?' มือซ้าย':'')+' แล้ว'+(r.freed?.length?' · มือซ้ายเก็บเข้ากระเป๋า':''));}makeAvatar();break;}
  case 'lock':finish(toggleGearLock(ch,selected),'เปลี่ยนการล็อกแล้ว');break;
  case 'sell-gear':{const it=ch.gear.find(i=>i.uid===selected),name=data.items.gearBases[it.base].nameTh;if(['A','S'].includes(it.grade)&&pending?.kind!=='sell'){pending={kind:'sell',uid:it.uid};dialog('ขาย '+name+' เกรด '+it.grade+'?',`<p>ได้ ${gearSellValue(data,it)} G · ขายแล้วเอาคืนไม่ได้</p>`,'sell-gear','ขาย');break;}const r=sellGear(ch,data,pending?.uid||selected);closeDialog();finish(r,'ขาย '+name+' ได้ '+(r.gold||0)+' G');break;}
  case 'salvage-gear':{const it=ch.gear.find(i=>i.uid===selected),name=data.items.gearBases[it.base].nameTh,back=salvageReturn(data,it),list=Object.entries(back).map(([k,n])=>data.items.materials[k].nameTh+' ×'+n).join(' · ');if(['A','S'].includes(it.grade)&&pending?.kind!=='salvage'){pending={kind:'salvage',uid:it.uid};dialog('ย่อย '+name+' เกรด '+it.grade+'?',`<p>ได้ ${list} · ย่อยแล้วเอาคืนไม่ได้</p>`,'salvage-gear','ย่อย');break;}const r=salvageGear(ch,data,pending?.uid||selected);closeDialog();finish(r,'ย่อย '+name+' ได้ '+list);break;}
  case 'salvage-c':{const r=salvageMany(ch,data,['C']);finish(r.ok?r:{ok:false,reason:'ไม่มีเกรด C ที่ย่อยได้'},'ย่อยเกรด C '+r.count+' ชิ้น');break;}
  case 'arrows':{
   // Choose which stocked arrows to shoot, or go craft more (crafting works outside town).
   const use=arrowInUse(ch,data),rows=Object.entries(data.items.arrows.types).map(([id,t])=>{const n=ch.arrows.stock[id]||0,stats=Object.entries(t.stats).map(([k,v])=>(statName[k]||k)+' +'+v).join(' · ')||'ลูกธนูพื้นฐาน';return `<div class="arrow-row ${id===use?'active':''}"><span><b>${t.nameTh}</b><small>${stats} · เหลือ ${n}</small></span>${id===use?'<em>ใช้อยู่</em>':btn('ใช้ลูกนี้','use-arrow',`data-id="${id}" ${n?'':'disabled'}`,'secondary')}</div>`;}).join('');
   dialog('ลูกธนู',`<p>ซอง ${arrowTotal(ch)}/${data.items.arrows.capacity} ลูก</p><div class="arrow-list">${rows}</div>${btn('คราฟต์ลูกธนู →','arrow-craft','','primary')}`,null);break;}
  case 'use-arrow':{const r=chooseArrows(ch,data,id);closeDialog();g.refresh();finish(r,'เปลี่ยนเป็น '+data.items.arrows.types[id].nameTh+' แล้ว');break;}
  case 'arrow-craft':closeDialog();ui.sel.craft='arrow';ui.open('craft');break;
  case 'category':category=id;page=0;skillId=id==='movement'?ch.movement:ch.slots[slot].skill||'firebolt';notice='';render();break;
  case 'slot':slot=+id;ui.sel.skill=slot;if(category==='skill'&&ch.slots[slot].skill)skillId=ch.slots[slot].skill;notice='';render();break;
  case 'skill':skillId=id;notice='';render();break;
  case 'mod':modUid=+id;notice='';render();break;
  case 'socket':slot=+b.dataset.slot;ui.sel.skill=slot;category='mod';if(ch.slots[slot].mods[+b.dataset.index])modUid=ch.slots[slot].mods[+b.dataset.index];notice='';render();break;
  case 'apply':{
   if(category==='mod'){const inst=ch.mods.find(m=>m.uid===modUid);if(!inst)return;const st=modStatus(ch,data,slot,inst);if(st.own||st.can)performMod();else if(!st.fit.ok)invalid(st.reason);else if(ch.slots[slot].mods.length>=data.mods.maxModsPerSkill){pending={kind:'mod',slot,uid:modUid};dialog('เลือกเหรียญที่จะเปลี่ยน',`<p>${data.mods.mods[inst.id].nameTh} → ช่อง ${slot+1}</p><div class="replace-coins">${ch.slots[slot].mods.map((uid,i)=>{const m=ch.mods.find(m=>m.uid===uid);return btn(coin(m)+`<b>${data.mods.mods[m.id].nameTh}</b><small>กลับคลัง</small>`,'replace-mod',`data-index="${i}"`)}).join('')}</div>`,null);}else invalid(st.reason);
   }else if(category==='movement'){const req=meetsRequires(ch,data.skills.movement[skillId].requires);if(!ch.movementSkills.includes(skillId)||!req.ok)invalid(!req.ok?'ต้อง '+req.missing.join(' · '):'ยังไม่เรียนสกิลนี้');else {const result=setMovement(ch,data,skillId);if(result.ok){g.player.movement.charges=0;g.player.movement.rechargeT=0;}finish(result,'เปลี่ยนสกิลเคลื่อนที่แล้ว');}
   }else {const req=meetsRequires(ch,data.skills.combat[skillId].requires),remove=ch.slots[slot].skill===skillId;if(!ch.skills[skillId]||!req.ok){invalid(!req.ok?'ต้อง '+req.missing.join(' · '):'ยังไม่เรียนสกิลนี้');break;}pending={kind:'skill',slot,id:remove?null:skillId};const other=ch.slots.findIndex(s=>s.skill===skillId);dialog(remove?'ถอดสกิลช่อง '+(slot+1)+'?':other>=0?'สลับตำแหน่งสกิล?':'เปลี่ยนสกิลช่อง '+(slot+1)+'?',`<div class="detail-object">${picture('skill',skillId)}<span>${data.skills.combat[skillId].nameTh}</span></div><p>${remove?'สกิลและเหรียญกลับคลัง':other>=0?'สกิลและเหรียญจะสลับทั้งชุดกับช่อง '+(other+1):'เหรียญเดิมกลับคลัง'}</p>`);}
   break;
  }
  case 'replace-mod':if(pending?.kind==='mod'){slot=pending.slot;modUid=pending.uid;performMod(+b.dataset.index);}break;
  case 'confirm':if(pending?.kind==='skill'){const p=pending;finish(equipSkill(ch,data,p.slot,p.id),'จัดชุดสกิลแล้ว');}break;
  case 'cancel':cancelMotion();closeDialog();break;
  case 'details':details();break;
 }
});

function plainResult(value){const temp=document.createElement('div');temp.innerHTML=value||'';return temp.textContent;}
function onKey(e){
 if(root.hidden||root.closest('[inert]'))return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if($('.dialog-backdrop')){cancelMotion();closeDialog();}else if(motionAnimations.length){cancelMotion();root.focus({preventScroll:true});}else ui.close();}
 if(e.key==='Tab'){
  const scope=$('.atelier-dialog')||root,buttons=[...scope.querySelectorAll('button:not(:disabled),select,input')].filter(b=>b.getClientRects().length),first=buttons[0],last=buttons.at(-1);
  if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===root)){e.preventDefault();first?.focus();}
 }
}
window.addEventListener('keydown',onKey,{capture:true});
function onBagCapacityChange(){
 if(root.hidden||screen!=='equipment')return;
 const list=bagCategory==='material'?Object.entries(ch.materials).filter(([,n])=>n>0):ch.gear.filter(i=>filter==='all'||data.items.gearBases[i.base].slot===filter);
 const index=list.findIndex(it=>bagCategory==='material'?it[0]===materialId:it.uid===selected);
 page=Math.max(0,Math.floor(index/bagPageSize()));
 const backdrop=$('.dialog-backdrop'),focused=backdrop?.contains(document.activeElement)?document.activeElement:null;
 backdrop?.remove();render();if(backdrop){root.append(backdrop);focused?.focus({preventScroll:true});}
}
shortLandscape.addEventListener('change',onBagCapacityChange);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');reducedMotion.addEventListener('change',cancelMotion);window.addEventListener('resize',cancelMotion);
function makeAvatar(){
 if(root.hidden||screen!=='equipment')return;
 const context=getAvatarContext?.();if(!context?.renderer)return;
 if(!context.modelsReady){clearTimeout(avatarTimer);avatarTimer=setTimeout(makeAvatar,100);return;}
 const gear=g.gearLook(),key=JSON.stringify([ch.appearance,gear,context.modelRevision]);if(key===avatarKey)return;
 try{avatar=equipmentAvatar(context.renderer,ch.appearance,gear);avatarKey=key;render();}catch(error){console.warn('equipment portrait unavailable',error);}
}
return {
 root,
 get state(){return {screen,category,bagCategory,selected,materialId,slot,skillId,modUid,page,pending,moving:motionAnimations.length>0}},
 open(tab){
  root.hidden=false;screen=tab==='bag'?'equipment':'skills';slot=ui.sel.skill??slot;page=0;
  if(screen==='equipment'&&ui.sel.item&&Number(ui.sel.item)!==selected){
   selected=Number(ui.sel.item);filter='all';bagCategory='gear';page=Math.max(0,Math.floor(ch.gear.findIndex(i=>i.uid===selected)/bagPageSize()));
  }
  if(tab==='mods')category='mod';
  else if(tab==='movement'){category='movement';skillId=ch.movement;}
  else if(tab==='skills'){category='skill';skillId=ch.slots[slot]?.skill||skillId;}
  pending=null;notice='';render();makeAvatar();root.focus({preventScroll:true});
 },
 close(){cancelMotion();pending=null;root.hidden=true;clearTimeout(avatarTimer);},
 render,cancelMotion,
 refresh(){if(modelKey()!==renderedModel||JSON.stringify([notice,ui.lastResult])!==renderedNotice)render();},
 destroy(){this.close();window.removeEventListener('keydown',onKey,{capture:true});window.removeEventListener('resize',cancelMotion);shortLandscape.removeEventListener('change',onBagCapacityChange);reducedMotion.removeEventListener('change',cancelMotion);root.remove();}
};
}
