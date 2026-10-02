import {jobNodeState, jobTierProgress, jobJourneyProgress, jobPath, currentJob, respecCost} from '../core/character.js';
import {esc,tagsHtml,TAGS} from './buildmeta.js';
import {sigil,effectSigil} from './sigils.js';

export function clusterNodes(tree,category,branch,tier) {
 return Object.entries(tree.nodes).filter(([,n])=>n.category===category&&(category!=='specialist'||(n.branch||n.requiresJob)===branch)&&(!tier||tree.sections[n.section].tier===tier));
}
const effects=(n,format)=>Object.entries(n.effects).map(([k,v])=>format(k,v).replace(/ % ([+\-]?[0-9.]+)$/,' $1%'));
const button=(act,id,label,cls='')=>`<button class="btn ${cls}" data-act="${act}" data-id="${id}">${label}</button>`;
function header(ui){const {ch,data}=ui.game;return `<header class="journal-toolbar"><button class="journal-back" data-act="close-journal" aria-label="กลับเข้าเกม">←</button><div class="journal-title"><small>สมุดเล่มที่ 01 / บันทึกของ ${esc(ch.name||'นักเดินทาง')}</small><h3>บันทึกการเดินทาง</h3></div><form class="seeker-node-search"><input id="node-search" name="node-search" type="search" aria-label="ค้นหาโหนดทุกหน้า" placeholder="ค้นหารอยจด / ค่าสถานะ" value="${esc(ui.sel.nodeSearch||'')}"><button class="journal-icon" type="submit" aria-label="ค้นหา">${sigil('eye')}</button></form><div class="journal-points"><b>${ch.jobPoints}</b><span>แต้มคงเหลือ<small>Job Lv.${ch.jobLevel}/${data.progression.job.maxLevel}</small></span></div><button class="journal-reset" data-act="journal-reset" aria-label="ตัวเลือกรีแต้ม">↺</button></header>`;}
function bookmarks(progress,tier){return `<nav class="journey-bookmarks" aria-label="พื้นที่การเดินทาง">${progress.stages.map(s=>`<button class="journey-bookmark ${s.tier===tier?'on':''} ${s.unlocked?'open':'sealed'}" data-act="journal-stage" data-id="${s.tier}" aria-pressed="${s.tier===tier}" ${s.unlocked?'':'disabled'}><b>${String(s.tier).padStart(2,'0')}</b><span>ขั้น ${s.tier}</span>${s.unlocked?'':sigil('shield')}</button>`).join('')}</nav>`;}
function sketch(stage){return `<svg class="journey-sketch" viewBox="0 0 250 142" aria-label="ภาพร่างเส้นทางเดินทาง"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 110q50-70 89-26t77-44l53-14" stroke-width="1.4" stroke-dasharray="3 7"/><path d="M19 95l10-36 11 36M12 81h35M191 53l14-28 18 28M185 42h43" stroke-width="1.2"/><path d="M33 119q77 8 118-15t83-6M7 126q66 10 110-4" stroke-width=".7"/><circle cx="103" cy="84" r="23" stroke-width=".8"/><path d="M63 21h57l-4 26H59zM78 17l-2 39M171 114l15-24 16 24zM186 90v26" stroke-width="1.2"/></g><g transform="translate(90 69) scale(1.1)">${sigil(stage.sketch).replace('<svg','<svg width="24" height="24"')}</g><text x="18" y="31">รอยเท้าของเรา</text><text x="153" y="134">ทางยังทอดยาว…</text></svg>`;}
function resetSheet(ui){const g=ui.game,cost=respecCost(g.ch,g.data).job;return `<aside class="journal-inspector journal-reset-sheet" role="region" aria-label="รีแต้มพาสซีฟ"><button class="journal-dismiss" data-act="journal-reset" aria-label="ปิดตัวเลือกรีแต้ม">×</button><small>เริ่มเขียนเส้นทางอีกครั้ง</small><h3>รีแต้มพาสซีฟ</h3><p>คืน Job Point ที่ลงทุนทั้งหมด ไม่ลบเลเวลสกิล ม็อด หรือ Stat Point</p><p>ค่าใช้จ่าย ${cost} G · ต้องอยู่ในเมือง</p><button class="btn primary" data-act="respec-job" ${g.nearby().inTown&&g.ch.gold>=cost&&g.ch.jobNodes.length>1?'':'disabled'}>ยืนยันรีแต้ม · ${cost} G</button></aside>`;}
function detail(ui,id,format){
 const {ch,data}=ui.game,n=data.jobtree.nodes[id];if(!n)return '';
 const tree=data.jobtree,st=jobNodeState(ch,data,id),tier=jobTierProgress(ch,data,id);
 const text=st.taken?'จดบันทึกแล้ว':st.reason==='tier_points'?`พื้นที่ขั้น ${tier.tier} ยังไม่เปิด · ลงทุนอีก ${st.need-st.have} แต้ม`:st.reason==='not_linked'?'ต้องต่อจากโหนดที่ลงทุนไว้':st.reason==='no_points'?'แต้มคงเหลือไม่พอ':st.reason==='job_level'?'ต้องมี Job Lv.'+st.need:st.reason==='one_job'?'เลือกอาชีพได้หนึ่งสาย · รีแต้มก่อนเปลี่ยน':st.reason==='requires_job'?'ต้องเลือกอาชีพ '+tree.groups.find(x=>x.id===st.need)?.nameTh:'พร้อมลงทุน 1 แต้ม';
 const route=st.taken||st.can?[]:jobPath(ch,data,id).filter(k=>k!==id);
 return `<aside class="journal-inspector seeker-node-detail" role="region" aria-label="รายละเอียดโหนด" aria-live="polite"><button class="journal-dismiss" data-act="dismiss-node" aria-label="ปิดรายละเอียดโหนด">×</button><small>รอยจดในพื้นที่ขั้น ${tier.tier} / ${n.type==='minor'?'โหนดย่อย':n.type==='job'?'คำสาบาน':'โหนดหลัก'}</small><h3>${esc(n.nameTh)}</h3>${n.tags?tagsHtml(n.tags,'node'):''}<div class="journal-tier-status"><b>พื้นที่ขั้น ${tier.tier}</b><span>${tier.spent>=tier.requires?'เปิดแล้ว · เดินตามเส้นเชื่อม':`ใช้แต้มรวม ${tier.spent}/${tier.requires}`}</span></div><div class="seeker-effects">${effects(n,format).map(e=>`<p>${esc(e)}</p>`).join('')||'<p>จุดเริ่มต้นของนักเดินทางทุกคน</p>'}</div><p>${esc(text)}</p>${route.length?`<div class="seeker-route"><b>เส้นทางที่ยังต้องต่อ</b>${route.map(k=>button('jump-node',k,esc(tree.nodes[k].nameTh)+' ↗')).join('')}<small>กดเพื่อดูรอยจด · ไม่ใช้แต้มอัตโนมัติ</small></div>`:''}<button class="btn primary" data-act="take-node" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?'บันทึกแล้ว ✓':'ลงทุน · 1 แต้ม'}</button></aside>`;
}
function footer(progress,tier){const prev=progress.stages.find(s=>s.tier===tier-1),next=progress.stages.find(s=>s.tier===tier+1);return `<footer class="journal-footer"><div class="journey-pagination">${prev?button('journal-stage',prev.tier,'← หน้าก่อน'):''}<span>หน้า ${String(tier).padStart(2,'0')} / 06</span>${next?`<button class="btn" data-act="journal-stage" data-id="${next.tier}" ${next.unlocked?'':'disabled'}>${next.unlocked?'หน้าถัดไป →':`หน้าถัดไป · อีก ${next.requiresSpent-progress.spent} แต้ม`}</button>`:''}</div><div class="seeker-graph-tools"><button class="btn" data-fit>ดูผัง</button><button class="btn" data-zoom="-1" aria-label="ซูมออก">−</button><output>100%</output><button class="btn" data-zoom="1" aria-label="ซูมเข้า">+</button><button class="btn" data-focus aria-label="ไปยังโหนดที่เลือก">◎</button></div></footer>`;}

export function jobView(ui,{effectText}){
 const {game:g,sel}=ui,{ch,data}=g,tree=data.jobtree,progress=jobJourneyProgress(ch,data);
 const tier=Math.min(6,Math.max(1,Number(sel.journalStage)||1)),stage=progress.stages.find(s=>s.tier===tier),branch=sel.jobBranch||currentJob(ch,data)?.branch||tree.groups[0].id;
 const places=tree.constellations.filter(c=>clusterNodes(tree,c.id,branch,tier).length);
 const ready=c=>clusterNodes(tree,c.id,branch,tier).some(([id])=>jobNodeState(ch,data,id).can);
 const category=places.find(c=>c.id===sel.constellation)||places.find(ready)||places[0];
 const entries=clusterNodes(tree,category.id,branch,tier),head=header(ui),tabs=bookmarks(progress,tier),query=sel.nodeSearch?.trim().toLocaleLowerCase();
 if(query){const matches=Object.entries(tree.nodes).filter(([id,n])=>[id,n.name,n.nameTh,n.descTh,...(n.tags||[]).map(t=>TAGS[t]||t),...effects(n,effectText)].join(' ').toLocaleLowerCase().includes(query));return `<div class="journal-screen journey-journal">${head}${tabs}<section class="journal-results"><div class="journal-results-head"><h3>พบ ${matches.length} รอยจด</h3>${button('clear-node-search','','กลับสมุด')}</div>${matches.map(([id,n])=>`<button class="seeker-search-result" data-act="jump-node" data-id="${id}"><b>${esc(n.nameTh)}</b><span>พื้นที่ขั้น ${tree.sections[n.section].tier} · ${esc(effects(n,effectText).join(' · '))}</span></button>`).join('')||'<p>ไม่พบรอยจดที่ตรงกัน</p>'}</section></div>`;}
 const next=progress.stages.find(s=>s.tier===tier+1);
 const index=places.map(c=>`<button class="seeker-constellation journey-place ${c.id===category.id?'on':''}" data-act="constellation" data-id="${c.id}">${sigil(c.icon)}<span><b>${esc(c.nameTh)}</b><small>${esc(c.labelTh)} ${ready(c)?'· ไปต่อได้':''}</small></span><i>↗</i></button>`).join('');
 const notes=`<aside class="journey-notes"><div class="journey-entry"><small>พื้นที่ขั้น ${tier}</small><h2>${stage.nameTh}</h2><p class="journey-prose">${stage.descTh}</p></div>${sketch(stage)}<div class="journey-record"><b>ใช้ไปแล้ว ${progress.spent} แต้ม</b><small>นับรวมตลอดการเดินทาง</small>${next?`<span>${next.unlocked?'หน้าถัดไปเปิดแล้ว ✓':`ลงทุนอีก ${next.requiresSpent-progress.spent} แต้ม<br>เพื่อเปิดพื้นที่ขั้น ${next.tier}`}</span>`:'<span>เขียนเส้นทางช่วงท้ายได้แล้ว ✓</span>'}</div><details class="journey-index"><summary>รอยจดข้างทาง <span>⌄</span></summary><div class="journey-places">${index}</div></details><span class="journey-signature">เลือกสิ่งที่จะพาติดตัวไปต่อ…</span></aside>`;
 if(!stage.unlocked)return `<div class="journal-screen journey-journal">${head}${tabs}<div class="journey-book">${notes}<section class="journey-leaf journey-locked"><span class="journey-seal">${sigil('flag')}</span><small>หน้านี้ยังว่างอยู่</small><h2>ยังเดินทางไม่ถึงขั้น ${tier}</h2><p>ใช้แต้มรวม ${progress.spent}/${stage.requiresSpent} แต้ม<br>กลับไปต่อเส้นในพื้นที่ที่เปิดแล้ว</p>${button('journal-stage',progress.current.tier,'กลับพื้นที่ที่เปิดแล้ว')}</section></div>${footer(progress,tier)}</div>`;
 const ids=new Set(entries.map(([id])=>id)),w=tree.layout.pageWidth,h=Math.max(800,...entries.map(([,n])=>n.clusterPos[1]+155));
 const coords=Object.fromEntries(entries.map(([id,n])=>[id,n.clusterPos]));
 const outside=[...new Set(entries.flatMap(([,n])=>n.links.filter(id=>!ids.has(id))))].filter(id=>tree.sections[tree.nodes[id].section].tier<tier||ch.jobNodes.includes(id)).slice(0,4);
 outside.forEach((id,i)=>{coords[id]=[130+i*185,45];});
 const edges=entries.flatMap(([id,n])=>n.links.filter(k=>coords[k]&&(!ids.has(k)||id<k)).map(k=>{const [x,y]=coords[id],[xx,yy]=coords[k],mid=(y+yy)/2;return `<path d="M${x} ${y} C${x} ${mid},${xx} ${mid},${xx} ${yy}" class="seeker-edge ${ch.jobNodes.includes(id)&&ch.jobNodes.includes(k)?'taken':''} ${ids.has(k)?'':'external'}"/>`;})).join('');
 const nodes=entries.map(([id,n])=>{const s=jobNodeState(ch,data,id),[x,y]=n.clusterPos;return `<button class="seeker-node ${n.type} ${s.taken?'taken':s.can?'available':'locked'} ${sel.node===id?'selected':''}" data-act="node" data-id="${id}" data-node-x="${x}" data-node-y="${y}" aria-pressed="${sel.node===id}" aria-label="${esc(n.nameTh+' · '+(s.taken?'ลงทุนแล้ว':s.can?'ลงทุนได้':'ยังลงทุนไม่ได้'))}" style="left:${x}px;top:${y}px"><span class="seeker-node-disc">${sigil(effectSigil(n))}</span>${s.taken?'<i>✓</i>':''}<span class="seeker-node-caption"><b>${esc(n.nameTh)}</b><small>${esc(effects(n,effectText).join(' · '))||'ทุกคนเริ่มที่นี่'}</small></span></button>`;}).join('');
 const gates=outside.map(id=>{const n=tree.nodes[id],[x,y]=coords[id];return `<button class="journal-gateway" data-act="jump-node" data-id="${id}" style="left:${x}px;top:${y}px">${sigil(effectSigil(n))}<span>${esc(n.nameTh)}<small>รอยจดที่เชื่อมมา ↗</small></span></button>`;}).join('');
 const branches=category.id==='specialist'?`<div class="journal-oaths">${tree.groups.map(c=>button('job-branch',c.id,c.nameTh,c.id===branch?'on':'')).join('')}</div>`:'';
 const focusId=entries.some(([id])=>id===sel.node)?sel.node:[...ch.jobNodes].reverse().find(id=>ids.has(id))||entries.find(([id])=>jobNodeState(ch,data,id).can)?.[0]||entries[0][0];
 const graph=`<div class="seeker-graph" tabindex="0" aria-label="เส้นทางในพื้นที่ขั้น ${tier}" data-stage="${tier}" data-width="${w}" data-height="${h}" data-selected="${focusId}"><div class="seeker-plane" style="width:${w}px;height:${h}px"><svg class="journal-lines" width="${w}" height="${h}" aria-hidden="true">${edges}</svg>${gates}${nodes}<span class="journey-map-note" style="left:55px;top:${h-65}px">✎ เลือกรอยจดตามเส้นทาง · ไม่ต้องเก็บครบทุกโหนด</span></div></div>`;
 return `<div class="journal-screen journey-journal" style="--chapter-ink:${category.color}">${head}${tabs}<div class="journey-book" data-journey-stage="${tier}">${notes}<section class="journey-leaf"><div class="journey-leaf-heading"><small>บันทึก ณ</small><h2>${esc(category.nameTh)}</h2><span>ขั้น ${tier} · ${stage.nameTh}</span></div>${branches}${graph}</section></div>${footer(progress,tier)}${sel.journalReset?resetSheet(ui):sel.node?detail(ui,sel.node,effectText):''}</div>`;
}

/** Camera affects the view only. No pointer gesture allocates points. */
export function mountJobNetwork(ui) {
  const root=ui.body.querySelector('.seeker-graph');if(!root)return()=>{};
  const plane=root.querySelector('.seeker-plane'),output=ui.body.querySelector('.seeker-graph-tools output');
  const w=+root.dataset.width,h=+root.dataset.height,key=root.dataset.stage+':'+(ui.sel.constellation||'default')+':'+(ui.sel.jobBranch||'');
  const cameras=ui.jobCameras||(ui.jobCameras={}),narrow=ui.overlay.clientWidth<700;
  const fitZoom=()=>Math.min(root.clientWidth/w,root.clientHeight/h)*.95;
  const clamp=z=>Math.max(.3,Math.min(1.7,z));
  const start=ui.game.data.jobtree.nodes[root.dataset.selected]?.clusterPos||[w/2,h/2];
  const cam=cameras[key]||(cameras[key]={x:w/2,y:Math.max(root.clientHeight/2,start[1]+root.clientHeight/2-160),zoom:1});
  const paint=()=>{
    plane.style.setProperty('--inverse-zoom',1/cam.zoom);
    plane.style.setProperty('--node-hit',Math.max(60,44/cam.zoom)+'px');
    cam.x=Math.max(0,Math.min(w,cam.x));cam.y=Math.max(0,Math.min(h,cam.y));
    plane.style.transform=`translate(${root.clientWidth/2-cam.x*cam.zoom}px,${root.clientHeight/2-cam.y*cam.zoom}px) scale(${cam.zoom})`;
    output.value=Math.round(cam.zoom*100)+'%';
  };
  const fit=()=>{Object.assign(cam,{x:w/2,y:h/2,zoom:clamp(fitZoom())});paint();};
  const center=(x,y)=>{
    cam.x=x;cam.y=y;cam.zoom=1;
    const sheet=ui.body.querySelector('.journal-inspector');
    if(narrow&&sheet){
      const visible=sheet.getBoundingClientRect().top-root.getBoundingClientRect().top;
      // Keep the selected node above the phone's details sheet, including its caption.
      const anchor=Math.max(42,Math.min(root.clientHeight/2,visible*.35));
      cam.y+=root.clientHeight/2-anchor;
    }
    if(!narrow&&sheet){const free=sheet.getBoundingClientRect().left-root.getBoundingClientRect().left;if(free>0&&free<root.clientWidth)cam.x+=root.clientWidth/2-Math.max(70,free*.5);}
    paint();
  };
  const focus=()=>{
    const n=ui.game.data.jobtree.nodes[root.dataset.selected];
    if(!n)return fit();center(...n.clusterPos);
  };
  const zoom=(next,x=root.clientWidth/2,y=root.clientHeight/2)=>{
    next=clamp(next);const dx=x-root.clientWidth/2,dy=y-root.clientHeight/2;
    cam.x+=dx/cam.zoom-dx/next;cam.y+=dy/cam.zoom-dy/next;cam.zoom=next;paint();
  };
  const click=e=>{
    const t=e.target.closest('[data-zoom],[data-fit],[data-focus],[data-focus-stage]');if(!t)return;
    if(t.dataset.zoom)zoom(cam.zoom*(+t.dataset.zoom>0?1.2:1/1.2));
    if(t.hasAttribute('data-fit'))fit();if(t.hasAttribute('data-focus'))focus();
    if(t.hasAttribute('data-focus-stage'))center(+t.dataset.stageX,+t.dataset.stageY);
  };
  const pts=new Map();let drag=null,suppress=false;
  const measure=()=>{const p=[...pts.values()];return p.length===1?{x:p[0].x,y:p[0].y,d:0}:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};};
  const down=e=>{
    if(e.button>0)return;if(!pts.size)suppress=false;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size>1)suppress=true;
    drag={...measure(),cx:cam.x,cy:cam.y,z:cam.zoom};
  };
  const move=e=>{
    if(!pts.has(e.pointerId)||!drag)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=measure();
    if(!suppress&&Math.hypot(m.x-drag.x,m.y-drag.y)<5&&Math.abs(m.d-drag.d)<5)return;
    suppress=true;try{root.setPointerCapture(e.pointerId);}catch{}e.preventDefault();
    const z=drag.d&&m.d?clamp(drag.z*m.d/drag.d):drag.z,r=root.getBoundingClientRect();
    cam.x=drag.cx+(drag.x-r.left-root.clientWidth/2)/drag.z-(m.x-r.left-root.clientWidth/2)/z;
    cam.y=drag.cy+(drag.y-r.top-root.clientHeight/2)/drag.z-(m.y-r.top-root.clientHeight/2)/z;cam.zoom=z;paint();
  };
  const up=e=>{pts.delete(e.pointerId);drag=pts.size?{...measure(),cx:cam.x,cy:cam.y,z:cam.zoom}:null;};
  const cancel=e=>{pts.delete(e.pointerId);drag=null;suppress=true;};
  const lost=e=>{if(pts.has(e.pointerId))cancel(e);};
  const guard=e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false;}};
  const wheel=e=>{e.preventDefault();const r=root.getBoundingClientRect();zoom(cam.zoom*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);};
  const keydown=e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key)||e.target!==root)return;
    e.preventDefault();e.stopPropagation();
    if(e.key==='Home')fit();else if(e.key==='+')zoom(cam.zoom*1.2);else if(e.key==='-')zoom(cam.zoom/1.2);
    else{cam.x+=({'ArrowLeft':-80,'ArrowRight':80}[e.key]||0)/cam.zoom;cam.y+=({'ArrowUp':-80,'ArrowDown':80}[e.key]||0)/cam.zoom;paint();}
  };
  const listeners=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',lost],['click',guard,true],['wheel',wheel,{passive:false}],['keydown',keydown]];
  for(const args of listeners)root.addEventListener(...args);ui.body.addEventListener('click',click);
  const resize=new ResizeObserver(paint);resize.observe(root);paint();
  if(ui.focusNextNode||ui.sel.node){focus();ui.focusNextNode=false;}
  return()=>{resize.disconnect();ui.body.removeEventListener('click',click);for(const args of listeners)root.removeEventListener(...args);pts.clear();};
}
