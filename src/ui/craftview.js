// One reusable item workshop: choosing a recipe never crafts or spends anything.
import {art,arrowArt} from './art.js';
import {arrowTotal} from '../core/character.js';
import {esc,tagsHtml,rulesHtml} from './buildmeta.js';
import {recipeBlocker} from '../core/crafting.js';
import {gearEquipState,gearRequirements} from '../core/character.js';
import {gradeGuide,craftGoal,wearRequirements} from './progressionview.js';
import {CRAFT_STAGES,compareCraftRecipes,recipeEquipmentLevel,skillCraftGuide,craftDescription,recipeSearchText,craftQueryMatches} from '../core/craft-order.js';
import {bindCraftSearch} from './craft-search.js';

const BLOCK={materials:'วัตถุดิบหรือ Gold ไม่พอ',learned:'เรียนแล้ว',unknown:'ไม่พบสูตร',full:'ซองลูกธนูเต็มแล้ว'};
const pic=(kind,id)=>kind==='arrow'?arrowArt(id):art(kind,id);
function info(data,r) {
 if(r.type==='arrow'){const def=data.items.arrows.types[r.result];return {def:{...def,desc:`ได้ ${r.qty} ลูก · ${Object.entries(def.stats).map(([k,v])=>k+' +'+v).join(' · ')||'ลูกธนูพื้นฐาน'}`},kind:'arrow',name:def.nameTh};}
 const def=r.type==='gear'?data.items.gearBases[r.result]:r.type==='mod'?data.mods.mods[r.result]:r.type==='movement'?data.skills.movement[r.result]:data.skills.combat[r.result];
 return {def,kind:r.type==='gear'?'gear':r.type==='mod'?'mod':'skill',name:def.nameTh};
}
function canMake(ch,r) {
 return Math.max(0,Math.min(...Object.entries(r.cost).map(([key,n])=>Math.floor((key==='gold'?ch.gold:ch.materials[key]||0)/n))));
}
function resultCard(ui,item) {
 const {ch,data}=ui.game,base=data.items.gearBases[item.base],state=gearEquipState(ch,data,item),equipped=ch.equipped[base.slot]===item.uid;
 return `<section class="craft-result grade-${item.grade}" data-crafted-uid="${item.uid}">${art('gear',item.base)}${ui.gearLine(item)}<div class="craft-result-actions"><button class="btn" data-act="inspect-crafted" data-uid="${item.uid}">ดูและเทียบของที่สวม</button>${equipped?'<span class="equipped-label">✓ สวมใส่อยู่</span>':`<button class="btn" data-act="equip-gear" data-uid="${item.uid}" ${state.ok?'':'disabled'}>${state.ok?'สวมใส่ชิ้นนี้':state.reason==='level'?'เลเวลยังไม่ถึง':'สเตตัสยังไม่ถึง'}</button>`}</div></section>`;
}
const isSkill=r=>r.type==='skill'||r.type==='movement';
function guideHtml(data,r) {
 if(!isSkill(r))return '';
 const guide=skillCraftGuide(data,r);
 return `<div data-craft-guide><small><b>${esc(guide.roleName)}</b> · ${esc(guide.playstyle)}</small><p class="muted">${esc(guide.condition)}</p></div>`;
}
export function craftView(ui,{costHtml,effectText,filters}) {
 const g=ui.game,{ch,data}=g,cat=ui.sel.craft,id=ui.sel.craftRecipe,r=data.recipes.recipes[id];
 bindCraftSearch(ui);
 if(r) {
  // Arrows are crafted anywhere outside combat; everything else at the workbench.
  const {def,kind,name}=info(data,r),block=recipeBlocker(ch,data,id),field=r.type==='arrow',near=field?!g.inCombat():g.nearby().workbench;
  const uids=ui.sel.craftHistory?.[id]||[],items=uids.map(uid=>ch.gear.find(it=>it.uid===uid)).filter(Boolean),status=ui.sel.craftStatus?.[id];
  const desc=r.type==='gear'?Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):r.type==='arrow'?`ได้ ${r.qty} ลูก${Object.keys(def.stats).length?' · '+Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):''}`:craftDescription(data,r);
  const types=r.type==='mod'?rulesHtml(def):def.tags?tagsHtml(def.tags):'';
  const pool=r.type==='gear'?`<details class="recipe-affixes"><summary>ดูออฟชั่นที่สุ่มได้ · ${r.optionPool.length} แบบ</summary>${r.optionPool.map(o=>`<p>${data.items.gearOptions[o].labelTh.replace('{v}',data.items.gearOptions[o].min+'–'+data.items.gearOptions[o].max)}</p>`).join('')}</details>`:'';
  return `<section class="craft-workspace" data-recipe="${id}" aria-label="คราฟต์ ${esc(name)}"><div class="craft-detail-heading"><button class="btn" data-act="craft-back">← เปลี่ยนสูตร</button><span class="muted">โต๊ะคราฟต์ · ${esc(name)}</span></div><div class="craft-detail-layout"><section class="craft-controls card"><div class="recipe-hero">${pic(kind,r.result)}<div><h3 class="craft-detail-title" tabindex="-1">${esc(name)}</h3><small>${esc(def.name)}</small>${r.type==='gear'?`<span class="level-pill">Lv.${recipeEquipmentLevel(data,r)}</span>`:''}</div></div><p class="muted">${esc(desc||'')}</p>${guideHtml(data,r)}${types}${r.type==='gear'?wearRequirements(ch,gearRequirements({base:r.result,itemLevel:r.itemLevel,grade:'C',upgrade:0,options:[]},data),'เงื่อนไขสวมใส่')+'<p class="muted">คราฟต์และเก็บได้ แม้ยังสวมใส่ไม่ได้</p>':''}${r.type==='gear'?'<p class="muted">สร้างชิ้นใหม่ทุกครั้ง · สุ่มเกรดและออฟชั่น · เก็บผลทุกชิ้น</p>':''}<div class="cost">${costHtml(ch,data,r.cost)}</div><p class="${block||!near?'muted':'ok'}">${!near?(field?'ออกจากการต่อสู้ก่อนแล้วค่อยคราฟต์ลูกธนู':'กลับโต๊ะคราฟต์ในนิคมเพื่อสร้างของ'):field?`ซองลูกธนู ${arrowTotal(ch)}/${data.items.arrows.capacity} · `:''}${!near?'':block?BLOCK[block]||block:`วัตถุดิบพออีก ${canMake(ch,r)} ครั้ง`}</p> <button class="btn primary craft-single" data-act="${field?'craft-arrows':'craft'}" data-id="${id}" ${block||!near?'disabled':''}>${block==='learned'?'เรียนแล้ว':items.length?'คราฟต์อีก 1 ชิ้น':'คราฟต์ 1 ครั้ง'}</button><div class="craft-status" role="status" aria-live="polite">${status||''}</div>${r.type==='gear'?gradeGuide(data)+craftGoal(ui,id,r,costHtml):''}${pool}</section><section class="craft-rolls" aria-label="ผลคราฟต์ ${esc(name)}"><div class="section-heading"><h3>ผลคราฟต์สูตรนี้</h3><span>${items.length?'แสดง '+items.length+' ชิ้นล่าสุด':''}</span></div><p class="muted">ของทุกชิ้นอยู่ในกระเป๋า · เลือกเทียบก่อนสวมใส่</p>${items.length?`<div class="craft-results">${items.map(item=>resultCard(ui,item)).join('')}</div>`:ui.lastResult?`<div class="result-pop" role="status">${ui.lastResult}</div>`:'<div class="inventory-empty"><p>ผลคราฟต์จะขึ้นที่นี่</p></div>'}</section></div></section>`;
 }
 const inCat=r=>r.type!=='gear'?r.type===cat:cat==='weapon'?['weapon','offhand'].includes(data.items.gearBases[r.result].slot):cat==='charm'?data.items.gearBases[r.result].slot==='charm':cat==='armor'&&['armor','helm','gloves','boots'].includes(data.items.gearBases[r.result].slot);
 const recipes=Object.entries(data.recipes.recipes).filter(([,r])=>inCat(r)).sort((a,b)=>compareCraftRecipes(data,a,b));
 const ready=recipes.filter(([id])=>!recipeBlocker(ch,data,id)).length;
 const visible=recipes.filter(([id])=>!ui.sel.craftReady||!recipeBlocker(ch,data,id));
 const query=ui.sel.craftSearch||'',matching=visible.filter(([id,r])=>craftQueryMatches(recipeSearchText(data,id,r),query));
 const stages=new Set(matching.filter(([,r])=>isSkill(r)).map(([,r])=>skillCraftGuide(data,r).stage));
 let lastStage=null;
 const rows=visible.map(([id,r])=>{
  const {def,kind,name}=info(data,r),block=recipeBlocker(ch,data,id),guide=isSkill(r)?skillCraftGuide(data,r):null;
  const desc=r.type==='gear'?Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):r.type==='arrow'?`ได้ ${r.qty} ลูก${Object.keys(def.stats).length?' · '+Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):''}`:craftDescription(data,r);
  const requires=r.type==='gear'?gearRequirements({base:r.result,itemLevel:r.itemLevel,grade:'C',upgrade:0,options:[]},data):r.type==='arrow'?{}:def.requires||{};
  const search=recipeSearchText(data,id,r),shown=craftQueryMatches(search,query),level=r.type==='gear'?recipeEquipmentLevel(data,r):null;
  let heading='';
  if(guide&&guide.stage!==lastStage){lastStage=guide.stage;const stage=CRAFT_STAGES[guide.stage],on=stages.has(guide.stage);heading=`<section data-craft-group="${guide.stage}" ${on?'':'hidden'} style="grid-column:1/-1;${on?'':'display:none'}"><div class="section-heading"><h3>${guide.stage+1}. ${stage.name}</h3></div><p class="muted">${stage.detail}</p></section>`;}
  return heading+`<section class="recipe-card card ${block?'':'ready'}" data-recipe-id="${id}" data-recipe-search="${esc(search)}" data-equipment-level="${level??''}" data-craft-stage="${guide?.stage??''}" ${shown?'':'hidden style="display:none"'}><button class="recipe-pick" data-act="craft-open" data-id="${id}" aria-label="เปิดหน้าคราฟต์ ${esc(name)}"><div class="recipe-hero">${pic(kind,r.result)}<div class="recipe-info">${level===null?'':`<span class="level-pill">Lv.${level}</span>`}<b>${esc(name)}</b><small>${esc(def.name)}</small><p class="muted">${esc(desc||'')}</p></div></div></button>${guideHtml(data,r)}${wearRequirements(ch,requires,r.type==='gear'?'รีเควสพื้นฐานตอนใส่':'รีเควสใช้งาน')}<div class="cost">${costHtml(ch,data,r.cost)}</div><div class="recipe-action"><small class="${block?'muted':'ok'}">${block?BLOCK[block]||block:'พร้อมคราฟต์'}</small><button class="btn primary" data-act="craft-open" data-id="${id}">เปิดหน้าคราฟต์</button></div></section>`;
 }).join('');
 const equipment=['weapon','armor','charm'].includes(cat),skills=cat==='skill'||cat==='movement';
 return `<div class="workbench-summary"><div><b>เลือกสิ่งที่ต้องการสร้าง</b><small>${equipment?'เรียงเลเวลอุปกรณ์จากต่ำไปสูง':skills?'เรียงตามวิธีใช้ · เป็นคำแนะนำ ไม่ใช่เงื่อนไขปลดล็อก':'แตะสูตรเพื่อเปิดหน้าคราฟต์ของชิ้นนั้น'}</small></div><button class="btn ${ui.sel.craftReady?'on':''}" data-act="craft-ready" aria-pressed="${!!ui.sel.craftReady}">คราฟต์ได้ ${ready}/${recipes.length}${ui.sel.craftReady?' · ดูทั้งหมด':' · กรอง'}</button></div><div class="switch">${filters.map(([id,label])=>`<button class="btn ${cat===id?'on':''}" data-act="craft-filter" data-id="${id}">${label}</button>`).join('')}</div><div class="seeker-node-search"><label style="display:block;width:100%">ค้นหาสูตรคราฟต์<input type="search" data-craft-search aria-label="ค้นหาสูตรคราฟต์" placeholder="ชื่อ บทบาท หรือวัตถุดิบ" value="${esc(query)}" style="width:100%;min-width:0"></label></div>${equipment?gradeGuide(data):''}<div class="recipe-grid">${rows}<div class="inventory-empty" data-craft-empty ${matching.length?'hidden':''} style="grid-column:1/-1;${matching.length?'display:none':''}"><p>ไม่พบสูตรที่ตรงกับการค้นหาและตัวกรอง · ล้างคำค้นหรือแตะดูทั้งหมด</p></div></div>`;
}
