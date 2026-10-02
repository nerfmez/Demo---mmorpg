// Shared progression language for the bag, workbench and skill growth.
import { computeSkill } from '../core/skills.js';
import { derive, gearRequirements } from '../core/character.js';
import { esc, tagsHtml } from './buildmeta.js';

export function gradeBadge(data, grade, count = data.items.grades.optionCount[grade], compact = false) {
 const g=data.items.grades;
 return `<span class="grade-badge grade-${grade}" style="--grade-color:${g.colors[grade]}"><b>${grade}</b>${compact?'':`<span>${g.names[grade]}</span>`}<span class="affix-pips" aria-hidden="true">${Array.from({length:Math.max(...Object.values(g.optionCount))},(_,i)=>`<i class="${i<count?'filled':''}"></i>`).join('')}</span><small>${count} ออฟชั่น</small></span>`;
}
export function gradeGuide(data) {
 const g=data.items.grades,total=Object.values(g.weights).reduce((a,b)=>a+b,0);
 return `<div class="grade-guide">${g.order.map(grade=>`<div>${gradeBadge(data,grade)}<small>โอกาส ${Math.round(g.weights[grade]/total*100)}%</small></div>`).join('')}</div><p class="muted">เกรดเพิ่มจำนวนออฟชั่น · ตีบวกเพิ่มเฉพาะค่าพื้นฐาน · คราฟต์แต่ละครั้งสุ่มใหม่</p>`;
}
export function optionList(data, options) {
 return `<div class="affix-list">${options.map(o=>{const def=data.items.gearOptions[o.id],quality=def.max===def.min?1:(o.value-def.min)/(def.max-def.min);return `<div class="affix-row"><span>${esc(def.labelTh.replace('{v}',o.value))}${def.tags?tagsHtml(def.tags,'option'):''}</span><small>ช่วง ${def.min}–${def.max}</small><meter min="0" max="1" value="${quality}" aria-label="คุณภาพออฟชั่น ${Math.round(quality*100)} เปอร์เซ็นต์"></meter></div>`;}).join('')||'<p class="muted">ไม่มีออฟชั่น · เลื่อนเกรดเพื่อเพิ่มได้</p>'}</div>`;
}
export function upgradeTrack(levels, completed, prefix='Lv.',first=1) {
 return `<ol class="upgrade-track">${levels.map((level,i)=>`<li class="${i<completed?'done':i===completed?'next':''}"><b>${prefix}${i+first}</b><small>ตัวละคร Lv.${level}</small></li>`).join('')}</ol>`;
}
export function wearRequirements(ch, requires, label='รีเควสสวมใส่') {
 return `<div class="gear-requires"><b>${label}</b>${Object.entries(requires).map(([stat,need])=>`<span class="${ch.stats[stat]>=need?'ok':'no'}" data-required-stat="${stat}" data-need="${need}">${stat} ${ch.stats[stat]}/${need}</span>`).join('')}</div>`;
}
export function wearRequirementRange(ch, preview) {
 return `<div class="gear-requires"><b>รีเควสหลังเลื่อนเกรด</b>${Object.entries(preview.maxRequires).map(([stat,max])=>`<span class="${ch.stats[stat]>=max?'ok':'no'}">${stat} ${preview.minRequires[stat]===max?max:preview.minRequires[stat]+'–'+max} · มี ${ch.stats[stat]}</span>`).join('')}</div><small>รีเควสจริงขึ้นกับออฟชั่นใหม่ที่สุ่มได้</small>`;
}
export function gearUpgradeTrack(data, item) {
 return `<ol class="upgrade-track">${Array.from({length:data.items.upgrade.max},(_,i)=>`<li class="${i<item.upgrade?'done':i===item.upgrade?'next':''}"><b>+${i+1}</b><small>${Object.entries(gearRequirements({...item,upgrade:i+1},data)).map(([stat,n])=>stat+' '+n).join(', ')}</small></li>`).join('')}</ol>`;
}
export function stateText(state) {
 if(state.ok)return 'พร้อมอัปเกรด';
 return state.reason==='level'?`ต้องมีตัวละคร Lv.${state.need}`:state.reason==='requires'?`ต้องมี ${state.missing.join(', ')}`:state.reason==='max'?'ระดับสูงสุด':state.reason==='materials'?'วัตถุดิบหรือ Gold ไม่พอ':'ยังอัปเกรดไม่ได้';
}
export function skillGrowthPreview(ch,data,id,describe) {
 const derived=derive(ch,data),owned=ch.slots.findIndex(s=>s.skill===id),slot=owned<0?ch.slots.length:owned;
 const view=owned<0?{...ch,slots:[...ch.slots,{skill:id,mods:[]}]}:ch;
 const before=computeSkill(view,data,derived,slot),after=computeSkill({...view,skills:{...view.skills,[id]:ch.skills[id]+1}},data,derived,slot);
 return `<div class="growth-preview"><div><small>ตอนนี้</small><p>${describe(before)}</p></div><span>→</span><div><small>หลังอัป</small><p>${describe(after)}</p></div></div><p class="muted">MP ${before.cost.toFixed(1)} → ${after.cost.toFixed(1)} · คูลดาวน์ ${before.cooldown.toFixed(2)} วิ</p>`;
}
const MOD_EFFECTS={extraProjectiles:'กระสุนเพิ่ม',pierce:'ทะลุเป้า',chain:'เด้งเพิ่ม',damageMult:'ตัวคูณดาเมจ',groundDps:'พลังไฟพื้น',echoMult:'พลังร่ายซ้ำ',arcAdd:'มุมฟันเพิ่ม',rangeAdd:'ระยะเพิ่ม',repeatMult:'พลังฟันซ้ำ',chillSlow:'ชะลอ',knock:'ระยะกระเด็น',durationMult:'ตัวคูณเวลาพื้นที่',leechPct:'ดูดเลือด %',manaOnHit:'มานาคืนเมื่อโจมตีโดน',reflect:'สะท้อน',summonDamage:'พลังอัญเชิญเพิ่ม',internalCooldown:'คูลดาวน์ทริกเกอร์'};
export function modGrowthPreview(def,level) {
 return `<div class="mod-growth-preview">${Object.entries(def.effect).filter(([,v])=>Array.isArray(v)&&v[level]!==v[level-1]).map(([k,v])=>`<p>${MOD_EFFECTS[k]||'พลังม็อด'} <b>${v[level-1]} → ${v[level]}</b></p>`).join('')}</div>`;
}
export function craftGoal(ui,id,recipe,costHtml) {
 const {ch,data}=ui.game,goal=ui.sel.craftGoals?.[id]||{attempts:5,grade:'A',option:'',quality:0};
 const select=(field,label,entries)=>`<label>${label}<select data-batch-select="${id}" data-field="${field}">${entries.map(([value,text])=>`<option value="${value}" ${String(goal[field])===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;
 const maxCost=Object.fromEntries(Object.entries(recipe.cost).map(([key,count])=>[key,count*goal.attempts]));
 return `<details class="craft-repeat" data-craft-repeat="${id}" ${ui.sel.craftRepeatOpen?.[id]?'open':''}><summary>คราฟต์ซ้ำหาออฟชั่น · สูงสุด ${goal.attempts} ครั้ง</summary><div class="craft-goals">${select('attempts','จำนวนสูงสุด',data.items.crafting.batchSizes.map(n=>[n,n+' ครั้ง']))}${select('grade','หยุดเมื่อเกรดถึง',[['','ไม่กำหนด'],...data.items.grades.order.map(g=>[g,g+' ขึ้นไป'])])}${select('option','ออฟชั่นที่ต้องการ',[['','ไม่กำหนด'],...recipe.optionPool.map(o=>[o,data.items.gearOptions[o].labelTh.replace('{v}','')])])}${select('quality','คุณภาพออฟชั่นขั้นต่ำ',[[0,'ทุกค่า'],[.5,'ครึ่งบนของช่วง'],[.8,'20% บนของช่วง']])}</div><p>หยุดเมื่อได้ครบเงื่อนไข หรือวัตถุดิบหมด · เก็บผลทุกชิ้น</p><small>งบสูงสุด ${goal.attempts} ครั้ง · จ่ายเฉพาะครั้งที่ทำจริง</small><div class="cost">${costHtml(ch,data,maxCost)}</div><button class="btn" data-act="craft-batch" data-id="${id}" ${ui.game.nearby().workbench?'':'disabled'}>เริ่มคราฟต์ซ้ำ สูงสุด ${goal.attempts} ครั้ง</button></details>`;
}
