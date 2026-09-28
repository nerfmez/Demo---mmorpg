import {art} from './art.js';
import {jobNodeState,jobPath,currentJob,respecCost} from '../core/character.js';

const SIZE=1080, UNIT=9, PAD=90;
const xy=n=>[PAD+n.pos[0]*UNIT,PAD+n.pos[1]*UNIT];
export function jobView(ui,{effectText}) {
 const {game:g,sel}=ui,{ch,data}=g,tree=data.jobtree,near=g.nearby(),cost=respecCost(ch,data);
 const id=tree.nodes[sel.node]?sel.node:tree.origin,n=tree.nodes[id],st=jobNodeState(ch,data,id);
 const path=jobPath(ch,data,id),remaining=path.filter(k=>!ch.jobNodes.includes(k));
 const route=new Set(path.slice(1).map((k,i)=>[path[i],k].sort().join('|')));
 const groups=tree.groups,groupName=branch=>groups.find(g=>g.id===branch)?.nameTh;
 const reason=st.taken?'เลือกโหนดนี้แล้ว':st.reason==='requires_job'?'ต้องเลือกอาชีพ '+groupName(st.need):st.reason==='not_linked'?'ต่อเส้นทางจากโหนดที่เลือกแล้วก่อน':st.reason==='no_points'?'Job Point ไม่พอ':st.reason==='job_level'?'เปิดเมื่อ Job Lv.'+st.need:st.reason==='one_job'?'เลือกอาชีพหลักได้หนึ่งสาย · รีแต้มเพื่อเปลี่ยน':'พร้อมลง 1 Job Point';
 const edges=Object.entries(tree.nodes).flatMap(([a,na])=>na.links.filter(b=>a<b).map(b=>{
  const [x1,y1]=xy(na),[x2,y2]=xy(tree.nodes[b]);
  const taken=ch.jobNodes.includes(a)&&ch.jobNodes.includes(b),preview=route.has([a,b].join('|'));
  const next=(ch.jobNodes.includes(a)&&jobNodeState(ch,data,b).can)||(ch.jobNodes.includes(b)&&jobNodeState(ch,data,a).can);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="network-link ${taken?'taken':preview?'preview':next?'available':''}"/>`;
 })).join('');
 const nodes=Object.entries(tree.nodes).map(([key,node])=>{
  const state=jobNodeState(ch,data,key),[x,y]=xy(node),color=groups.find(g=>g.id===node.group)?.color||'#b6cabe';
  return `<button class="network-node ${node.type} ${state.taken?'taken':''} ${state.can?'can':''} ${sel.node===key?'on':''} ${remaining.includes(key)?'on-route':''}" data-act="node" data-id="${key}" style="left:${x}px;top:${y}px;--branch:${color}" aria-label="${node.nameTh} · ${state.taken?'เลือกแล้ว':state.can?'ลงแต้มได้':node.requiresJob?'เฉพาะอาชีพ':'ยังไม่ปลดล็อก'}" aria-pressed="${id===key}" title="${node.nameTh}">${art('job',key)}<span class="node-mark">${state.taken?'✓':state.can?'+':node.type==='job'?'JOB':''}</span><span class="node-label">${node.nameTh}</span></button>`;
 }).join('');
 return `<div class="workbench-summary job-summary"><div><h3>เครือข่ายอาชีพ</h3><small>61 โหนด · เลือกอาชีพหลัก แล้วเชื่อมสายร่วมเพื่อสร้าง Build</small></div><span class="level-pill">Job Lv.${ch.jobLevel} · เหลือ ${ch.jobPoints} แต้ม</span></div>
 <div class="job-network-layout"><section class="network-shell" aria-label="แผนผังอาชีพ">
 <div class="network-sectors"><button data-job-focus="origin" class="btn">จุดเริ่ม</button>${groups.map(g=>`<button data-job-focus="${g.job}" class="btn" style="--branch:${g.color}">${tree.nodes[g.job].nameTh}</button>`).join('')}</div>
 <div class="network-viewport" tabindex="0" aria-label="ลากเพื่อเลื่อนเครือข่าย ใช้ปุ่มบวกหรือลบเพื่อซูม">
 <div class="network-plane" style="width:${SIZE}px;height:${SIZE}px"><svg class="network-lines" width="${SIZE}" height="${SIZE}" aria-hidden="true"><circle cx="540" cy="540" r="215" class="network-orbit"/><circle cx="540" cy="540" r="354" class="network-orbit"/><circle cx="540" cy="540" r="469" class="network-orbit"/>${edges}</svg>${nodes}</div>
 </div><div class="network-tools"><button data-job-zoom="1" aria-label="ซูมเข้า">+</button><output class="network-scale">100%</output><button data-job-zoom="-1" aria-label="ซูมออก">−</button><button data-job-fit aria-label="ดูเครือข่ายทั้งหมด">ทั้งหมด</button></div>
 <div class="network-legend"><span class="learned">✓ ลงแล้ว</span><span class="ready">+ ลงได้</span><span class="route">เส้นทางที่เล็งไว้</span><small>ลากเลื่อน · สองนิ้วซูม</small></div></section>
 <aside class="job-detail network-detail card" aria-live="polite"><div class="node-detail-title">${art('job',id)}<div><span class="section-kicker">${n.type==='job'?'อาชีพหลัก':n.requiresJob?'เฉพาะ '+groupName(n.requiresJob):n.group==='hybrid'?'เส้นทางร่วม':n.name}</span><h3>${n.nameTh}</h3></div></div>
 <div class="job-effects">${Object.entries(n.effects).map(([k,v])=>`<div>${effectText(k,v)}</div>`).join('')||'<p>เริ่มจากสายที่สนใจ แล้วเชื่อมข้ามไปเสริม Build ได้</p>'}</div>
 ${n.descTh?`<p class="node-description">${n.descTh}</p>`:''}
 <p class="node-status ${st.can?'ok':'muted'}">${reason}</p>
 <button class="btn primary" data-act="take-node" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?'ลงแต้มแล้ว':'ลงแต้ม · 1 JP'}</button>
 ${remaining.length>1?`<div class="route-summary"><small>อีก ${remaining.length} แต้มถึงโหนดนี้</small><button class="btn" data-job-next="${remaining[0]}">ดูโหนดถัดไป →</button></div>`:''}
 <details class="respec-area"><summary>อาชีพ: ${currentJob(ch,data)?.nameTh||'นักเดินทาง'} · ลงแล้ว ${ch.jobNodes.length-1} แต้ม · รีแต้ม</summary><button class="btn" data-act="respec-job" ${near.inTown&&ch.gold>=cost.job&&ch.jobNodes.length>1?'':'disabled'}>รีแต้ม Job · ${cost.job} G</button><small class="muted">กลับนิคมเพื่อรีแต้ม</small></details></aside></div>`;
}

/** View-only pan/zoom controller. Its camera survives node inspection and allocation. */
export function mountJobNetwork(ui) {
 const root=ui.body.querySelector('.network-viewport');if(!root)return ()=>{};
 const plane=root.querySelector('.network-plane'),output=ui.body.querySelector('.network-scale');
 const cam=ui.jobCamera||(ui.jobCamera={x:540,y:540,zoom:1});
 const clamp=v=>Math.max(.3,Math.min(1.6,v));
 const paint=()=>{
  const w=root.clientWidth,h=root.clientHeight;
  cam.x=Math.max(0,Math.min(SIZE,cam.x));cam.y=Math.max(0,Math.min(SIZE,cam.y));
  plane.style.transform=`translate(${w/2-cam.x*cam.zoom}px,${h/2-cam.y*cam.zoom}px) scale(${cam.zoom})`;
  root.classList.toggle('overview',cam.zoom<.62);output.value=Math.round(cam.zoom*100)+'%';
 };
 const focus=id=>{const n=ui.game.data.jobtree.nodes[id];if(!n)return;[cam.x,cam.y]=xy(n);cam.zoom=root.clientWidth<400?.88:1;paint();};
 const zoom=(next,x=root.clientWidth/2,y=root.clientHeight/2)=>{
  next=clamp(next);const dx=x-root.clientWidth/2,dy=y-root.clientHeight/2;
  cam.x+=dx/cam.zoom-dx/next;cam.y+=dy/cam.zoom-dy/next;cam.zoom=next;paint();
 };
 const onClick=e=>{
  const t=e.target.closest('[data-job-focus],[data-job-zoom],[data-job-fit],[data-job-next]');if(!t)return;
  if(t.dataset.jobFocus)focus(t.dataset.jobFocus);
  if(t.dataset.jobZoom)zoom(cam.zoom*(Number(t.dataset.jobZoom)>0?1.2:1/1.2));
  if(t.hasAttribute('data-job-fit')){cam.x=540;cam.y=540;cam.zoom=clamp(Math.min(root.clientWidth,root.clientHeight)/SIZE*.95);paint();}
  if(t.dataset.jobNext){ui.sel.node=t.dataset.jobNext;focus(t.dataset.jobNext);ui.render();}
 };
 const points=new Map();let drag=null,suppress=false;
 const measure=()=>{const p=[...points.values()];return p.length===1?{x:p[0].x,y:p[0].y,d:0}:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};};
 const down=e=>{
  if(e.target.closest('.network-tools')||e.button>0)return;
  points.set(e.pointerId,{x:e.clientX,y:e.clientY});
  drag={...measure(),cx:cam.x,cy:cam.y,zoom:cam.zoom};
  suppress=false;
 };
 const move=e=>{
  if(!points.has(e.pointerId)||!drag)return;
  points.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=measure();
  if(!suppress&&Math.hypot(m.x-drag.x,m.y-drag.y)<5&&Math.abs(m.d-drag.d)<5)return;
  suppress=true;root.setPointerCapture(e.pointerId);e.preventDefault();
  const z=drag.d&&m.d?clamp(drag.zoom*m.d/drag.d):drag.zoom;
  const rect=root.getBoundingClientRect();
  cam.x=drag.cx+(drag.x-rect.left-root.clientWidth/2)/drag.zoom-(m.x-rect.left-root.clientWidth/2)/z;
  cam.y=drag.cy+(drag.y-rect.top-root.clientHeight/2)/drag.zoom-(m.y-rect.top-root.clientHeight/2)/z;
  cam.zoom=z;paint();
 };
 const up=e=>{points.delete(e.pointerId);drag=points.size?{...measure(),cx:cam.x,cy:cam.y,zoom:cam.zoom}:null;};
 const cancel=e=>{points.delete(e.pointerId);drag=null;};
 const guard=e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false;}};
 const wheel=e=>{e.preventDefault();const r=root.getBoundingClientRect();zoom(cam.zoom*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);};
 const key=e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key))return;
  if(e.target.closest('.network-tools'))return;e.preventDefault();e.stopPropagation();
  if(e.key==='Home')focus('origin');else if(e.key==='+')zoom(cam.zoom*1.2);else if(e.key==='-')zoom(cam.zoom/1.2);
  else{cam.x+=({'ArrowRight':100,'ArrowLeft':-100}[e.key]||0)/cam.zoom;cam.y+=({'ArrowDown':100,'ArrowUp':-100}[e.key]||0)/cam.zoom;paint();}
 };
 ui.body.addEventListener('click',onClick);root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);root.addEventListener('click',guard,true);root.addEventListener('wheel',wheel,{passive:false});root.addEventListener('keydown',key);
 const resize=new ResizeObserver(paint);resize.observe(root);paint();
 return()=>{resize.disconnect();ui.body.removeEventListener('click',onClick);};
}
