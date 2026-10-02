// One reusable item workshop: choosing a recipe never crafts or spends anything.
import {art} from './art.js';
import {esc,tagsHtml,rulesHtml} from './buildmeta.js';
import {recipeBlocker} from '../core/crafting.js';
import {gearEquipState,gearRequirements} from '../core/character.js';
import {gradeGuide,craftGoal,wearRequirements} from './progressionview.js';

const BLOCK={materials:'วัตถุดิบหรือ Gold ไม่พอ',learned:'เรียนแล้ว',unknown:'ไม่พบสูตร'};
function info(data,r) {
 const def=r.type==='gear'?data.items.gearBases[r.result]:r.type==='mod'?data.mods.mods[r.result]:r.type==='movement'?data.skills.movement[r.result]:data.skills.combat[r.result];
 return {def,kind:r.type==='gear'?'gear':r.type==='mod'?'mod':'skill',name:def.nameTh};
}
function canMake(ch,r) {
 return Math.max(0,Math.min(...Object.entries(r.cost).map(([key,n])=>Math.floor((key==='gold'?ch.gold:ch.materials[key]||0)/n))));
}
function resultCard(ui,item) {
 const {ch,data}=ui.game,base=data.items.gearBases[item.base],state=gearEquipState(ch,data,item),equipped=ch.equipped[base.slot]===item.uid;
 return `<section class="craft-result grade-${item.grade}" data-crafted-uid="${item.uid}">${art('gear',item.base)}${ui.gearLine(item)}<div class="craft-result-actions"><button class="btn" data-act="inspect-crafted" data-uid="${item.uid}">ดูและเทียบของที่สวม</button>${equipped?'<span class="equipped-label">✓ สวมใส่อยู่</span>':`<button class="btn" data-act="equip-gear" data-uid="${item.uid}" ${state.ok?'':'disabled'}>${state.ok?'สวมใส่ชิ้นนี้':'สเตตัสยังไม่ถึง'}</button>`}</div></section>`;
}
export function craftView(ui,{costHtml,effectText,filters}) {
 const g=ui.game,{ch,data}=g,cat=ui.sel.craft,id=ui.sel.craftRecipe,r=data.recipes.recipes[id];
 if(r) {
  const {def,kind,name}=info(data,r),block=recipeBlocker(ch,data,id),near=g.nearby().workbench;
  const uids=ui.sel.craftHistory?.[id]||[],items=uids.map(uid=>ch.gear.find(it=>it.uid===uid)).filter(Boolean),status=ui.sel.craftStatus?.[id];
  const desc=r.type==='gear'?Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):def.desc;
  const types=r.type==='mod'?rulesHtml(def):def.tags?tagsHtml(def.tags):'';
  const pool=r.type==='gear'?`<details class="recipe-affixes"><summary>ดูออฟชั่นที่สุ่มได้ · ${r.optionPool.length} แบบ</summary>${r.optionPool.map(o=>`<p>${data.items.gearOptions[o].labelTh.replace('{v}',data.items.gearOptions[o].min+'–'+data.items.gearOptions[o].max)}</p>`).join('')}</details>`:'';
  return `<section class="craft-workspace" data-recipe="${id}" aria-label="คราฟต์ ${esc(name)}"><div class="craft-detail-heading"><button class="btn" data-act="craft-back">← เปลี่ยนสูตร</button><span class="muted">โต๊ะคราฟต์ · ${esc(name)}</span></div><div class="craft-detail-layout"><section class="craft-controls card"><div class="recipe-hero">${art(kind,r.result)}<div><h3 class="craft-detail-title" tabindex="-1">${esc(name)}</h3><small>${esc(def.name)}</small></div></div><p class="muted">${esc(desc||'')}</p>${types}${r.type==='gear'?'<p class="muted">สร้างชิ้นใหม่ทุกครั้ง · สุ่มเกรดและออฟชั่น · เก็บผลทุกชิ้น</p>':''}<div class="cost">${costHtml(ch,data,r.cost)}</div><p class="${block||!near?'muted':'ok'}">${!near?'กลับโต๊ะคราฟต์ในนิคมเพื่อสร้างของ':block?BLOCK[block]||block:`วัตถุดิบพออีก ${canMake(ch,r)} ครั้ง`}</p><button class="btn primary craft-single" data-act="craft" data-id="${id}" ${block||!near?'disabled':''}>${block==='learned'?'เรียนแล้ว':items.length?'คราฟต์อีก 1 ชิ้น':'คราฟต์ 1 ครั้ง'}</button><div class="craft-status" role="status" aria-live="polite">${status||''}</div>${r.type==='gear'?gradeGuide(data)+craftGoal(ui,id,r,costHtml):''}${pool}</section><section class="craft-rolls" aria-label="ผลคราฟต์ ${esc(name)}"><div class="section-heading"><h3>ผลคราฟต์สูตรนี้</h3><span>${items.length?'แสดง '+items.length+' ชิ้นล่าสุด':''}</span></div><p class="muted">ของทุกชิ้นอยู่ในกระเป๋า · เลือกเทียบก่อนสวมใส่</p>${items.length?`<div class="craft-results">${items.map(item=>resultCard(ui,item)).join('')}</div>`:ui.lastResult?`<div class="result-pop" role="status">${ui.lastResult}</div>`:'<div class="inventory-empty"><p>ผลคราฟต์จะขึ้นที่นี่</p></div>'}</section></div></section>`;
 }
 const inCat=r=>r.type!=='gear'?r.type===cat:cat==='weapon'?data.items.gearBases[r.result].slot==='weapon':cat==='charm'?data.items.gearBases[r.result].slot==='charm':cat==='armor'&&['armor','helm','boots'].includes(data.items.gearBases[r.result].slot);
 const recipes=Object.entries(data.recipes.recipes).filter(([,r])=>inCat(r)),ready=recipes.filter(([id])=>!recipeBlocker(ch,data,id)).length;
 const rows=recipes.filter(([id])=>!ui.sel.craftReady||!recipeBlocker(ch,data,id)).sort(([a],[b])=>Number(!!recipeBlocker(ch,data,a))-Number(!!recipeBlocker(ch,data,b))).map(([id,r])=>{
  const {def,kind,name}=info(data,r),block=recipeBlocker(ch,data,id);
  const desc=r.type==='gear'?Object.entries(def.stats).map(([k,v])=>effectText(k,v)).join(' · '):def.desc;
  const requires=r.type==='gear'?gearRequirements({base:r.result,grade:'C',upgrade:0,options:[]},data):def.requires||{};
  return `<section class="recipe-card card ${block?'':'ready'}"><button class="recipe-pick" data-act="craft-open" data-id="${id}" aria-label="เปิดหน้าคราฟต์ ${esc(name)}"><div class="recipe-hero">${art(kind,r.result)}<div class="recipe-info"><b>${esc(name)}</b><small>${esc(def.name)}</small><p class="muted">${esc(desc||'')}</p></div></div></button>${wearRequirements(ch,requires,r.type==='gear'?'รีเควสพื้นฐานตอนใส่':'รีเควสใช้งาน')}<div class="cost">${costHtml(ch,data,r.cost)}</div><div class="recipe-action"><small class="${block?'muted':'ok'}">${block?BLOCK[block]||block:'พร้อมคราฟต์'}</small><button class="btn primary" data-act="craft-open" data-id="${id}">เปิดหน้าคราฟต์</button></div></section>`;
 }).join('');
 return `<div class="workbench-summary"><div><b>เลือกสิ่งที่ต้องการสร้าง</b><small>แตะสูตรเพื่อเปิดหน้าคราฟต์ของชิ้นนั้น แล้วกดสร้างซ้ำได้ทันที</small></div><button class="btn ${ui.sel.craftReady?'on':''}" data-act="craft-ready" aria-pressed="${!!ui.sel.craftReady}">คราฟต์ได้ ${ready}/${recipes.length}${ui.sel.craftReady?' · ดูทั้งหมด':' · กรอง'}</button></div><div class="switch">${filters.map(([id,label])=>`<button class="btn ${cat===id?'on':''}" data-act="craft-filter" data-id="${id}">${label}</button>`).join('')}</div>${['weapon','armor','charm'].includes(cat)?gradeGuide(data):''}<div class="recipe-grid">${rows||'<div class="inventory-empty"><p>ยังไม่มีสูตรที่คราฟต์ได้ · แตะดูทั้งหมดเพื่อตรวจวัตถุดิบ</p></div>'}</div>`;
}
