import {jobNodeState,jobPath,allocateJobNode,respecCost,respecJob} from '../../core/character.js';
import {sigil,effectSigil} from '../sigils.js';
import {esc,TAGS} from '../buildmeta.js';
import {effectText,effectLabel,effectValue} from './format.js';
import {createCamera} from './camera.js';
import {createPageTurn} from './page-turn.js';
import {createPaperAudio} from './paper-audio.js';

import {journalProgress,startingEntries,chapterSpreads} from './model.js';

export function createJournal(root,ui){
const {data,ch}=ui.game,tree=data.jobtree;
const state=ui.journalState||(ui.journalState={tier:1,place:'foundation',branch:tree.groups[0].id,view:'travel',travelPage:0,travelPages:{1:0},junctionPage:0,selected:null,coords:{},entries:[],justLearned:null});
let destroyed=false;const cleanups=[];
function listen(target,type,handler,options){target.addEventListener(type,handler,options);cleanups.push(()=>target.removeEventListener(type,handler,options));}
const stageNames=['First footsteps','Beyond the gates','A path of your own','Over the horizon','Under the stars','Still unfolding'];
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
const camera=createCamera(map,plane,q('#zoom'),(id,gateway)=>gateway?(id.startsWith('branch:')?openBranch(id.slice(7)):jump(id)):select(id));
const pageTurns=createPageTurn(q('.app-shell')),paperAudio=createPaperAudio(ui.journalAudioSettings);
function viewKey(){return `${state.tier}/${state.view}/${state.view==='travel'?state.travelPage:state.view==='junction'?state.junctionPage:state.place+(state.place==='specialist'?'/'+state.branch:'')}`;}
function changePage(change,direction=1){const before=viewKey(),snapshot=pageTurns.capture();q('#sound-control').open=false;change();if(viewKey()!==before){pageTurns.play(snapshot,direction);paperAudio.play(direction);}}
function soundControls(){const s=paperAudio.snapshot(),muted=s.muted||s.volume===0;ui.journalAudioSettings={muted:s.muted,volume:s.volume};q('#sound-control').classList.toggle('muted',muted);q('#sound-control summary').innerHTML=icon(muted?'silent':'sound');q('#sound-control summary').setAttribute('aria-label',`ตั้งค่าเสียงกระดาษ · ${muted?'ปิดเสียง':Math.round(s.volume*100)+' เปอร์เซ็นต์'}`);q('#sound-mute').textContent=s.muted?'เปิดเสียง':'ปิดเสียง';q('#sound-mute').setAttribute('aria-pressed',String(s.muted));q('#sound-volume').value=String(Math.round(s.volume*100));q('#sound-percent').textContent=Math.round(s.volume*100)+'%';}
soundControls();
listen(root,'pointerdown',e=>{if(e.isTrusted&&e.target.closest('[data-stage],[data-page],[data-travel-page],[data-junction-page],[data-gateway],[data-action="junction"]'))paperAudio.prime();},{capture:true});
listen(document,'click',e=>{if(!q('#sound-control').contains(e.target))q('#sound-control').open=false;});
let toastTimer, unlockTimer;
function toast(text){q('#toast').textContent=text;q('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>q('#toast').classList.remove('show'),3200);}
function showDialog(title,html){q('#dialog-title').textContent=title;q('#dialog-content').innerHTML=html;q('#dialog').showModal();}
function closeDialog(){q('#dialog').close();}
function placeEntries(category=state.place,tier=state.tier){return Object.entries(tree.nodes).filter(([,n])=>n.category===category&&tree.sections[n.section].tier===tier&&(category!=='specialist'||(n.branch||n.requiresJob)===state.branch));}
function places(){return tree.constellations.filter(c=>placeEntries(c.id).length);}
function updateChrome(){
 const progress=journalProgress(ch,data);
 q('#point-count').textContent=ch.jobPoints;q('#job-level').textContent=ch.jobLevel;
 q('#top-folio').textContent='หน้าที่ '+num(state.tier);q('#page-folio').textContent=num(state.tier)+' / 06';
 q('#chapter-tabs').innerHTML=progress.stages.map(s=>`<button data-stage="${s.tier}" class="chapter-tab ${state.tier===s.tier?'active':''} ${s.unlocked?'':'sealed'}" aria-label="บท ${s.tier} ${s.nameTh}" aria-current="${state.tier===s.tier?'step':'false'}"><span>${num(s.tier)}</span>${s.unlocked?'':icon('lock')}</button>`).join('');
 q('#allocation-summary').textContent=`ลงทุนแล้ว ${progress.spent} แต้ม · ${ch.jobNodes.length-1} รอยจด`;
 q('#mobile-stages').innerHTML=progress.stages.map(s=>`<button data-stage="${s.tier}" aria-label="พื้นที่ ${s.tier} ${s.nameTh}${s.unlocked?'':' ยังไม่เปิด'}" aria-current="${state.tier===s.tier?'step':'false'}" class="${state.tier===s.tier?'active':''} ${s.unlocked?'':'sealed'}">${num(s.tier)}${s.unlocked?'':icon('lock')}</button>`).join('');
 const next=progress.next;
 q('#chapter-note').innerHTML=next?`<span>บทถัดไป ${num(next.tier)}</span><span>ลงทุนอีก <b>${next.requiresSpent-progress.spent} แต้ม</b></span><div class="chapter-note-track"><i style="width:${Math.min(100,progress.spent/next.requiresSpent*100)}%"></i></div>`:`<span>ทุกบทเปิดแล้ว · เขียนเส้นทางต่อได้ตามใจ</span>`;

}
function palette(n){if(n.category==='foundation'){const fx=n.effects||{},family=Object.keys(fx).some(k=>/mp/i.test(k))?'area':fx.magic?'specialist':fx.attack?'melee':fx.defense?'lasting':fx.maxHp?'support':'foundation';return tree.constellations.find(c=>c.id===family).color;}const c=tree.constellations.find(c=>c.id===n.category);const g=tree.groups.find(g=>g.id===(n.branch||n.requiresJob));return n.category==='specialist'&&g?g.color:c?.color||'#467268';}
function inkStyle(color){return `--branch-color:${color};--node-ink:color-mix(in srgb,${color} 56%,#252b33);--node-wash:color-mix(in srgb,${color} 9%,#fffdf7)`;}
function junctions(){return tree.constellations.flatMap(c=>{
 if(c.id==='specialist')return tree.groups.filter(g=>Object.values(tree.nodes).some(n=>n.category===c.id&&(n.branch||n.requiresJob)===g.id&&tree.sections[n.section].tier===state.tier)).map(g=>({...c,key:c.id+':'+g.id,branch:g.id,color:g.color,nameTh:g.nameTh,labelTh:'รอยทาง · '+g.nameTh,icon:({vanguard:'camp',arcanist:'book',warden:'tree',ranger:'horizon'})[g.id],entries:Object.entries(tree.nodes).filter(([,n])=>n.category===c.id&&(n.branch||n.requiresJob)===g.id&&tree.sections[n.section].tier===state.tier)}));
 const entries=placeEntries(c.id);return entries.length?[{...c,key:c.id,labelTh:c.labelTh||c.nameTh,entries}]:[];
 });}
function openBranch(key){const [place,branch]=key.split(':');if(!junctions().some(c=>c.key===key))return;changePage(()=>{if(branch)state.branch=branch;state.place=place;state.view='path';renderRegion();},1);}
function showJunction(){if(state.tier===1&&state.view==='travel')return;changePage(()=>{state.view=state.tier<4?'travel':'junction';renderRegion();},-1);}
function travelSpreads(){return chapterSpreads(tree,state.tier,innerHeight<=520?4:6);}
function revealInk(){const sheet=q('.app-shell');sheet.classList.remove('ink-revealing');void sheet.offsetWidth;sheet.classList.add('ink-revealing');}
function drawTravel(){
 const spreads=travelSpreads();state.travelPage=Math.max(0,Math.min(state.travelPages[state.tier]??state.travelPage,spreads.length-1));state.travelPages[state.tier]=state.travelPage;
 const leaves=spreads[state.travelPage],mobile=innerWidth<=760,short=innerHeight<=520,width=short?1700:mobile?1020:2500,height=short?440:mobile?leaves.reduce((n,l)=>n+Math.ceil(l.entries.length/2),0)*250+170:970;
 state.entries=leaves.flatMap(l=>l.entries);state.coords={};let rowOffset=0;
 leaves.forEach((leaf,side)=>{leaf.entries.forEach(([id],i)=>state.coords[id]=short?[(side?1110:150)+(i%2)*420,110+Math.floor(i/2)*180]:[mobile?(i%2?770:250):(side?1650:200)+(i%2)*650,mobile?180+(rowOffset+Math.floor(i/2))*250:200+Math.floor(i/2)*270]);rowOffset+=Math.ceil(leaf.entries.length/2);});
 q('#place-title').textContent='ค่อย ๆ เขียนเส้นทาง';q('#place-desc').textContent='ต่อยอดจากสิ่งที่เรียนรู้ · เปิดดูโหนดได้ก่อนใช้แต้ม';
 q('#junction-pagination').hidden=spreads.length<=1;q('#junction-pagination').innerHTML=`<button data-travel-page="-1" ${state.travelPage===0?'disabled':''} aria-label="หน้ารอยทางก่อนหน้า">←</button><span>รอยทาง ${state.travelPage+1} / ${spreads.length}</span><button data-travel-page="1" ${state.travelPage===spreads.length-1?'disabled':''} aria-label="หน้ารอยทางถัดไป">→</button>`;
 q('#travel-leaf-labels').hidden=false;q('#travel-leaf-labels').innerHTML=leaves.map((l,i)=>`<span style="${inkStyle(l.color)}">${esc(l.label)}<small>${num(state.tier)}.${num(state.travelPage*2+i+1)}</small></span>`).join('');
 const ids=new Set(state.entries.map(([id])=>id));const outside=[...new Set(state.entries.flatMap(([,n])=>n.links.filter(k=>!ids.has(k))))].filter(k=>tree.sections[tree.nodes[k].section].tier<=state.tier).slice(0,mobile?2:4);
 outside.forEach((id,i)=>state.coords[id]=[mobile?260+i*500:300+i*620,35]);
 drawNodes({width,height},outside);
 if(mobile&&!short)camera.frame(width/2,400,.35);
}
function drawNodes(layout,outside){
 plane.style.width=layout.width+'px';plane.style.height=layout.height+'px';
 plane.innerHTML=`<svg class="connections" width="${layout.width}" height="${layout.height}" aria-hidden="true"></svg>${outside.map(id=>`<button class="gateway" data-gateway="${id}" style="left:${state.coords[id][0]}px;top:${state.coords[id][1]}px">${icon('chevron')}<span>${esc(tree.nodes[id].nameTh)}<small>โหนดที่เชื่อมมา · เปิดดู</small></span></button>`).join('')}${state.entries.map(([id,n])=>`<button class="node" data-node="${id}" aria-pressed="false" style="left:${state.coords[id][0]}px;top:${state.coords[id][1]}px;${inkStyle(palette(n))}"><span class="node-disc">${icon(effectSigil(n))}</span><span class="node-state"></span><span class="node-caption"><b>${esc(n.nameTh)}</b><small>${esc(effectEntries(n).map(([k,v])=>effectText(k,v)).join(' · '))||'จุดเริ่มต้นของทุกคน'}</small></span></button>`).join('')}`;
 paintGraph();camera.configure(layout.width,layout.height);map.classList.remove('arriving');void map.offsetWidth;map.classList.add('arriving');
}
function renderJunction(stage){
 const all=junctions(),mobile=innerWidth<=760,short=innerHeight<=520,pageSize=short?(mobile?2:4):8;
 state.junctionPage=Math.max(0,Math.min(state.junctionPage,Math.ceil(all.length/pageSize)-1));
 const branches=all.slice(state.junctionPage*pageSize,(state.junctionPage+1)*pageSize);
 const columns=mobile?2:4,rows=Math.ceil(branches.length/columns),width=mobile?780:short?2100:2300,height=short?260:mobile?rows*285+75:rows*330+120;
 const xs=mobile?[175,605]:short?[150,750,1350,1950]:[180,755,1545,2120];
 q('#junction-pagination').hidden=all.length<=pageSize;
 q('#junction-pagination').innerHTML=`<button data-junction-page="-1" ${state.junctionPage===0?'disabled':''} aria-label="หน้าทางแยกก่อนหน้า">←</button><span>ทางแยก ${state.junctionPage+1} / ${Math.ceil(all.length/pageSize)}</span><button data-junction-page="1" ${state.junctionPage===Math.ceil(all.length/pageSize)-1?'disabled':''} aria-label="หน้าทางแยกถัดไป">→</button>`;
 state.entries=[];state.coords={};plane.style.width=width+'px';plane.style.height=height+'px';
 const nodes=branches.map((c,i)=>({c,x:xs[i%columns],y:130+Math.floor(i/columns)*(mobile?285:short?340:330)}));
 plane.innerHTML=`<svg class="junction-traces" width="${width}" height="${height}" aria-hidden="true">${nodes.map(({x,y},i)=>i?`<path d="M${nodes[i-1].x} ${nodes[i-1].y} Q${(nodes[i-1].x+x)/2} ${y-38},${x} ${y}"/>`:'').join('')}</svg>`+nodes.map(({c,x,y},i)=>{const ready=c.entries.filter(([id])=>jobNodeState(ch,data,id).can).length,owned=c.entries.filter(([id])=>ch.jobNodes.includes(id)).length;return `<button class="discipline-node ${ready?'has-ready':''}" data-gateway="branch:${c.key}" data-discipline="${c.key}" style="left:${x}px;top:${y}px;${inkStyle(c.color)}" aria-label="เปิดหน้าสาย ${esc(c.labelTh)} · ไม่ใช้แต้ม"><span class="discipline-number">${num(state.junctionPage*pageSize+i+1)}</span><span class="discipline-disc">${icon(c.icon)}<span class="discipline-open">${icon('arrow')}</span></span><span class="discipline-caption"><b>${esc(c.nameTh)}</b><span>${esc(c.labelTh)}</span><small>${c.entries.length} รอยจด${owned?' · บันทึกแล้ว '+owned:ready?' · พร้อม '+ready:' · ดูเงื่อนไขในหน้า'}</small></span></button>`}).join('');
 q('#map-status').innerHTML=`${icon('signpost')} <span>${all.length} ทางในบทนี้</span><i></i><span>เปิดหน้าสาย · ลากเพื่อดูต่อ · ไม่ใช้แต้ม</span>`;
 camera.configure(width,height);if(mobile)camera.frame(width/2,short?height/2:390,.46);
}
function closeDetail(restore=false){const id=state.selected;state.selected=null;inspector.classList.remove('open');inspector.inert=true;inspector.setAttribute('aria-hidden','true');q('.atlas-space').classList.remove('has-detail');camera.setSheet(0);plane.querySelectorAll('.node.selected').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false')});if(restore&&id)plane.querySelector(`[data-node="${id}"]`)?.focus({preventScroll:true});}
function reasonText(st){return st.taken?'เรียนรู้แล้ว':st.can?'พร้อมเรียนรู้':({not_linked:'ต้องเชื่อมจากโหนดที่เรียนรู้แล้ว',no_points:'แต้มคงเหลือไม่เพียงพอ',tier_points:`ต้องลงทุนรวม ${st.need} แต้ม`,job_level:`ต้องมี Job Lv.${st.need}`,one_job:'เลือกอาชีพได้หนึ่งสาย · รีแต้มก่อนเปลี่ยน',requires_job:`ต้องเรียนรู้โหนด ${tree.groups.find(g=>g.id===st.need)?.nameTh||st.need}`}[st.reason]||'ยังเรียนรู้ไม่ได้');}
function select(id){
 const n=tree.nodes[id];if(!n||!state.coords[id])return;
 const st=jobNodeState(ch,data,id);state.selected=id;inspector.style.cssText=inkStyle(palette(n));
 plane.querySelectorAll('.node').forEach(el=>{const on=el.dataset.node===id;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on))});
 const path=jobPath(ch,data,id).filter(k=>k!==id),tier=tree.sections[n.section].tier;
 q('#detail-content').innerHTML=`<div class="detail-scroll"><div class="detail-kicker">FIELD NOTE · ENTRY ${num(tier)}</div><div class="detail-emblem ${st.taken?'learned':''}">${icon(effectSigil(n))}</div><span class="type-label">${n.type==='origin'?'จุดเริ่มต้นร่วมกัน':n.type==='job'?'โหนดอาชีพ · เลือกได้หนึ่งสาย':n.type==='notable'?'โหนดหลัก':'โหนดพื้นฐาน'}</span><h2>${esc(n.nameTh)}</h2><p class="detail-subtitle">${esc(n.descTh||'สิ่งที่เรียนรู้ระหว่างทาง และเลือกพาติดตัวไปต่อ')}</p>${n.tags?.length?`<div class="tag-list">${n.tags.map(t=>`<span>${esc(TAGS[t]||t)}</span>`).join('')}</div>`:''}<div class="effect-list">${effectEntries(n).map(([k,v])=>`<div><span>${esc(effectLabel(k))}</span><b>${esc(effectValue(k,v))}</b></div>`).join('')||'<p>นักเดินทางทุกคนเริ่มที่นี่</p>'}</div><div class="requirements"><span class="detail-section-label">โหนดที่เชื่อม · ต้องเรียนรู้แล้ว 1 จุด</span>${n.type==='origin'?'<p>จุดตั้งต้น · ไม่ใช้แต้ม</p>':n.links.map(k=>{const linked=tree.nodes[k],owned=ch.jobNodes.includes(k);return `<button data-jump="${k}" class="requirement-link ${owned?'owned':''}">${icon(owned?'check':'chevron')}<span>${esc(linked.nameTh)}</span><small>${owned?'เรียนรู้แล้ว':'ดูโหนด'}</small></button>`}).join('')}</div>${!st.can&&!st.taken&&path.length?`<p class="path-hint">เส้นทางสั้นที่สุดยังเหลือ ${path.length} โหนดก่อนจุดนี้ · ยังต้องผ่านเงื่อนไขพื้นที่</p>`:''}</div><div class="detail-action"><p class="availability ${st.can||st.taken?'ready':''}"><span class="little-dot"></span>${esc(reasonText(st))}</p><button class="learn-button" data-action="learn" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?`บันทึกแล้ว ${icon('check')}`:`เรียนรู้และบันทึก <span>1 แต้ม ${icon('arrow')}</span>`}</button><small>การเลือกดูโหนดไม่ใช้แต้ม</small></div>`;
 inspector.inert=false;inspector.setAttribute('aria-hidden','false');inspector.classList.add('open');q('.atlas-space').classList.add('has-detail');
 const wide=innerWidth>760;camera.setSheet(wide?inspector.offsetWidth+20:0);camera.focus(...state.coords[id]);
}
function graphLayout(entries){
 if(state.tier===1&&state.view==='travel'&&state.travelPage===0){
  const mobile=innerWidth<=760,short=innerHeight<=520,width=mobile&&!short?1020:1700,height=short?440:mobile?1220:780;
  return {width,height,coords:Object.fromEntries(entries.map(([id],i)=>[id,mobile&&!short?[i%2?770:250,140+Math.floor(i/2)*270]:[220+(i%4)*420,(short?110:170)+Math.floor(i/4)*(short?180:380)]]))};
 }
 if(innerWidth<=760){
  const ordered=[...entries].sort((a,b)=>a[1].clusterPos[1]-b[1].clusterPos[1]||a[1].clusterPos[0]-b[1].clusterPos[0]);
  return {width:1020,height:Math.max(780,Math.ceil(entries.length/2)*240+120),coords:Object.fromEntries(ordered.map(([id],i)=>[id,[i%2?770:250,180+Math.floor(i/2)*240]]))};
 }
 // Spread authored rows across the two leaves; links and purchase rules stay in core.
 const rows=[...new Set(entries.map(([,n])=>n.clusterPos[1]))].sort((a,b)=>a-b);
 const xs=[...new Set(entries.map(([,n])=>n.clusterPos[0]))].sort((a,b)=>a-b);
 const width=1700,height=Math.max(780,rows.length*240+120);
 const coords=Object.fromEntries(entries.map(([id,n])=>[id,[xs.length===1?850:260+xs.indexOf(n.clusterPos[0])*1180/(xs.length-1),180+rows.indexOf(n.clusterPos[1])*240]]));
 return {width,height,coords};
}
function edgeHtml(){
 const ids=new Set(state.entries.map(([id])=>id)),seen=new Set();let paths='';
 for(const [id,n] of state.entries)for(const k of n.links){if(!state.coords[k])continue;const pair=[id,k].sort().join(':');if(seen.has(pair))continue;seen.add(pair);
 const [x,y]=state.coords[id],[xx,yy]=state.coords[k],owned=ch.jobNodes.includes(id)&&ch.jobNodes.includes(k),available=(ch.jobNodes.includes(id)&&jobNodeState(ch,data,k).can)||(ch.jobNodes.includes(k)&&jobNodeState(ch,data,id).can);
 const d=Math.abs(yy-y)<110?`M${x} ${y} C${(x+xx)/2} ${y},${(x+xx)/2} ${yy},${xx} ${yy}`:`M${x} ${y} C${x} ${(y+yy)/2},${xx} ${(y+yy)/2},${xx} ${yy}`;
 const cls=`edge ${owned?'learned':available?'ready':''} ${ids.has(k)?'':'external'} ${state.justLearned&&(id===state.justLearned||k===state.justLearned)?'new-edge':''}`;
 paths+=`<path ${cls.includes('new-edge')?'pathLength="1"':''} d="${d}" class="${cls}"/>`;
 }
 return paths;
}
function paintGraph(){
 const connections=plane.querySelector('.connections');if(!connections)return;connections.innerHTML=edgeHtml();
 for(const [id,n] of state.entries){const el=plane.querySelector(`[data-node="${id}"]`),st=jobNodeState(ch,data,id);el.className=`node ${n.type} ${st.taken?'learned':st.can?'available':'locked'} ${state.selected===id?'selected':''} ${state.justLearned===id?'new-node':''}`;el.setAttribute('aria-label',`${n.nameTh} · ${reasonText(st)}`);el.querySelector('.node-state').innerHTML=st.taken?icon('check'):st.can?'<span class="little-dot"></span>':icon('lock');}
 q('#map-status').innerHTML=`<span class="little-dot"></span>${state.entries.filter(([id])=>jobNodeState(ch,data,id).can).length} โหนดพร้อมเรียนรู้ <i></i><span class="muted-dot"></span><span class="status-note">เลือกดูรายละเอียดก่อนลงทุน</span>`;
}
function renderRegion(){
 closeDetail();updateChrome();revealInk();
 const progress=journalProgress(ch,data),stage=progress.stages.find(s=>s.tier===state.tier),options=places();
 if(!options.some(c=>c.id===state.place))state.place=options.find(c=>placeEntries(c.id).some(([id])=>jobNodeState(ch,data,id).can))?.id||options[0].id;
 const place=options.find(c=>c.id===state.place),junction=state.view==='junction'&&state.tier>=4,travel=state.view==='travel'&&state.tier<4&&!(state.tier===1&&state.travelPage===0);
 q('#chapter-watermark').textContent=num(state.tier);
 q('#map-eyebrow').innerHTML=`<span class="little-dot"></span> EXPEDITION ${num(state.tier)} <i>/</i> ${stageNames[state.tier-1].toUpperCase()}`;
 q('#place-title').textContent=state.tier===1?'ก้าวแรกของการเดินทาง':junction?stage.nameTh:state.place==='specialist'?tree.groups.find(g=>g.id===state.branch).nameTh:place.nameTh;
 q('#place-desc').textContent=state.tier===1?'ทุกเส้นทางเริ่มที่นี่ · ค่อย ๆ บันทึกสิ่งที่จะพาติดตัวไป':junction?'รอยทางเริ่มหนาแน่น · เปิดดูหน้าสายย่อยที่เกี่ยวข้อง':state.place==='specialist'?'ค่อย ๆ ต่อยอดสิ่งที่เรียนรู้ · แต่ละรอยจดมีเงื่อนไขของตัวเอง':place.descTh;
 const switcher=q('#place-switch');switcher.hidden=junction||travel||(state.tier===1&&state.view==='travel')||!stage.unlocked;switcher.innerHTML=`<span class="back-mark">←</span><span>กลับ${state.tier<4?'รอยทาง':'ทางแยก'}บท ${num(state.tier)}</span>`;
 q('.atlas-space').classList.toggle('junction-view',junction);q('.atlas-space').classList.toggle('travel-view',travel);q('#junction-pagination').hidden=true;q('#travel-leaf-labels').hidden=true;q('.atlas-space').style.cssText=junction?'':inkStyle(state.place==='specialist'?tree.groups.find(g=>g.id===state.branch).color:place.color);
 const sealed=q('#locked-region');sealed.hidden=stage.unlocked;map.hidden=!stage.unlocked;q('#map-status').hidden=!stage.unlocked;q('.map-controls').hidden=!stage.unlocked;
 if(!stage.unlocked){plane.innerHTML='';q('#place-title').textContent=stage.nameTh;q('#place-desc').textContent='เส้นทางบทใหม่ รอให้คุณพร้อมออกเดินทาง';sealed.innerHTML=`<div class="locked-orbit">${icon('lock')}</div><small>THE NEXT CHAPTER</small><h2>ยังเดินทางไม่ถึงพื้นที่นี้</h2><p>ลงทุนรวม <strong>${stage.requiresSpent} แต้ม</strong> เพื่อเปิดพื้นที่ ${num(state.tier)}<br>ตอนนี้ใช้ไปแล้ว ${progress.spent} แต้ม · ยังเหลืออีก ${stage.requiresSpent-progress.spent}</p><div class="locked-progress"><span style="width:${Math.min(100,progress.spent/stage.requiresSpent*100)}%"></span></div><button class="primary-button" data-stage="${progress.current.tier}">กลับพื้นที่ที่เปิดแล้ว ${icon('arrow')}</button><span class="locked-note">แต้มคงเหลือไม่นับเป็นแต้มที่ลงทุน</span>`;return;}
 if(junction){renderJunction(stage);return;}if(travel){drawTravel();return;}
 state.entries=state.tier===1&&state.view==='travel'?startingEntries(tree):placeEntries();const layout=graphLayout(state.entries);state.coords=layout.coords;
 if(state.tier===1&&state.view==='travel'){const pages=travelSpreads();q('#junction-pagination').hidden=pages.length<=1;q('#junction-pagination').innerHTML=`<button data-travel-page="-1" disabled aria-label="หน้ารอยทางก่อนหน้า">←</button><span>รอยทาง 1 / ${pages.length}</span><button data-travel-page="1" aria-label="หน้ารอยทางถัดไป">→</button>`;}

 const ids=new Set(state.entries.map(([id])=>id));
 const outside=[...new Set(state.entries.flatMap(([,n])=>n.links.filter(k=>!ids.has(k))))].filter(k=>ch.jobNodes.includes(k)||tree.sections[tree.nodes[k].section].tier<state.tier).slice(0,4);
 outside.forEach((id,i)=>state.coords[id]=[170+i*340,45]);
 drawNodes(layout,outside);if(innerWidth<=760&&state.tier>1)camera.frame(layout.width/2,400,.35);
 q('.atlas-space').classList.remove('page-turn');void map.offsetWidth;q('.atlas-space').classList.add('page-turn');
}
function navigate(tier,place,branch){const direction=Number(tier)<state.tier?-1:1;changePage(()=>{if(branch)state.branch=branch;state.tier=Number(tier);state.junctionPage=0;state.view=!place?(state.tier<4?'travel':'junction'):'path';if(state.view==='travel'&&state.travelPages[state.tier]===undefined){const pages=travelSpreads(),ready=pages.findIndex(leaves=>leaves.some(l=>l.entries.some(([id])=>jobNodeState(ch,data,id).can)));state.travelPage=Math.max(0,ready);state.travelPages[state.tier]=state.travelPage;}if(place)state.place=place;state.justLearned=null;renderRegion();},direction);}
function jump(id){const n=tree.nodes[id];if(!n)return;if(q('#dialog').open)closeDialog();const tier=tree.sections[n.section].tier;
 if(tier<4){changePage(()=>{state.tier=tier;state.view='travel';const pages=travelSpreads();state.travelPage=Math.max(0,pages.findIndex(leaves=>leaves.some(l=>l.entries.some(([key])=>key===id))));state.travelPages[tier]=state.travelPage;renderRegion();},tier<state.tier?-1:1);}
 else navigate(tier,n.category,n.branch||n.requiresJob||state.branch);
 if(journalProgress(ch,data).stages.find(s=>s.tier===tier).unlocked)requestAnimationFrame(()=>{if(!destroyed)select(id)});
}

function learn(id){const previous=journalProgress(ch,data),result=allocateJobNode(ch,data,id);if(!result.done){toast(reasonText(result));return;}state.justLearned=id;ui.game.notify({type:'job'});ui.changed();updateChrome();paintGraph();select(id);const next=journalProgress(ch,data);if(next.current.tier>previous.current.tier){toast(`พื้นที่ ${num(next.current.tier)} เปิดแล้ว — ${next.current.nameTh}`);q(`[data-stage="${next.current.tier}"]`).classList.add('just-unlocked');}else toast(`เรียนรู้ ${tree.nodes[id].nameTh} แล้ว`);clearTimeout(unlockTimer);unlockTimer=setTimeout(()=>{state.justLearned=null;paintGraph();},900);}
function search(){showDialog('ค้นหาเส้นทาง',`<div class="search-field">${icon('search')}<input type="search" id="node-search" aria-label="ค้นหาชื่อหรือค่าสถานะ" placeholder="ชื่อโหนด ธาตุ หรือค่าสถานะ…" autocomplete="off"></div><p class="dialog-note">ค้นหาได้ทุกพื้นที่ · การเปิดดูไม่ใช้แต้ม</p><div id="search-results" class="dialog-list"></div>`);searchResults('');q('#node-search').focus();}
function searchResults(query){const text=query.trim().toLocaleLowerCase();const entries=Object.entries(tree.nodes).filter(([id,n])=>text?[id,n.name,n.nameTh,n.descTh,...(n.tags||[]).map(t=>TAGS[t]||t),...effectEntries(n).map(([k,v])=>effectText(k,v))].join(' ').toLocaleLowerCase().includes(text):jobNodeState(ch,data,id).can);q('#search-results').innerHTML=`<div class="result-count">${text?entries.length+' โหนดที่พบ':'พร้อมเรียนรู้ตอนนี้'}</div>`+entries.map(([id,n])=>{const s=tree.sections[n.section],unlocked=journalProgress(ch,data).spent>=s.requiresSpent;return `<button class="search-result" data-jump="${id}"><span class="result-icon">${icon(effectSigil(n))}</span><span><b>${esc(n.nameTh)}</b><small>พื้นที่ ${num(s.tier)} · ${esc(effectEntries(n).map(([k,v])=>effectText(k,v)).join(' · '))}</small></span>${unlocked?icon('arrow'):`<span class="result-lock">${icon('lock')} ${s.requiresSpent} แต้ม</span>`}</button>`}).join('')+(entries.length?'':'<p class="empty-results">ไม่พบโหนดที่ตรงกัน ลองค้นหาด้วยคำสั้นลง</p>');}
function resetDialog(){const cost=respecCost(ch,data).job;showDialog('เริ่มเขียนเส้นทางใหม่',`<p class="reset-copy">คืนแต้มที่ลงทุนทั้งหมด แล้วเริ่มที่พื้นฐานร่วมกันอีกครั้ง</p><div class="reset-cost"><span>ค่าธรรมเนียมในเมือง</span><b>${cost} G</b></div><p class="dialog-note">มี ${ch.gold} G · ${ui.game.nearby().inTown?'อยู่ในเมือง':'ต้องกลับเข้าเมือง'}<br>เลเวล สกิล อุปกรณ์ และ Stat Point จะยังอยู่ครบ</p><button class="primary-button full" data-action="confirm-respec" ${ch.jobNodes.length<2||ch.gold<cost||!ui.game.nearby().inTown?'disabled':''}>คืนแต้มและเริ่มใหม่ ${icon('reset')}</button>`);}
listen(root,'click',e=>{
 const t=e.target.closest('button,[data-action]');if(!t)return;
 if(t.dataset.travelPage){changePage(()=>{state.travelPage+=Number(t.dataset.travelPage);state.travelPages[state.tier]=state.travelPage;renderRegion();},Number(t.dataset.travelPage));return;}
 if(t.dataset.junctionPage){changePage(()=>{state.junctionPage+=Number(t.dataset.junctionPage);renderRegion();},Number(t.dataset.junctionPage));return;}
 if(t.dataset.stage)return navigate(t.dataset.stage);
 if(t.dataset.page)return navigate(Math.max(1,Math.min(6,state.tier+Number(t.dataset.page))));
 if(t.dataset.jump)return jump(t.dataset.jump);
 switch(t.dataset.action){
 case 'exit':ui.close();break;
 case 'toggle-sound':{const s=paperAudio.snapshot();paperAudio.set(!s.muted);soundControls();if(s.muted)paperAudio.prime();break;}
 case 'search':search();break;case 'junction':showJunction();break;case 'close-dialog':closeDialog();break;
 
 case 'close-detail':closeDetail(true);break;case 'learn':learn(t.dataset.id);break;
 case 'fit':camera.fit();break;case 'zoom-out':camera.zoom(1/1.2);break;case 'zoom-in':camera.zoom(1.2);break;
 case 'respec':resetDialog();break;case 'confirm-respec':if(ui.game.nearby().inTown&&respecJob(ch,data)){ui.changed();closeDialog();navigate(1);toast('คืนแต้มแล้ว พร้อมออกเดินทางอีกครั้ง');}break;
 }
});
listen(root,'input',e=>{if(e.target.id==='node-search')searchResults(e.target.value);if(e.target.id==='sound-volume'){paperAudio.set(paperAudio.snapshot().muted,Number(e.target.value)/100);soundControls();}});
listen(q('#dialog'),'click',e=>{if(e.target===q('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
listen(root,'keydown',e=>{if(e.key==='Escape'){if(q('#dialog').open){e.preventDefault();e.stopPropagation();closeDialog();return;}if(q('#sound-control').open){e.preventDefault();e.stopPropagation();q('#sound-control').open=false;return;}if(state.selected){e.preventDefault();e.stopPropagation();closeDetail(true);return;}}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)&&!q('#dialog').open){e.preventDefault();search();}});
renderRegion();
let layoutKey=`${innerWidth<=760}:${innerHeight<=520}`,resizeTimer;
listen(window,'resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const key=`${innerWidth<=760}:${innerHeight<=520}`,id=state.selected;if(key!==layoutKey){layoutKey=key;renderRegion();if(id&&state.coords[id])select(id);}else if(id)camera.setSheet(innerWidth>760?inspector.offsetWidth+20:0);},150);});
const snapshot=()=>({tier:state.tier,place:state.place,view:state.view,travelPage:state.travelPage,junctionPage:state.junctionPage,branch:state.branch,selected:state.selected,points:ch.jobPoints,owned:[...ch.jobNodes],progress:journalProgress(ch,data),camera:camera.snapshot(),pageTurn:pageTurns.snapshot(),audio:paperAudio.snapshot()});
return {snapshot,audioEvents:()=>paperAudio.events(),refresh(){if(destroyed)return;updateChrome();paintGraph();if(state.selected)select(state.selected);},destroy(){if(destroyed)return;destroyed=true;clearTimeout(toastTimer);clearTimeout(unlockTimer);clearTimeout(resizeTimer);closeDialog();state.selected=null;state.justLearned=null;camera.destroy();pageTurns.destroy();paperAudio.destroy();cleanups.forEach(fn=>fn());}};
}
