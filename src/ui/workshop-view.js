// Dedicated full-screen workshop. Existing artwork, recipe ordering and crafting rules are reused.
import { art, arrowArt } from './art.js';
import { icon } from './icons.js';
import { esc, tagsHtml, rulesHtml } from './buildmeta.js';
import { gradeBadge, optionList, wearRequirements, wearRequirementRange, craftGoal } from './progressionview.js';
import { gearStats, gearRequirements, gearEquipState, wornSlot } from '../core/character.js';
import { recipeBlocker } from '../core/crafting.js';
import { equipmentItemLevel } from '../core/item-metadata.js';
import { CRAFT_STAGES, compareCraftRecipes, recipeDefinition, recipeEquipmentLevel, skillCraftGuide, craftDescription, recipeSearchText, craftQueryMatches } from '../core/craft-order.js';
import { forgePreview, forgeItems, workshopCostRows, workshopReason } from './workshop-model.js';
import './workshop.css';

const n = value => Number(value || 0).toLocaleString('en', { maximumFractionDigits: 1 });
const isSkill = recipe => ['skill', 'movement'].includes(recipe.type);
const picture = (type, id) => type === 'arrow' ? arrowArt(id) : art(type === 'movement' ? 'skill' : type, id);
const recipeKind = recipe => recipe.type === 'gear' ? 'gear' : recipe.type === 'mod' ? 'mod' : recipe.type === 'arrow' ? 'arrow' : 'skill';
const stepLabel = item => `${item.grade} · +${item.upgrade}`;

function costs(game, cost, spent = false) {
  if (!cost) return '<div class="ws-empty">ไม่มีค่าใช้จ่ายเพิ่ม · ถึงขั้นสูงสุดแล้ว</div>';
  return `<div class="ws-costs" aria-label="วัตถุดิบและค่าใช้จ่าย">${workshopCostRows(game, cost).map(row => `<div class="ws-cost ${!spent && row.missing ? 'is-missing' : ''}" data-material="${esc(row.id)}"><span class="ws-cost-art">${row.id === 'gold' ? '<span class="ws-gold">G</span>' : art('material', row.id)}</span><span><b>${esc(row.name)}</b><small>${spent ? 'จ่ายแล้ว ' + n(row.need) : row.missing ? 'ขาดอีก ' + n(row.missing) : 'เพียงพอ'}</small></span><strong>${spent ? n(row.need) : n(row.have) + '<i> / ' + n(row.need) + '</i>'}</strong></div>`).join('')}</div>`;
}
function comparison(before, after, effectText, caption) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return `<section class="ws-comparison"><h3>${caption}</h3><table><thead><tr><th>ค่าสถานะ</th><th>ปัจจุบัน</th><th>หลังอัป</th><th>เพิ่มขึ้น</th></tr></thead><tbody>${keys.map(key => {
    const a = before[key] || 0, b = after[key] || 0, delta = Math.round((b - a) * 10) / 10;
    const label = effectText(key, 0).replace(/\s*[+]?0$/, '');
    return `<tr><th>${esc(label)}</th><td>${n(a)}</td><td><b>${n(b)}</b></td><td class="${delta === 0 ? '' : (key === 'damageTakenPct' ? delta < 0 : delta > 0) ? 'ws-positive' : 'ws-negative'}">${delta ? (delta > 0 ? '+' : '') + n(delta) : '—'}</td></tr>`;
  }).join('')}</tbody></table></section>`;
}
// Fixed cosmetic trajectories: no game RNG, allocations per frame or gameplay callbacks.
const metalSparks = [[-36,-22,-145],[-23,-38,-120],[-7,-43,-99],[16,-37,-66],[34,-23,-34],[41,-5,-7],[-39,-3,-177],[23,-12,-27]]
  .map(([x,y,angle]) => `<path class="ws-metal-spark" d="M0 0H4" style="--spark-x:${x}px;--spark-y:${y}px;--spark-angle:${angle}deg"/>`).join('');
// One orthographic side elevation. The face rests on the blank's y=144 plane;
// the handle rotates about its fixed grip (248,78), not a moving icon anchor.
// Item artwork is a separate identity thumbnail, never the physical strike target.
const workshopScene = `<svg class="ws-forge-scene" viewBox="0 0 320 210" fill="none" aria-hidden="true">
 <path d="M55 196H266" stroke="#9aab9d" stroke-opacity=".3"/>
 <path d="M38 153H219V164H194L178 178V187H204V196H108V187H136V178L115 166H82Z" fill="#657b7d" stroke="#acc0b9" stroke-width="1.5" stroke-linejoin="round"/>
 <path d="M83 154H218V160H84Z" fill="#a4b4ae"/>
 <path d="M137 178H178V187H137Z" fill="#425d62"/>
 <path d="M111 190H201" stroke="#91a49b" stroke-width="2"/>
 <path d="M118 144H170V152H118Z" fill="#b69368" stroke="#e0c595" stroke-width="1"/>
 <path data-workpiece-plane d="M118 144H170" stroke="#f0d9ac" stroke-width="1.5"/>
 <g class="ws-hammer">
  <path d="M143 130L248 78" stroke="#705334" stroke-width="10" stroke-linecap="round"/>
  <path d="M145 127L248 76" stroke="#c89959" stroke-width="5" stroke-linecap="round"/>
  <path d="M227 81L232 89M233 78L238 86M239 75L244 83" stroke="#76543b" stroke-width="2"/>
  <circle data-hammer-grip cx="248" cy="78" r="4" fill="#bb8c51"/>
  <path d="M130 119H158V144H130Z" fill="#8d9e9f" stroke="#d4dfdb" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M132 121H156V126H132Z" fill="#d5dfd9"/>
  <path d="M132 136H156V143H132Z" fill="#526d75"/>
  <path data-hammer-face d="M130 144H158" stroke="#e0e6dc" stroke-width="1.5"/>
 </g>
 <g class="ws-impact" data-impact-origin transform="translate(144 144)">
  <g class="ws-spark"><circle r="9" fill="#f5bb6c" fill-opacity=".5"/><circle r="4" fill="#fff8dd"/></g>
  <path class="ws-wave" d="M-12 0A12 12 0 0 1 12 0" stroke="#f6c580" stroke-width="1"/>
  ${metalSparks}
 </g>
</svg>`;
function stage({ graphic, name, meta, from, to, busy, kind, grade }) {
  return `<section class="ws-stage ${busy ? 'is-working' : ''}" data-workshop-stage data-mode="${kind}" ${grade ? `data-grade="${esc(grade)}"` : ''} aria-label="ชิ้นงานที่เลือก"><div class="ws-stage-top"><span>${busy ? 'กำลังแสดงผล' : kind === 'craft' ? 'สร้างชิ้นใหม่' : 'ชิ้นงานที่เลือก'}</span><small>${esc(meta)}</small></div><div class="ws-pedestal">${workshopScene}</div><div class="ws-stage-identity"><span class="ws-item-art">${graphic}</span><h2>${esc(name)}</h2></div><div class="ws-ranks"><span>${esc(from)}</span>${to ? `<i aria-hidden="true">→</i><strong>${esc(to)}</strong>` : ''}</div><p>${busy ? 'ผลถูกบันทึกแล้ว · ปิดหน้าได้โดยของไม่หาย' : kind === 'craft' ? 'สุ่มเฉพาะตอนยืนยัน · ดูสูตรไม่เสียทรัพยากร' : 'ตรวจค่าสถานะและวัตถุดิบก่อนยืนยัน'}</p></section>`;
}
function receiptView(ui) {
  const c = ui.workshop, r = c?.receipt;
  if (c?.error) return `<div class="ws-notice is-error" role="alert">${esc(c.error)}</div>`;
  if (!r) return '<section class="ws-notice is-ready"><span class="ws-result-mark" aria-hidden="true">◇</span><div><b>เลือกชิ้นงานและตรวจวัตถุดิบ</b><small>ยืนยันเมื่อพร้อม · ดูรายการได้โดยไม่เสียทรัพยากร</small></div></section>';
  const busy = c.busy;
  let text;
  if (r.action === 'gear-up') text = `ตีบวกสำเร็จ +${r.before.upgrade} → +${r.items[0].upgrade}`;
  else if (r.action === 'gear-grade') text = `เลื่อนเกรดสำเร็จ ${r.before.grade} → ${r.items[0].grade}`;
  else if (r.kind === 'gear') text = `คราฟต์สำเร็จ ${r.items.length} ชิ้น · เก็บทุกชิ้นในกระเป๋าแล้ว`;
  else { const recipe = ui.game.data.recipes.recipes[r.recipeId]; const def = recipe && recipeDefinition(ui.game.data, recipe); text = `สร้างสำเร็จ · ${def?.nameTh || 'ได้รับแล้ว'}${r.qty ? ' × ' + n(r.qty) : ''}`; }
  const putsAway = (r.unequipped || []).map(v => {
    const item = ui.game.ch.gear.find(it => it.uid === v.uid);
    return item && ui.game.data.items.gearBases[item.base].nameTh;
  }).filter(Boolean);
  return `<section class="ws-notice ${busy ? 'is-pending' : 'is-success'}" role="status" aria-live="polite" data-workshop-result><span class="ws-result-mark" aria-hidden="true">${busy ? '◇' : '✓'}</span><div><b>${busy ? 'ทำรายการแล้ว · กำลังแสดงผล' : esc(text)}</b><small>${putsAway.length ? 'ถอดเก็บในกระเป๋าเพราะเงื่อนไขสวมใส่: ' + esc(putsAway.join(', ')) : 'ไม่สูญหายเมื่อปิดหน้า · ไม่มีการหักซ้ำระหว่างอนิเมชัน'}</small></div>${busy ? '<button class="ws-subtle" data-act="workshop-skip">ข้ามอนิเมชัน</button>' : ''}</section>`;
}
function shell(ui, mode, content) {
  const game = ui.game, near = game.nearby().workbench;
  return `<div class="workshop" data-workshop="${mode}"><header class="ws-heading"><div><span class="ws-eyebrow">SEEKER / WORKSHOP</span><h1>โรงช่างนักเดินทาง</h1><p>สร้างของใหม่ · พัฒนาของที่ผูกพัน</p></div><div class="ws-location ${near ? 'is-near' : ''}"><i aria-hidden="true"></i><span>${near ? 'อยู่ใกล้โต๊ะคราฟต์' : 'ดูและเปรียบเทียบได้ทุกที่'}</span><small>${near ? 'พร้อมสร้างและพัฒนาอุปกรณ์' : 'กลับโต๊ะคราฟต์เมื่อต้องการทำรายการ'}</small></div></header><nav class="ws-modes" aria-label="งานของโรงช่าง">${[['craft','hammer','คราฟต์','สร้างชิ้นใหม่'],['upgrade','spark','ตีบวก','เพิ่มค่าพื้นฐาน'],['grade','gear','เลื่อนเกรด','เพิ่มช่องออฟชั่น']].map(([id, glyph, label, sub]) => `<button data-act="workshop-page" data-id="${id}" aria-pressed="${mode === id}">${icon(glyph)}<span><b>${label}</b><small>${sub}</small></span>${mode === id ? '<i aria-hidden="true">◆</i>' : ''}</button>`).join('')}</nav>${receiptView(ui)}${content}</div>`;
}
function selection(ui, selected, list) {
  const { game, sel } = ui, { data, ch } = game, query = sel.forgeSearch || '';
  const slots = [['all', 'ทั้งหมด'], ...data.items.slots.map(id => [id, data.items.slotNames[id]])];
  const matches = item => craftQueryMatches((data.items.gearBases[item.base].nameTh + ' ' + data.items.gearBases[item.base].name + ' ' + item.uid + ' lv.' + equipmentItemLevel(data, item)).normalize('NFKC').toLocaleLowerCase('th'), query);
  return `<aside class="ws-collection"><div class="ws-section-label"><b>01</b><h2>เลือกอุปกรณ์</h2><small>${list.length} ชิ้น</small></div><label class="ws-search"><span>ค้นหาอุปกรณ์</span><input type="search" data-forge-search value="${esc(query)}" placeholder="ชื่ออุปกรณ์ / หมายเลข" aria-label="ค้นหาอุปกรณ์"></label><div class="ws-filter">${slots.map(([id,label]) => `<button data-act="forge-filter" data-id="${id}" aria-pressed="${(sel.forgeSlot || 'all') === id}" ${ui.workshop?.busy ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div><div class="ws-gear-list">${list.map(item => {
    const base = data.items.gearBases[item.base], search = `${base.nameTh} ${base.name} ${item.uid} lv.${equipmentItemLevel(data,item)}`.normalize('NFKC').toLocaleLowerCase('th');
    return `<button class="ws-gear ${item.uid === selected?.uid ? 'is-selected' : ''}" data-forge-choice data-forge-search="${esc(search)}" data-act="forge-item" data-uid="${item.uid}" aria-pressed="${item.uid === selected?.uid}" ${matches(item)?'':'hidden'} ${ui.workshop?.busy ? 'disabled' : ''}><span class="ws-thumb">${art('gear', item.base)}</span><span><b>${esc(base.nameTh)}</b><small>Lv.${equipmentItemLevel(data,item)} · ${esc(data.items.slotNames[base.slot])} · #${item.uid}</small><em>${wornSlot(ch,data,item) ? 'สวมใส่อยู่' : item.locked ? 'ล็อกกันขาย/ย่อย' : 'ในกระเป๋า'}</em></span><strong>${item.grade}<small>+${item.upgrade}</small></strong></button>`;
  }).join('')}<p class="ws-empty" data-forge-empty ${list.some(matches)?'hidden':''}>ไม่พบอุปกรณ์ที่ตรงกับคำค้น</p></div></aside>`;
}
function forge(ui, { effectText }) {
  const mode = ui.sel.forgeMode === 'grade' ? 'grade' : 'upgrade', { game } = ui, { ch, data } = game;
  const list = forgeItems(game, ui.sel.forgeSlot || 'all');
  const item = list.find(it => it.uid === ui.sel.forgeUid) || list[0];
  const left = selection(ui, item, list);
  if (!item) return shell(ui, mode, `<div class="ws-layout">${left}<div class="ws-empty ws-empty-main"><h2>ยังไม่มีอุปกรณ์ในหมวดนี้</h2><p>เลือกหมวดอื่น หรือคราฟต์ชิ้นใหม่ก่อนนำมาพัฒนา</p><button class="ws-button" data-act="workshop-page" data-id="craft">ไปหน้าคราฟต์</button></div></div>`);
  const p = forgePreview(game, item.uid, mode), r = ui.workshop?.receipt;
  const busy = !!ui.workshop?.busy, isReceipt = r?.items?.[0]?.uid === item.uid && r.action === (mode === 'grade' ? 'gear-grade' : 'gear-up');
  const showing = busy && isReceipt ? r.before : item;
  const next = busy && isReceipt ? r.items[0] : p.next;
  const base = data.items.gearBases[item.base];
  const workStage = stage({ graphic: art('gear', item.base), name: base.nameTh, meta: `Lv.${equipmentItemLevel(data,item)} · #${item.uid}`, from: mode === 'grade' ? showing.grade : '+' + showing.upgrade, to: next ? (mode === 'grade' ? next.grade : '+' + next.upgrade) : '', busy, kind: mode, grade: showing.grade });
  const before = busy && isReceipt ? gearStats(mode === 'grade' ? {...showing,options:[]} : showing,data) : p.before;
  const after = busy && isReceipt ? gearStats(mode === 'grade' ? {...next,options:[]} : next,data) : p.after;
  const warning = p.unequipped.length ? '<p class="ws-warning">⚠ อัปแล้วเงื่อนไขสวมใส่เปลี่ยน · อุปกรณ์ที่สวมไม่ผ่านจะถอดเก็บในกระเป๋า ไม่หาย</p>' : !p.wearableAfter ? '<p class="ws-warning">⚠ อัปเกรดได้ แต่ตัวละครยังสวมผลลัพธ์ไม่ได้</p>' : '';
  const req = p.requirements ? mode === 'grade' ? wearRequirementRange(ch,p.requirements) + '<p class="ws-footnote">ถืออาวุธคู่ใช้เงื่อนไขรวมของสองมือ · ผลสุ่มอาจทำให้ต้องถอดเก็บ</p>' : wearRequirements(ch,p.requirements.afterRequires,'เงื่อนไขชิ้นนี้หลังตีบวก') : wearRequirements(ch,gearRequirements(item,data));
  const mechanics = mode === 'grade' ? `เก็บออฟชั่นเดิมทุกค่า และสุ่มเพิ่ม ${p.extraOptions} ช่อง · ไม่เปลี่ยนระดับตีบวก` : 'เพิ่มค่าพื้นฐานของชิ้นเดิม · เกรดและออฟชั่นเดิมไม่เปลี่ยน';
  const status = !p.state.cost ? 'ถึงขั้นสูงสุดแล้ว' : p.ok ? 'พร้อมทำรายการ' : workshopReason(p.reason);
  const to = mode === 'grade' ? p.next?.grade : '+' + p.next?.upgrade;
  const CTA = !p.state.cost ? 'พัฒนาถึงขั้นสูงสุด' : (mode === 'grade' ? 'เลื่อนเกรดเป็น ' : 'ตีบวกเป็น ') + to;
  return shell(ui, mode, `<div class="ws-layout">${left}<main class="ws-detail" data-forge-detail><div class="ws-section-label"><b>02</b><h2>ตรวจผลการพัฒนา</h2><small>${mode === 'grade'?'เกรด ≠ ตีบวก':'สำเร็จแน่นอนตามกฎเดิม'}</small></div>${workStage}${comparison(before,after,effectText,mode==='grade'?'ค่าพื้นฐาน · ยังไม่รวมออฟชั่นสุ่มใหม่':'ค่าสถานะก่อน–หลัง')}<details class="ws-options"><summary>ออฟชั่นเดิม · ${item.options.length} ช่อง</summary>${optionList(data,item.options)}</details><div class="ws-requirements">${req}${warning}</div></main><aside class="ws-order"><div class="ws-section-label"><b>03</b><h2>เตรียมวัตถุดิบ</h2></div><p class="ws-order-note">${mechanics}</p>${costs(game,busy&&isReceipt?r.spent:p.state.cost,busy&&isReceipt)}${!busy?warning:''}<div class="ws-confirm"><p class="ws-readiness ${p.ok?'is-ready':''}" data-forge-status>${busy?'ทำรายการแล้ว · กำลังแสดงผล':status}</p><button class="ws-button" data-act="${mode==='grade'?'gear-grade':'gear-up'}" data-uid="${item.uid}" ${!p.ok||busy?'disabled':''}>${busy?'กำลังแสดงผล…':CTA}</button><small>ไม่มีการล้มเหลวหรือตีแตก · หักค่าใช้จ่ายเฉพาะเมื่อยืนยัน</small></div></aside></div>`);
}
function recipeList(ui, helpers) {
  const { ch, data } = ui.game, cat = ui.sel.craft || 'weapon', query = ui.sel.craftSearch || '';
  const inCat = r => r.type !== 'gear' ? r.type === cat : cat === 'weapon' ? ['weapon','offhand'].includes(data.items.gearBases[r.result].slot) : cat === 'charm' ? data.items.gearBases[r.result].slot === 'charm' : cat === 'armor' && ['armor','helm','gloves','boots'].includes(data.items.gearBases[r.result].slot);
  const recipes = Object.entries(data.recipes.recipes).filter(([,r])=>inCat(r)).sort((a,b)=>compareCraftRecipes(data,a,b));
  const ready = recipes.filter(([id])=>!recipeBlocker(ch,data,id)).length;
  const visible = recipes.filter(([id])=>!ui.sel.craftReady||!recipeBlocker(ch,data,id));
  const matching = visible.filter(([id,r])=>craftQueryMatches(recipeSearchText(data,id,r),query));
  let last = null;
  const cards = visible.map(([id,r])=>{
    const def = recipeDefinition(data,r), level = r.type==='gear'?recipeEquipmentLevel(data,r):null;
    const guide = isSkill(r)?skillCraftGuide(data,r):null, search = recipeSearchText(data,id,r), match = craftQueryMatches(search,query), block=recipeBlocker(ch,data,id);
    let heading='';
    if(guide&&guide.stage!==last){last=guide.stage;heading=`<header class="ws-craft-group" data-craft-group="${last}" ${matching.some(([,r])=>skillCraftGuide(data,r).stage===last)?'':'hidden'}><span>0${last+1}</span><h3>${CRAFT_STAGES[last].name}</h3><p>${CRAFT_STAGES[last].detail}</p></header>`;}
    const desc = r.type==='gear'?Object.entries(def.stats).slice(0,2).map(([k,v])=>helpers.effectText(k,v)).join(' · '):craftDescription(data,r);
    return heading+`<article class="ws-recipe recipe-card ${block?'':'ready'}" data-recipe-id="${id}" data-recipe-search="${esc(search)}" data-equipment-level="${level??''}" data-craft-stage="${guide?.stage??''}" ${match?'':'hidden'}><button class="ws-recipe-pick" data-act="craft-open" data-id="${id}"><span class="ws-recipe-art">${picture(recipeKind(r),r.result)}</span><span><small>${level!==null?'Lv.'+level:guide?.roleName||'สูตรคราฟต์'}</small><h3>${esc(def.nameTh)}</h3><em>${esc(def.name)}</em></span><i aria-hidden="true">↗</i></button><p class="ws-recipe-desc">${esc(desc||'')}</p>${guide?`<small class="ws-guide" data-craft-guide>${esc(guide.playstyle)} · ${esc(guide.condition)}</small>`:''}<footer><span class="ws-parts">${Object.entries(r.cost).filter(([id])=>id!=='gold').slice(0,3).map(([id,qty])=>`<span title="${esc(data.items.materials[id].nameTh)}">${art('material',id)}<b>${qty}</b></span>`).join('')}</span><span class="ws-recipe-state ${block?'':'is-ready'}">${block==='learned'?'เรียนแล้ว':block==='full'?'ซองเต็ม':!block?'วัตถุดิบครบ':'วัตถุดิบยังไม่ครบ'}</span></footer></article>`;
  }).join('');
  return `<div class="ws-craft-library"><div class="ws-library-head"><div><h2>เลือกสูตรที่ต้องการสร้าง</h2><p>${['weapon','armor','charm'].includes(cat)?'เรียงเลเวลจากต่ำไปสูง · ดูสูตรก่อนยืนยัน':'สกิลเรียงตามวิธีใช้ · ไม่ใช่เงื่อนไขปลดล็อก'}</p></div><button class="ws-chip" data-act="craft-ready" aria-pressed="${!!ui.sel.craftReady}">คราฟต์ได้ ${ready}/${recipes.length}${ui.sel.craftReady?' · ดูทั้งหมด':''}</button></div><div class="ws-categories">${helpers.filters.map(([id,label])=>`<button class="ws-chip" data-act="craft-filter" data-id="${id}" aria-pressed="${cat===id}">${label}</button>`).join('')}</div><label class="ws-search"><span>ค้นหาสูตร</span><input type="search" data-craft-search value="${esc(query)}" placeholder="ชื่อ สกิล บทบาท หรือวัตถุดิบ" aria-label="ค้นหาสูตรคราฟต์"></label><div class="ws-recipes">${cards}<div class="ws-empty" data-craft-empty ${matching.length?'hidden':''}>ไม่พบสูตรตามคำค้นหาหรือตัวกรอง</div></div></div>`;
}
function recipeDetail(ui, helpers, id, recipe) {
  const g=ui.game,{ch,data}=g,def=recipeDefinition(data,recipe),kind=recipeKind(recipe),busy=!!ui.workshop?.busy;
  const field=recipe.type==='arrow',near=field?!g.inCombat():g.nearby().workbench,block=recipeBlocker(ch,data,id);
  const gear=recipe.type==='gear',guide=isSkill(recipe)?skillCraftGuide(data,recipe):null,receipt=ui.workshop?.receipt;
  const current=receipt?.recipeId===id?receipt:null;
  const history=(ui.sel.craftHistory?.[id]||[]).map(uid=>ch.gear.find(it=>it.uid===uid)).filter(Boolean);
  const recent=current?.items?.[0]||history[0];
  const title=gear&&recent?'ชิ้นล่าสุด '+stepLabel(recent):gear?'สุ่มเกรด C / B / A / S':recipe.type==='arrow'?`ได้สูงสุด ${recipe.qty} ลูก`:'สร้าง / เรียนรู้';
  const workStage=stage({graphic:picture(kind,recipe.result),name:def.nameTh,meta:gear?'Lv.'+recipeEquipmentLevel(data,recipe):def.name,from:busy?'กำลังสร้าง':title,to:'',busy,kind:'craft',grade:recent?.grade});
  const desc=gear?Object.entries(def.stats).map(([k,v])=>helpers.effectText(k,v)).join(' · '):craftDescription(data,recipe);
  const requirement=gear?wearRequirements(ch,gearRequirements({base:recipe.result,itemLevel:recipe.itemLevel,grade:'C',upgrade:0,options:[]},data),'เงื่อนไขพื้นฐานตอนสวม'):def.requires?wearRequirements(ch,def.requires,'เงื่อนไขใช้งาน'):'';
  const gweights=data.items.grades, total=Object.values(gweights.weights).reduce((a,b)=>a+b,0);
  const gradeGuide=gear?`<section class="ws-grade-guide"><h3>เกรดที่มีโอกาสได้</h3><div>${gweights.order.map(gr=>`<span>${gradeBadge(data,gr)}<b>${Math.round(gweights.weights[gr]/total*100)}%</b></span>`).join('')}</div><small>ทุกครั้งสุ่มใหม่ · ไม่การันตีเกรดสูงจากการคราฟต์ซ้ำ</small></section>`:'';
  const results=history.length?`<section class="ws-results"><h3>ชิ้นที่สร้างล่าสุด <small>${history.length} ชิ้น</small></h3><div>${history.map(item=>`<article class="ws-result-card" data-crafted-uid="${item.uid}"><span>${art('gear',item.base)}</span><div><b>${esc(data.items.gearBases[item.base].nameTh)}</b>${gradeBadge(data,item.grade,item.options.length)}<small>#${item.uid} · ทุกชิ้นอยู่ในกระเป๋า</small></div><button class="ws-chip" data-act="inspect-crafted" data-uid="${item.uid}">ดู / เทียบ</button>${wornSlot(ch,data,item)?'<span class="ws-equipped">สวมใส่อยู่</span>':`<button class="ws-chip" data-act="equip-gear" data-uid="${item.uid}" ${gearEquipState(ch,data,item).ok?'':'disabled'}>${gearEquipState(ch,data,item).ok?'สวมใส่':gearEquipState(ch,data,item).reason==='level'?'เลเวลยังไม่ถึง':'สเตตัสยังไม่ถึง'}</button>`}<button class="ws-chip" data-act="forge-open" data-mode="upgrade" data-uid="${item.uid}">ไปตีบวก</button></article>`).join('')}</div></section>`:'';
  const status=!near?field?'ออกจากการต่อสู้ก่อนคราฟต์ลูกธนู':'กลับโต๊ะคราฟต์ก่อนยืนยัน':block?workshopReason(block):'วัตถุดิบครบ · พร้อมสร้าง';
  const pool=gear?`<details class="ws-options"><summary>ออฟชั่นที่สุ่มได้ · ${recipe.optionPool.length} แบบ</summary>${recipe.optionPool.map(o=>{const d=data.items.gearOptions[o];return `<p>${esc(d.labelTh.replace('{v}',d.min+'–'+d.max))}</p>`;}).join('')}</details>`:'';
  return `<section class="craft-workspace ws-craft-detail" data-recipe="${id}" aria-label="คราฟต์ ${esc(def.nameTh)}"><button class="ws-back" data-act="craft-back">← กลับไปเลือกสูตร</button><h2 class="craft-detail-title ws-sr-only" tabindex="-1">คราฟต์ ${esc(def.nameTh)}</h2><div class="ws-craft-detail-layout"><main>${workStage}<p class="ws-description">${esc(desc||'')}</p>${guide?`<p class="ws-guide" data-craft-guide><b>${esc(guide.roleName)}</b> · ${esc(guide.playstyle)}<br>${esc(guide.condition)}</p>`:''}${recipe.type==='mod'?rulesHtml(def):def.tags?tagsHtml(def.tags):''}${gradeGuide}${pool}${results}</main><aside class="ws-order craft-controls"><div class="ws-section-label"><b>02</b><h2>วัตถุดิบต่อครั้ง</h2></div>${costs(g,busy&&current?current.spent:recipe.cost,busy&&!!current)}${field?`<p class="ws-footnote">จำนวนที่จะได้จริงไม่เกินพื้นที่ว่างในซอง · เกินความจุจะลดจำนวนตามกฎเดิม</p>`:''}<div class="ws-requirements">${requirement}${gear?'<p class="ws-footnote">คราฟต์เก็บได้แม้ยังสวมไม่ได้ · ไม่มีการบังคับเพิ่มเลเวล</p>':''}</div><div class="ws-confirm"><p class="ws-readiness ${!block&&near?'is-ready':''}">${busy?'ทำรายการแล้ว · กำลังแสดงผล':status}</p><button class="ws-button craft-single" data-act="${field?'craft-arrows':'craft'}" data-id="${id}" ${block||!near||busy?'disabled':''}>${busy?'กำลังแสดงผล…':block==='learned'?'เรียนแล้ว':'คราฟต์ 1 ครั้ง'}</button><small>หักจริงเมื่อยืนยัน · ไม่คราฟต์เมื่อเปิดดูสูตร</small></div>${gear?`<fieldset class="ws-repeat" ${busy?'disabled':''}>${craftGoal(ui,id,recipe,(ch,data,cost)=>costs(g,cost))}</fieldset>`:''}</aside></div></section>`;
}
export function workshopView(ui, helpers) {
  if(ui.tab==='forge')return forge(ui,helpers);
  const id=ui.sel.craftRecipe,recipe=ui.game.data.recipes.recipes[id];
  return shell(ui,'craft',recipe?recipeDetail(ui,helpers,id,recipe):recipeList(ui,helpers));
}
