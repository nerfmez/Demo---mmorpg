import {jobNodeState,jobPath,allocateJobNode,respecCost,respecJob} from '../../core/character.js';
import {journalProgress} from './model.js';
import {createLayout} from './layout.js';
import {sigil,effectSigil} from '../sigils.js';
import {esc,TAGS} from '../buildmeta.js';
import {effectText,effectLabel,effectValue} from './format.js';
import {createCamera} from './camera.js';
import {createPresentation,currentPresentation} from './presentation.js';
import {createRouteMotion} from './route-motion.js';
import {createPaperAudio} from './paper-audio.js';

import {createPageTurn} from './page-turn.js';

export function createJournal(root,ui){

const {data,ch}=ui.game,tree=data.jobtree;
const presentation=createPresentation(tree,tree.presentation||currentPresentation),layoutRules=createLayout(tree);
const state=ui.journalState||(ui.journalState={tier:presentation.tiers[0],view:'foundation',place:null,selected:null,coords:{},entries:[],memories:{},context:[]});
state.memories||={};state.context||=[];if(!presentation.tiers.includes(state.tier))state.tier=presentation.tiers[0];
let destroyed=false;const cleanups=[];
function listen(target,type,handler,options){target.addEventListener(type,handler,options);cleanups.push(()=>target.removeEventListener(type,handler,options));}
const extraIcons={sound:'M3 9h4l5-4v14l-5-4H3zM16 8q4 4 0 8M19 5q7 7 0 14',silent:'M3 9h4l5-4v14l-5-4H3zM17 9l5 6M22 9l-5 6',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M4 12h16m-6-6 6 6-6 6',close:'M6 6l12 12M6 18L18 6',lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',check:'M5 12l4 4L19 6',menu:'M4 7h16M4 12h16M4 17h16',reset:'M3 10a9 9 0 1 1 1 8M3 4v6h6',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',chevron:'M8 4l8 8-8 8',minus:'M5 12h14',zoom:'M12 5v14M5 12h14'};
const icon=name=>extraIcons[name]?`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${extraIcons[name]}"/></svg>`:sigil(name);
const effectEntries=n=>Object.entries(n.effects||{});
const num=n=>String(n).padStart(2,'0');
root.innerHTML=`
<header class="journal-toolbar"><div><span class="journal-series">SEEKER / FIELD JOURNAL</span><h1>สมุดบันทึกการเดินทาง</h1></div><button class="icon-button journal-exit" data-action="exit" aria-label="กลับเข้าเกม">${icon('close')}</button></header>
<div class="notebook"><div class="book-cover" aria-hidden="true"></div><nav class="chapter-tabs" id="chapter-tabs" aria-label="แถบคั่นบท"></nav>
<div class="app-shell"><div class="paper-wear" aria-hidden="true"><svg viewBox="0 0 1600 900" preserveAspectRatio="none"><g fill="none" stroke="currentColor"><path d="M24 35q10 52-1 82m6-72-9 63M13 705l45 74 76 63M22 712l43 62 62 58M1375 25l190 64M1442 24l127 61M1446 820q65-17 116-41m-134 53 137-37"/><path d="M58 47l99 21m-76-8 70 14M43 813l10 4m-12 6 44 13M1420 877l78-3m-90-6 107 2"/></g></svg></div><svg class="page-ink" id="page-ink" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M81 288q63-12 112-5t73-5M79 297q65-14 109-4M1273 749q51 19 92 4t79-4"/><path pathLength="1" d="M105 742l23-10 13 5 22-15 16 8 40-11"/></svg><span class="old-ink-note" aria-hidden="true">carried along the way.</span><div class="spread-gutter" aria-hidden="true"></div><div class="page-curl" aria-hidden="true"></div>
 <main class="workspace">
  <header class="topbar"><div class="breadcrumb"><span class="book-monogram">S.</span><span>บันทึกการสำรวจ</span><span class="slash">/</span><b id="top-folio">หน้าที่ 01</b></div><div class="top-actions"><details class="book-sound" id="sound-control"><summary class="icon-button" aria-label="ตั้งค่าเสียงกระดาษ" title="เสียงกระดาษ">${icon('sound')}</summary><div class="sound-settings"><div><span>เสียงกระดาษ</span><button data-action="toggle-sound" id="sound-mute" aria-pressed="false">ปิดเสียง</button></div><label for="sound-volume">ระดับเอฟเฟกต์ <output id="sound-percent">38%</output></label><input id="sound-volume" type="range" min="0" max="100" step="1" value="38" aria-label="ระดับเสียงเอฟเฟกต์กระดาษ"></div></details><button class="icon-button book-reset" data-action="respec" aria-label="คืนแต้มและเริ่มเขียนเส้นทางใหม่">${icon('reset')}</button><button class="search-button" data-action="search" aria-label="ค้นหาทุกโหนด">${icon('search')}<span>ค้นหารอยจด</span><kbd>/</kbd></button><div class="points" aria-label="แต้มคงเหลือ"><strong id="point-count">${ch.jobPoints}</strong><span>แต้มพร้อมบันทึก<small>JOB LV.<span id="job-level">${ch.jobLevel}</span></small></span></div></div></header>
  <div class="mobile-stages" id="mobile-stages" aria-label="เลือกพื้นที่"></div>
  <section class="atlas-space" aria-labelledby="place-title">
   <div class="contour-background" aria-hidden="true"><svg viewBox="0 0 1100 850" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="currentColor" stroke-width=".7">${Array.from({length:15},(_,i)=>`<path d="M${420+i*24} -60 C${200+i*15} ${180+i*7},${1150-i*17} ${150+i*18},${1010-i*20} ${420+i*12} S${490-i*20} ${520+i*10},${610-i*18} 940"/>`).join('')}</g></svg></div>
   <div class="map-cartouche" aria-hidden="true"><span>N</span>${icon('compass')}<small>FIELD MAP<br>NOT TO SCALE</small></div>
   <div class="map-marginalia" aria-hidden="true">A path begins with a single mark.</div>
   <div class="chapter-watermark" aria-hidden="true" id="chapter-watermark">01</div>
   <div class="map-header"><div><div class="eyebrow" id="map-eyebrow"></div><h1 id="place-title"></h1><p id="place-desc"></p></div><button class="place-switch" id="place-switch" data-action="junction"></button></div>
   <div class="chapter-note" id="chapter-note"></div><div class="junction-pagination" id="junction-pagination" hidden></div><div class="travel-leaf-labels" id="travel-leaf-labels" hidden></div>
   <div class="map-viewport" id="map" tabindex="0" aria-label="แผนผังสกิล ลากเพื่อเลื่อน บีบเพื่อซูม"><div class="map-plane" id="plane"></div></div>
   <div class="locked-region" id="locked-region" hidden></div>
   <div class="map-status" id="map-status"></div>
   <div class="map-controls" aria-label="เครื่องมือแผนผัง"><button class="icon-button" data-action="fit" aria-label="ดูผังทั้งหมด">${icon('expand')}</button><i></i><button class="icon-button" data-action="zoom-out" aria-label="ซูมออก">${icon('minus')}</button><output id="zoom">100%</output><button class="icon-button" data-action="zoom-in" aria-label="ซูมเข้า">${icon('zoom')}</button></div>
   <aside class="inspector" id="inspector" aria-label="รายละเอียดโหนด" aria-hidden="true" inert><div class="sheet-handle"></div><button class="icon-button inspector-close" data-action="close-detail" aria-label="ปิดรายละเอียด">${icon('close')}</button><div id="detail-content"></div></aside>
  </section>
  <footer class="statusbar"><div><span class="live-dot"></span><span id="allocation-summary"></span></div><span class="gesture-hint">ลากเพื่อเลื่อน · บีบหรือเลื่อนล้อเพื่อซูม</span><span class="page-pagination"><button data-page="-1" aria-label="บทก่อนหน้า">←</button><span id="page-folio">01 / 06</span><button data-page="1" aria-label="บทถัดไป">→</button></span></footer>
 </main>
</div></div>
<div class="journal-toast" role="status" aria-live="polite" id="toast"></div>
<dialog id="dialog" aria-labelledby="dialog-title"><div class="dialog-top"><h2 id="dialog-title"></h2><button class="icon-button" data-action="close-dialog" aria-label="ปิดหน้าต่าง">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;
const q=s=>root.querySelector(s), inspector=q('#inspector'), map=q('#map'), plane=q('#plane');
let paperHeight=q('.atlas-space').clientHeight;const layoutCache=new Map();
const camera=createCamera(map,plane,q('#zoom'),(id,gateway)=>gateway?openBranch(id):select(id));
const routes=createRouteMotion(),paperAudio=createPaperAudio(ui.journalAudioSettings);
const pageTurns=createPageTurn(q('.app-shell'));let navigationCount=0,detailCamera=null;
function viewKey(){return `${state.tier}/${state.view}/${state.place||''}`;}
function changePage(change,direction=1){const key=viewKey();state.memories[key]=camera.snapshot();routes.cancel();const leaf=pageTurns.snapshot().reduced?null:pageTurns.capture();q('#sound-control').open=false;change();if(viewKey()!==key){navigationCount++;pageTurns.play(leaf,direction);paperAudio.play(direction);}}
function soundControls(){const s=paperAudio.snapshot(),muted=s.muted||s.volume===0;ui.journalAudioSettings={muted:s.muted,volume:s.volume};q('#sound-control').classList.toggle('muted',muted);q('#sound-control summary').innerHTML=icon(muted?'silent':'sound');q('#sound-control summary').setAttribute('aria-label',`ตั้งค่าเสียงกระดาษ · ${muted?'ปิดเสียง':Math.round(s.volume*100)+' เปอร์เซ็นต์'}`);q('#sound-mute').textContent=s.muted?'เปิดเสียง':'ปิดเสียง';q('#sound-mute').setAttribute('aria-pressed',String(s.muted));q('#sound-volume').value=String(Math.round(s.volume*100));q('#sound-percent').textContent=Math.round(s.volume*100)+'%';}
soundControls();
listen(root,'pointerdown',e=>{if(e.isTrusted&&e.target.closest('[data-stage],[data-page],[data-travel-page],[data-junction-page],[data-gateway],[data-action="junction"]'))paperAudio.prime();},{capture:true});
listen(document,'click',e=>{if(!q('#sound-control').contains(e.target))q('#sound-control').open=false;});
let toastTimer;
function toast(text){q('#toast').textContent=text;q('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>q('#toast').classList.remove('show'),3200);}
function showDialog(title,html){q('#dialog-title').textContent=title;q('#dialog-content').innerHTML=html;if(!q('#dialog').open)q('#dialog').showModal();}
function closeDialog(){q('#dialog').close();}
function updateChrome(){
 const progress=journalProgress(ch,data);
 q('#point-count').textContent=ch.jobPoints;q('#job-level').textContent=ch.jobLevel;
 q('#top-folio').textContent=`บท ${num(state.tier)}${state.view==='path'?' / '+(presentation.groups(state.tier).find(g=>g.id===state.place)?.name||''):''}`;
 q('#page-folio').textContent=num(presentation.tiers.indexOf(state.tier)+1)+' / '+num(presentation.tiers.length);
 const tabs=progress.stages.map(s=>`<button data-stage="${s.tier}" class="chapter-tab ${state.tier===s.tier?'active':''} ${s.unlocked?'':'sealed'}" aria-label="บท ${s.tier} ${s.nameTh}${s.unlocked?'':' · เปิดดูได้ ลงทุนยังไม่ได้'}" aria-current="${state.tier===s.tier?'step':'false'}"><span>${num(s.tier)}</span>${s.unlocked?'':icon('lock')}</button>`).join('');
 q('#chapter-tabs').innerHTML=tabs;q('#mobile-stages').innerHTML=tabs;
 q('#allocation-summary').textContent=`ลงทุนแล้ว ${progress.spent} แต้ม · ${progress.spent} รอยจด`;
 const currentStage=progress.stages.find(s=>s.tier===state.tier);q('.atlas-space').classList.toggle('stage-gated',!currentStage.unlocked);q('.atlas-space').dataset.gate=currentStage.unlocked?'':`เปิดดูได้ · ลงทุนรวม ${currentStage.requiresSpent} แต้ม เพื่อเรียนรู้บทนี้ (ตอนนี้ ${progress.spent})`;
 const next=progress.next;
 q('#chapter-note').innerHTML=next?`<span>บทถัดไป ${num(next.tier)}</span><span>ลงทุนอีก <b>${next.requiresSpent-progress.spent} แต้ม</b></span><div class="chapter-note-track"><i style="width:${Math.min(100,progress.spent/next.requiresSpent*100)}%"></i></div>`:`<span>ทุกบทเปิดแล้ว · เขียนเส้นทางต่อได้ตามใจ</span>`;
}
function palette(n){if(n.category==='foundation'){const fx=n.effects||{},family=Object.keys(fx).some(k=>/mp/i.test(k))?'area':fx.magic?'specialist':fx.attack?'melee':fx.defense?'lasting':fx.maxHp?'support':'foundation';return tree.constellations.find(c=>c.id===family)?.color||tree.constellations[0].color;}return tree.constellations.find(c=>c.id===n.category)?.color||tree.constellations[0].color;}
function inkStyle(color){return `--branch-color:${color};--node-ink:color-mix(in srgb,${color} 56%,#252b33);--node-wash:color-mix(in srgb,${color} 9%,#fffdf7)`;}
function openBranch(key){if(!presentation.groups(state.tier).some(g=>g.id===key))return;changePage(()=>{state.place=key;state.view='path';state.context=[];renderRegion();});}
function showJunction(){changePage(()=>{state.view=state.tier===presentation.tiers[0]?'foundation':'junction';state.place=null;state.context=[];renderRegion();},-1);}
const compactPaper=()=>innerHeight<=520||(innerWidth>760&&paperHeight<=450);
function nodeName(n){return n.type==='job'?Object.keys(n.effects||{}).slice(0,1).map(effectLabel).join(''):n.nameTh;}
function drawNodes(ids,primary){
 const viewport=camera.viewport(),layout=layoutRules.layout(ids,[...primary],state.tier,innerWidth<=760,viewport.height<200);
 state.entries=ids.map(id=>[id,tree.nodes[id]]);state.coords=layout.coords;
 plane.style.width=layout.width+'px';plane.style.height=layout.height+'px';
 plane.innerHTML=`<svg class="connections" width="${layout.width}" height="${layout.height}" aria-hidden="true"><g class="base-routes"></g></svg>`+state.entries.map(([id,n])=>`<button class="node ${primary.has(id)?'':'context-node'}" data-node="${esc(id)}" aria-pressed="false" style="left:${state.coords[id][0]}px;top:${state.coords[id][1]}px;${inkStyle(palette(n))}"><span class="node-disc">${icon(effectSigil(n))}</span><span class="node-state"></span><span class="node-caption"><b>${esc(nodeName(n))}</b><small>${n.type==='origin'?'จุดเริ่มต้นร่วมกัน':n.requires?.length?'ก่อน: '+(n.requires||[]).map(k=>tree.nodes[k].nameTh).join(' + '):''}</small></span></button>`).join('');
 paintGraph();camera.configure(layout.width,layout.height);
}
function renderJunction(){
 const groups=presentation.groups(state.tier),columns=Math.min(groups.length,innerWidth<=760?2:3),rows=Math.ceil(groups.length/columns),compact=compactPaper(),viewport=camera.viewport(),width=compact?(viewport.width-70)/.5:columns*460,height=compact?Math.max((viewport.height-40)/.5,rows*160):rows*310+60;
 state.entries=[];state.coords={};plane.style.width=width+'px';plane.style.height=height+'px';
 plane.innerHTML=groups.map((g,i)=>{const ready=g.ids.filter(id=>jobNodeState(ch,data,id).can).length,owned=g.ids.filter(id=>ch.jobNodes.includes(id)).length;return `<button class="discipline-node ${ready?'has-ready':''}" data-gateway="${g.id}" data-discipline="${g.id}" style="left:${(i%columns+.5)*width/columns}px;top:${compact?(Math.floor(i/columns)+.5)*height/rows:155+Math.floor(i/columns)*310}px;${inkStyle(g.color)}"><span class="discipline-number">${num(i+1)}</span><span class="discipline-disc">${icon(g.icon)}<span class="discipline-open">${icon('arrow')}</span></span><span class="discipline-caption"><b>${esc(g.name)}</b><span>${esc(g.note||'เปิดดูโหนดย่อยที่เชื่อมกัน')}</span><small>${owned} / ${g.ids.length} บันทึก · ${ready} พร้อมเรียนรู้</small></span></button>`;}).join('');camera.configure(width,height);
 q('#map-status').textContent=`${groups.length} รอยทางหลัก · เปิดดูได้ทุกสาย · การเปิดดูไม่ใช้แต้ม`;
}
function closeDetail(restore=false){const id=state.selected;state.selected=null;inspector.classList.remove('open');inspector.inert=true;inspector.setAttribute('aria-hidden','true');q('.atlas-space').classList.remove('has-detail');camera.setSheet(0);if(id&&detailCamera)camera.frame(detailCamera.x,detailCamera.y,detailCamera.z);plane.querySelectorAll('.node.selected').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false')});if(restore&&id)plane.querySelector(`[data-node="${id}"]`)?.focus({preventScroll:true});}
function reasonText(st){if(st.missing?.length)return 'ต้องเรียนรู้ '+st.missing.map(id=>tree.nodes[id].nameTh).join(' + ')+' ก่อน';return st.taken?'เรียนรู้แล้ว':st.can?'พร้อมเรียนรู้':({not_linked:'ต้องเชื่อมจากโหนดที่เรียนรู้แล้ว',no_points:'แต้มคงเหลือไม่เพียงพอ',tier_points:`ต้องลงทุนรวม ${st.need} แต้ม`,job_level:`ต้องมี Job Lv.${st.need}`,one_job:'เลือกอาชีพได้หนึ่งสาย · รีแต้มก่อนเปลี่ยน',requires_job:`ต้องเรียนรู้โหนด ${(tree.groups||[]).find(g=>g.id===st.need)?.nameTh||st.need}`}[st.reason]||'ยังเรียนรู้ไม่ได้');}
function select(id,focus=true){
 const n=tree.nodes[id];if(!n||!state.coords[id])return;
 const st=jobNodeState(ch,data,id);if(!state.selected)detailCamera=camera.snapshot();state.selected=id;inspector.style.cssText=inkStyle(palette(n));
 plane.querySelectorAll('.node').forEach(el=>{const on=el.dataset.node===id;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on))});
 const path=jobPath(ch,data,id).filter(k=>k!==id),tier=tree.sections[n.section].tier;
 q('#detail-content').innerHTML=`<div class="detail-scroll"><div class="detail-kicker">FIELD NOTE · ENTRY ${num(tier)}</div><div class="detail-emblem ${st.taken?'learned':''}">${icon(effectSigil(n))}</div><span class="type-label">${n.type==='origin'?'จุดเริ่มต้นร่วมกัน':n.type==='job'?'โหนดอาชีพ · เลือกได้หนึ่งสาย':n.type==='notable'?'โหนดหลัก':'โหนดพื้นฐาน'}</span><h2>${esc(n.nameTh)}</h2><p class="detail-subtitle">${esc(n.descTh||'สิ่งที่เรียนรู้ระหว่างทาง และเลือกพาติดตัวไปต่อ')}</p>${n.tags?.length?`<div class="tag-list">${n.tags.map(t=>`<span>${esc(TAGS[t]||t)}</span>`).join('')}</div>`:''}<div class="effect-list">${effectEntries(n).map(([k,v])=>`<div><span>${esc(effectLabel(k))}</span><b>${esc(effectValue(k,v))}</b></div>`).join('')||'<p>นักเดินทางทุกคนเริ่มที่นี่</p>'}</div><div class="requirements"><span class="detail-section-label">โหนดก่อนหน้า · ต้องเรียนรู้ครบทุกจุด</span>${n.type==='origin'?'<p>จุดตั้งต้น · ไม่ใช้แต้ม</p>':(n.requires||[]).map(k=>{const linked=tree.nodes[k],owned=ch.jobNodes.includes(k);return `<button data-jump="${k}" class="requirement-link ${owned?'owned':''}">${icon(owned?'check':'chevron')}<span>${esc(linked.nameTh)}</span><small>${owned?'เรียนรู้แล้ว':'ดูโหนด'}</small></button>`}).join('')}<p class="path-hint">${journalProgress(ch,data).spent>=tree.sections[n.section].requiresSpent?'✓':'🔒'} ลงทุนรวม ${tree.sections[n.section].requiresSpent} แต้ม · ตอนนี้ ${journalProgress(ch,data).spent}</p>${(n.requires||[]).length>1?'<p class="path-hint">ต้องมีทั้งสองจุด ไม่ใช่เลือกเพียงจุดใดจุดหนึ่ง</p>':''}</div>${!st.can&&!st.taken&&path.length?`<p class="path-hint">เส้นทางสั้นที่สุดยังเหลือ ${path.length} โหนดก่อนจุดนี้ · ยังต้องผ่านเงื่อนไขพื้นที่</p>`:''}</div><div class="detail-action"><p class="availability ${st.can||st.taken?'ready':''}"><span class="little-dot"></span>${esc(reasonText(st))}</p><button class="learn-button" data-action="learn" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?`บันทึกแล้ว ${icon('check')}`:`เรียนรู้และบันทึก <span>1 แต้ม ${icon('arrow')}</span>`}</button><small>การเลือกดูโหนดไม่ใช้แต้ม</small></div>`;
 inspector.inert=false;inspector.setAttribute('aria-hidden','false');inspector.classList.add('open');q('.atlas-space').classList.add('has-detail');
 const wide=innerWidth>760;camera.setSheet(wide?inspector.offsetWidth+20:0);if(focus)camera.focus(...state.coords[id]);
}
function curve(source,target){const [x,y]=state.coords[source],[xx,yy]=state.coords[target];return `M${x} ${y} C${x+(xx-x)*.3} ${y},${x+(xx-x)*.7} ${yy},${xx} ${yy}`;}
function edgeHtml(){const seen=new Set();let html='';for(const [id,n] of state.entries)for(const k of n.requires||[]){if(!state.coords[k])continue;const pair=JSON.stringify([id,k].sort());if(seen.has(pair))continue;seen.add(pair);const owned=ch.jobNodes.includes(id)&&ch.jobNodes.includes(k);html+=`<path data-edge="${esc(pair)}" d="${curve(k,id)}" class="edge ${owned?'learned':''}"/>`;}return html;}
function paintGraph(){
 const connections=plane.querySelector('.base-routes');if(!connections)return;if(!connections.children.length)connections.innerHTML=edgeHtml();else for(const path of connections.children){const [a,b]=JSON.parse(path.dataset.edge);path.classList.toggle('learned',!path.classList.contains('route-pending')&&ch.jobNodes.includes(a)&&ch.jobNodes.includes(b));}
 for(const [id,n] of state.entries){const el=[...plane.querySelectorAll('[data-node]')].find(el=>el.dataset.node===id),st=jobNodeState(ch,data,id),context=state.view==='path'&&!presentation.groups(state.tier).find(g=>g.id===state.place)?.ids.includes(id);el.className=`node ${n.type} ${context?'context-node':''} ${st.taken?'learned':st.can?'available':'locked'} ${state.selected===id?'selected':''}`;el.setAttribute('aria-label',`${n.nameTh} · ${reasonText(st)}`);el.querySelector('.node-state').innerHTML=st.taken?icon('check'):st.can?'<span class="little-dot"></span>':icon('lock');}
 q('#map-status').innerHTML=`<span class="little-dot"></span>${state.entries.filter(([id])=>jobNodeState(ch,data,id).can).length} พร้อมเรียนรู้ <i></i><span class="route-key"></span>เส้นประ = รอยทางที่บันทึกแล้ว`;
}
function renderRegion(){
 closeDetail();updateChrome();q('#junction-pagination').hidden=true;q('#travel-leaf-labels').hidden=true;q('#locked-region').hidden=true;map.hidden=false;q('#map-status').hidden=false;q('.map-controls').hidden=false;
 const stage=journalProgress(ch,data).stages.find(s=>s.tier===state.tier),first=state.tier===presentation.tiers[0],junction=!first&&state.view!=='path';if(first)state.view='foundation';else if(junction)state.view='junction';
 q('.atlas-space').classList.toggle('junction-view',junction);q('.atlas-space').classList.remove('travel-view');q('#chapter-watermark').textContent=num(state.tier);
 q('#map-eyebrow').innerHTML=`<span class="little-dot"></span> EXPEDITION ${num(state.tier)} <i>/</i> ${first?'FIRST FOOTSTEPS':junction?'CHOOSE WHAT TO EXPLORE':'FOLLOW THE CONNECTIONS'}`;
 const group=presentation.groups(state.tier).find(g=>g.id===state.place);
 q('#place-title').textContent=first?'ก้าวแรกของการเดินทาง':junction?tree.presentation.stages.find(s=>s.id===state.tier).name:group?.name||'รอยทาง';
 q('#place-desc').textContent=first?'เริ่มจากเตรียมพร้อม · ต่อทีละจุด แล้วค่อยขยายเส้นทาง':junction?'เปิดดูรอยทางย่อย · ต้องผ่านโหนดก่อนหน้าและเกณฑ์แต้ม':`ต่อจากรอยจดที่เรียนรู้ · ดูโหนดก่อนหน้าได้ในหน้านี้`;
 q('#place-switch').hidden=first||junction;q('#place-switch').innerHTML=`<span class="back-mark">←</span><span>กลับรอยทางหลัก</span>`;
 q('.atlas-space').classList.toggle('stage-gated',!stage.unlocked);q('.atlas-space').dataset.gate=stage.unlocked?'':`เปิดดูได้ · ลงทุนรวม ${stage.requiresSpent} แต้ม เพื่อเรียนรู้บทนี้ (ตอนนี้ ${journalProgress(ch,data).spent})`;
 if(junction)renderJunction();else{const primary=first?presentation.stage(state.tier):group?.ids||[];const ids=first?primary:[...new Set([...primary,...primary.flatMap(id=>tree.nodes[id].requires||[]),...state.context])];drawNodes(ids,new Set(primary));}
 const memory=state.memories[viewKey()];if(memory)camera.frame(memory.x,memory.y,memory.z);
}
function navigate(tier){tier=Number(tier);if(!presentation.tiers.includes(tier))return;changePage(()=>{state.tier=tier;state.place=null;state.view=tier===presentation.tiers[0]?'foundation':'junction';state.context=[];renderRegion();},tier<state.tier?-1:1);}
function jump(id){if(!tree.nodes[id])return;const fromSearch=q('#dialog').open;if(fromSearch)closeDialog();if(state.coords[id]&&(tree.nodes[id].requires||[]).every(k=>state.coords[k])){select(id);return;}if(state.view==='path'&&!fromSearch){state.context=[...new Set([...state.context,...jobPath(ch,data,id),id,...(tree.nodes[id].requires||[])])];const chosen=state.place;renderRegion();state.place=chosen;select(id);return;}
 const tier=presentation.tierOf(id);changePage(()=>{state.tier=tier;state.place=presentation.groupOf(id);state.view=tier===presentation.tiers[0]?'foundation':'path';state.context=[];renderRegion();});select(id);
}
function learn(id){
 const sources=(tree.nodes[id]?.requires||[]).filter(k=>ch.jobNodes.includes(k)),source=sources[0],previous=journalProgress(ch,data),result=allocateJobNode(ch,data,id);if(!result.done){toast(reasonText(result));return;}
 ui.game.notify({type:'job'});ui.changed();updateChrome();paintGraph();select(id,false);
 if(source&&state.coords[source]&&state.coords[id]){const a=state.coords[source],b=state.coords[id],viewport=camera.viewport(),free=viewport.width-(innerWidth>760?inspector.offsetWidth+20:0),z=Math.max(.18,Math.min(camera.snapshot().z,(free-130)/Math.max(130,Math.abs(a[0]-b[0])),(viewport.height-130)/Math.max(130,Math.abs(a[1]-b[1]))));camera.frame((a[0]+b[0])/2,(a[1]+b[1])/2+20/z,z);for(const parent of sources)if(state.coords[parent])routes.draw(plane.querySelector('.connections'),parent,id,curve(parent,id));}
 const next=journalProgress(ch,data);toast(next.current.tier>previous.current.tier?`บท ${num(next.current.tier)} เปิดแล้ว · สำรวจรอยทางใหม่ได้`:`บันทึก ${tree.nodes[id].nameTh} แล้ว`);
}
function search(){showDialog('ค้นหาเส้นทาง',`<div class="search-field">${icon('search')}<input type="search" id="node-search" aria-label="ค้นหาชื่อหรือค่าสถานะ" placeholder="ชื่อโหนด ธาตุ หรือค่าสถานะ…" autocomplete="off"></div><p class="dialog-note">ค้นหาได้ทุกพื้นที่ · การเปิดดูไม่ใช้แต้ม</p><p class="dialog-note">รอยจดเดิมที่เรียนรู้แล้วค้นหาได้ · โบนัสยังอยู่ครบ</p><div id="search-results" class="dialog-list"></div>`);searchResults('');q('#node-search').focus();}
function searchResults(query){const text=query.trim().toLocaleLowerCase();const entries=Object.entries(tree.nodes).filter(([id,n])=>presentation.stage(presentation.tierOf(id)).includes(id)||ch.jobNodes.includes(id)).filter(([id,n])=>text?[id,n.name,n.nameTh,n.descTh,...(n.tags||[]).map(t=>TAGS[t]||t),...effectEntries(n).map(([k,v])=>effectText(k,v))].join(' ').toLocaleLowerCase().includes(text):jobNodeState(ch,data,id).can);q('#search-results').innerHTML=`<div class="result-count">${text?entries.length+' โหนดที่พบ':'พร้อมเรียนรู้ตอนนี้'}</div>`+entries.map(([id,n])=>{const s=tree.sections[n.section],unlocked=journalProgress(ch,data).spent>=s.requiresSpent;return `<button class="search-result" ${presentation.stage(presentation.tierOf(id)).includes(id)?`data-jump="${id}"`:`data-legacy="${id}"`}><span class="result-icon">${icon(effectSigil(n))}</span><span><b>${esc(n.nameTh)}</b><small>พื้นที่ ${num(s.tier)} · ${esc(effectEntries(n).map(([k,v])=>effectText(k,v)).join(' · '))}</small></span>${unlocked?icon('arrow'):`<span class="result-lock">${icon('lock')} ${s.requiresSpent} แต้ม</span>`}</button>`}).join('')+(entries.length?'':'<p class="empty-results">ไม่พบโหนดที่ตรงกัน ลองค้นหาด้วยคำสั้นลง</p>');}
function resetDialog(){const cost=respecCost(ch,data).job,inTown=ui.game.nearby().inTown;showDialog('คืนแต้มเส้นทาง',`<p class="reset-copy">คืนแต้มสกิลที่ลงทุนไว้ทั้งหมด · ต้องอยู่ในเมือง</p><div class="reset-cost"><span>ค่าธรรมเนียม</span><b>${cost} G</b></div><p class="dialog-note">${inTown?'แต้มและรอยจดเดิมจะถูกคืนเมื่อยืนยัน':'กลับเข้าเมืองก่อนคืนแต้ม'} · มี ${ch.gold} G</p><button class="primary-button full" data-action="confirm-respec" ${!inTown||ch.gold<cost||ch.jobNodes.length<2?'disabled':''}>ยืนยันคืนแต้ม ${icon('reset')}</button><button class="quiet-button" data-action="cancel-respec">ยกเลิก</button>`);}
function legacyNote(id){const n=tree.nodes[id];if(!n||!ch.jobNodes.includes(id))return;showDialog('รอยจดที่ติดตัวมา',`<h3>${esc(n.nameTh)}</h3><p class="dialog-note">เรียนรู้แล้ว · โบนัสและความคืบหน้าเดิมยังอยู่ครบ</p><div class="effect-list">${effectEntries(n).map(([k,v])=>`<div><span>${esc(effectLabel(k))}</span><b>${esc(effectValue(k,v))}</b></div>`).join('')}</div><button class="quiet-button" data-action="search">กลับการค้นหา</button>`);}
listen(root,'click',e=>{
 const t=e.target.closest('button,[data-action]');if(!t)return;
 if(t.dataset.stage)return navigate(t.dataset.stage);
 if(t.dataset.page){const index=presentation.tiers.indexOf(state.tier)+Number(t.dataset.page);return navigate(presentation.tiers[Math.max(0,Math.min(presentation.tiers.length-1,index))]);}
 if(t.dataset.legacy)return legacyNote(t.dataset.legacy);
 if(t.dataset.jump)return jump(t.dataset.jump);
 switch(t.dataset.action){
 case 'exit':ui.close();break;
 case 'toggle-sound':{const s=paperAudio.snapshot();paperAudio.set(!s.muted);soundControls();if(s.muted)paperAudio.prime();break;}
 case 'search':search();break;case 'junction':showJunction();break;case 'close-dialog':case 'cancel-respec':closeDialog();break;

 case 'close-detail':closeDetail(true);break;case 'learn':learn(t.dataset.id);break;
 case 'fit':camera.fit();break;case 'zoom-out':camera.zoom(1/1.2);break;case 'zoom-in':camera.zoom(1.2);break;
 case 'respec':resetDialog();break;case 'confirm-respec':if(ui.game.nearby().inTown&&respecJob(ch,data)){ui.changed();closeDialog();routes.cancel();navigate(presentation.tiers[0]);toast('คืนแต้มแล้ว พร้อมออกเดินทางอีกครั้ง');}break;
 }
});
listen(root,'input',e=>{if(e.target.id==='node-search')searchResults(e.target.value);if(e.target.id==='sound-volume'){paperAudio.set(paperAudio.snapshot().muted,Number(e.target.value)/100);soundControls();}});
listen(q('#dialog'),'click',e=>{if(e.target===q('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
listen(root,'keydown',e=>{if(e.key==='Escape'){if(q('#dialog').open){e.preventDefault();e.stopPropagation();closeDialog();return;}if(q('#sound-control').open){e.preventDefault();e.stopPropagation();q('#sound-control').open=false;return;}if(state.selected){e.preventDefault();e.stopPropagation();closeDetail(true);return;}}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)&&!q('#dialog').open){e.preventDefault();search();}});
renderRegion();
let layoutKey=`${innerWidth<=760}:${compactPaper()}`,resizeTimer;
const resizePaper=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(destroyed)return;const key=`${innerWidth<=760}:${compactPaper()}`,id=state.selected;if(key!==layoutKey){layoutKey=key;renderRegion();if(id&&state.coords[id])select(id);}else if(id)camera.setSheet(innerWidth>760?inspector.offsetWidth+20:0);},150);};
listen(window,'resize',resizePaper);listen(window,'frontier:viewport',resizePaper);
const paperResize=new ResizeObserver(entries=>{paperHeight=entries[0].contentRect.height;resizePaper();});paperResize.observe(q('.atlas-space'));cleanups.push(()=>paperResize.disconnect());
const snapshot=()=>({tier:state.tier,place:state.place,view:state.view,selected:state.selected,visible:state.entries.map(([id])=>id),groups:presentation.groups(state.tier).map(g=>({id:g.id,count:g.ids.length})),points:ch.jobPoints,owned:[...ch.jobNodes],progress:journalProgress(ch,data),camera:camera.snapshot(),routes:routes.snapshot(),navigation:{count:navigationCount,active:pageTurns.snapshot().active},pageTurn:pageTurns.snapshot(),audio:paperAudio.snapshot()});
return {snapshot,learn,audioEvents:()=>paperAudio.events(),refresh(){if(destroyed)return;updateChrome();if(state.view==='junction'){for(const g of presentation.groups(state.tier)){const el=[...plane.querySelectorAll('[data-gateway]')].find(el=>el.dataset.gateway===g.id);if(el){const ready=g.ids.filter(id=>jobNodeState(ch,data,id).can).length;el.classList.toggle('has-ready',ready>0);el.querySelector('.discipline-caption small').textContent=`${g.ids.filter(id=>ch.jobNodes.includes(id)).length} / ${g.ids.length} บันทึก · ${ready} พร้อมเรียนรู้`;}}return;}paintGraph();if(state.selected)select(state.selected,false);},destroy(){if(destroyed)return;destroyed=true;clearTimeout(toastTimer);clearTimeout(resizeTimer);closeDialog();state.selected=null;routes.cancel();pageTurns.destroy();camera.destroy();paperAudio.destroy();cleanups.forEach(fn=>fn());}};
}
