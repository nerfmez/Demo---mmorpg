import {jobNodeState, jobPath, currentJob, respecCost} from '../core/character.js';
import {esc} from './buildmeta.js';
import {sigil, effectSigil} from './sigils.js';

export function clusterNodes(tree, category, branch) {
  return Object.entries(tree.nodes).filter(([,n]) => n.category === category &&
    (category !== 'specialist' || (n.branch || n.requiresJob) === branch));
}
const effects = (n, format) => Object.entries(n.effects).map(([k,v]) => format(k,v).replace(/ % ([+\-]?[0-9.]+)$/, ' $1%'));
const button = (act,id,label,cls='') => `<button class="btn ${cls}" data-act="${act}" data-id="${id}">${label}</button>`;

function journalHeader(ui, chapter) {
  const {ch}=ui.game;
  return `<header class="journal-toolbar">
    <button class="journal-back" data-act="${chapter?'constellation':'close-journal'}" data-id="" aria-label="${chapter?'กลับภาพรวม':'กลับเข้าเกม'}">←</button>
    <div class="journal-title"><small>SEEKER / FIELD JOURNAL</small><h3>${chapter?chapter.nameTh:'บันทึกการเดินทาง'}</h3></div>
    <form class="seeker-node-search"><input id="node-search" name="node-search" type="search" aria-label="ค้นหาโหนดทุกบท" placeholder="ค้นหาโหนด / ค่าสถานะ" value="${esc(ui.sel.nodeSearch||'')}"><button class="journal-icon" type="submit" aria-label="ค้นหา">${sigil('eye')}</button></form>
    <div class="journal-points"><b>${ch.jobPoints}</b><span>แต้มพาสซีฟ<small>Job Lv.${ch.jobLevel}</small></span></div>
    <button class="journal-reset" data-act="journal-reset" aria-label="ตัวเลือกรีแต้ม">↺</button>
  </header>`;
}
function footer() {
  return `<footer class="journal-footer"><span>ลากเพื่อเลื่อน · สองนิ้วเพื่อซูม <i>เลือกบางเส้นทางจากหลายบทได้</i></span><div class="seeker-graph-tools"><button class="btn" data-fit>ดูทั้งหมด</button><button class="btn" data-zoom="-1" aria-label="ซูมออก">−</button><output>100%</output><button class="btn" data-zoom="1" aria-label="ซูมเข้า">+</button><button class="btn" data-focus aria-label="ไปยังโหนดที่เลือก">◎</button></div></footer>`;
}
function graph(content, width, height, selected, overview=false) {
  return `<div class="seeker-graph ${overview?'journal-overview':''}" tabindex="0" aria-label="${overview?'ภาพรวมบันทึก':'เครือข่ายโหนดในบท'}" data-width="${width}" data-height="${height}" data-selected="${selected||''}"><div class="seeker-plane" style="width:${width}px;height:${height}px">${content}</div></div>`;
}
function resetSheet(ui) {
  const {game:g}=ui, cost=respecCost(g.ch,g.data).job;
  return `<aside class="journal-inspector journal-reset-sheet" role="region" aria-label="รีแต้มพาสซีฟ"><button class="journal-dismiss" data-act="journal-reset" aria-label="ปิดตัวเลือกรีแต้ม">×</button><small>เริ่มเขียนเส้นทางอีกครั้ง</small><h3>รีแต้มพาสซีฟ</h3><p>คืน Job Point ที่ลงทุนทั้งหมด ไม่ลบเลเวลสกิล ม็อด หรือ Stat Point</p><p>ค่าใช้จ่าย ${cost} G · ต้องอยู่ในเมือง</p><button class="btn primary" data-act="respec-job" ${g.nearby().inTown && g.ch.gold>=cost && g.ch.jobNodes.length>1?'':'disabled'}>ยืนยันรีแต้ม · ${cost} G</button></aside>`;
}
function detail(ui, id, format) {
  const {ch,data}=ui.game,tree=data.jobtree,n=tree.nodes[id];
  if(!n)return '';
  const st=jobNodeState(ch,data,id), route=jobPath(ch,data,id).filter(k=>!ch.jobNodes.includes(k));
  const chapter=tree.constellations.find(c=>c.id===n.category);
  const text=st.taken?'ลงทุนแล้ว':st.reason==='not_linked'?'ต้องต่อจากโหนดที่ลงทุนไว้':st.reason==='no_points'?'แต้มพาสซีฟไม่พอ':st.reason==='job_level'?'ต้องมี Job Lv.'+st.need:st.reason==='one_job'?'เลือกอาชีพได้หนึ่งสาย · รีแต้มก่อนเปลี่ยน':st.reason==='requires_job'?'ต้องเลือกอาชีพ '+tree.groups.find(x=>x.id===st.need)?.nameTh:'พร้อมลงทุน 1 แต้ม';
  const cross=n.links.filter(k=>tree.nodes[k].category!==n.category);
  return `<aside class="journal-inspector seeker-node-detail" role="region" aria-label="รายละเอียดโหนด" aria-live="polite"><button class="journal-dismiss" data-act="dismiss-node" aria-label="ปิดรายละเอียดโหนด">×</button><small>${chapter.nameTh} / ${n.type==='minor'?'บันทึกย่อย':n.type==='job'?'คำสาบาน':'บันทึกสำคัญ'}</small><h3>${n.nameTh}</h3><div class="seeker-effects">${effects(n,format).map(e=>`<p>${e}</p>`).join('')||'<p>จุดเริ่มต้นของทุกเส้นทาง</p>'}</div><p>${text}</p><button class="btn primary" data-act="take-node" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?'บันทึกแล้ว ✓':'ลงทุน · 1 แต้ม'}</button>${route.length>1?`<div class="seeker-route"><small>อีก ${route.length} แต้มตามเส้นทางสั้นที่สุด</small>${button('jump-node',route[0],'ไปดูขั้นก่อนหน้า →')}</div>`:''}${cross.length?`<details class="seeker-crosslinks"><summary>เชื่อมไปยังบันทึกอื่น (${cross.length})</summary>${cross.map(k=>button('jump-node',k,tree.nodes[k].nameTh+' ↗')).join('')}</details>`:''}</aside>`;
}

export function jobView(ui,{effectText}) {
  const {game:g,sel}=ui, {ch,data}=g,tree=data.jobtree,chapters=tree.constellations;
  const category=chapters.find(c=>c.id===sel.constellation),branch=sel.jobBranch||tree.groups[0].id;
  const head=journalHeader(ui,category),query=sel.nodeSearch?.trim().toLocaleLowerCase();
  if(query) {
    const matches=Object.entries(tree.nodes).filter(([id,n])=>[id,n.name,n.nameTh,n.descTh,...effects(n,effectText),chapters.find(c=>c.id===n.category).nameTh].join(' ').toLocaleLowerCase().includes(query));
    return `<div class="journal-screen">${head}<section class="journal-results"><div class="journal-results-head"><h3>พบ ${matches.length} บันทึก</h3>${button('clear-node-search','','กลับผัง')}</div>${matches.map(([id,n])=>`<button class="seeker-search-result" data-act="jump-node" data-id="${id}"><b>${n.nameTh}</b><span>${chapters.find(c=>c.id===n.category).nameTh} · ${effects(n,effectText).join(' · ')}</span></button>`).join('')||'<p>ไม่พบบันทึกที่ตรงกัน</p>'}</section></div>`;
  }
  if(!category) {
    const narrow=ui.overlay.clientWidth<700;
    const mapWidth=narrow?600:1580,mapHeight=narrow?1200:710;
    const positions=Object.fromEntries(chapters.map((c,i)=>[c.id,narrow?[i%2?435:165,110+Math.floor(i/2)*230]:c.mapPos]));
    const paths=new Set();
    for(const n of Object.values(tree.nodes))for(const target of n.links) {
      const other=tree.nodes[target].category;
      if(n.category!==other)paths.add([n.category,other].sort().join('|'));
    }
    const roads=[...paths].map(pair=>{
      const [a,b]=pair.split('|').map(id=>chapters.find(c=>c.id===id));
      const [x,y]=positions[a.id],[xx,yy]=positions[b.id];
      return `<path d="M${x} ${y} C${x+(xx-x)*.5} ${y},${x+(xx-x)*.5} ${yy},${xx} ${yy}"/>`;
    }).join('');
    const stamps=chapters.map((c,i)=>{
      const entries=Object.entries(tree.nodes).filter(([,n])=>n.category===c.id);
      const count=entries.filter(([id,n])=>n.type!=='origin'&&ch.jobNodes.includes(id)).length;
      return `<button class="seeker-constellation journal-chapter ${count?'invested':''}" data-act="constellation" data-id="${c.id}" style="left:${positions[c.id][0]}px;top:${positions[c.id][1]}px;--chapter-ink:${c.color}" aria-label="เปิดบท ${c.nameTh} · ลงทุนแล้ว ${count} แต้ม"><span class="journal-chapter-no">${String(i+1).padStart(2,'0')}</span><span class="journal-stamp">${sigil(c.icon)}</span><strong>${c.nameTh}</strong><span class="journal-subtitle">${c.descTh}</span><small>${count?'ลงทุนแล้ว '+count+' แต้ม':'เปิดอ่านเส้นทาง'}</small></button>`;
    }).join('');
    return `<div class="journal-screen">${head}${graph(`<svg class="journal-roads" width="${mapWidth}" height="${mapHeight}" aria-hidden="true">${roads}</svg><span class="journal-map-caption">ทุกเส้นทาง ไม่จำเป็นต้องเดินจนสุด</span>${stamps}`,mapWidth,mapHeight,'',true)}${footer()}${sel.journalReset?resetSheet(ui):''}</div>`;
  }
  const entries=clusterNodes(tree,category.id,branch),ids=new Set(entries.map(([id])=>id));
  const w=1480,h=720;
  // Border markers are real neighbouring nodes in OTHER chapters, not invented
  // connections or a demand to complete that chapter. Clicking only navigates.
  const outside=[...new Set(entries.flatMap(([,n])=>n.links.filter(id=>!ids.has(id))))];
  const coords=Object.fromEntries(entries.map(([id,n])=>[id,n.clusterPos]));
  outside.forEach((id,i)=>{coords[id]=[100+(i%7)*(1280/Math.min(6,Math.max(1,outside.length-1))),i<7?54:655];});
  const edges=entries.flatMap(([id,n])=>n.links.filter(l=>!ids.has(l)||id<l).map(l=>{
    const [x,y]=coords[id],[xx,yy]=coords[l],taken=ch.jobNodes.includes(id)&&ch.jobNodes.includes(l);
    return `<line x1="${x}" y1="${y}" x2="${xx}" y2="${yy}" class="seeker-edge ${taken?'taken':''} ${ids.has(l)?'':'external'}"/>`;
  })).join('');
  const nodes=entries.map(([id,n])=>{
    const state=jobNodeState(ch,data,id),xy=coords[id],selected=sel.node===id;
    return `<button class="seeker-node ${n.type} ${state.taken?'taken':state.can?'available':'locked'} ${selected?'selected':''}" data-act="node" data-id="${id}" aria-pressed="${selected}" aria-label="${esc(n.nameTh+' · '+(state.taken?'ลงทุนแล้ว':state.can?'ลงทุนได้':'ยังลงทุนไม่ได้'))}" style="left:${xy[0]}px;top:${xy[1]}px"><span class="seeker-node-disc">${sigil(effectSigil(n))}</span>${state.taken?'<i>✓</i>':''}<span class="seeker-node-caption"><b>${n.nameTh}</b><small>${effects(n,effectText).join(' · ')||'จุดเริ่มต้น'}</small></span></button>`;
  }).join('');
  const gates=outside.map(id=>{
    const n=tree.nodes[id],xy=coords[id],c=chapters.find(c=>c.id===n.category);
    return `<button class="journal-gateway ${ch.jobNodes.includes(id)?'taken':''}" data-act="jump-node" data-id="${id}" style="left:${xy[0]}px;top:${xy[1]}px" aria-label="ไปดู ${n.nameTh} ในบท ${c.nameTh}">${sigil(c.icon)}<span>${n.nameTh}<small>${c.nameTh} ↗</small></span></button>`;
  }).join('');
  const branches=category.id==='specialist'?`<div class="journal-oaths">${tree.groups.map(c=>button('job-branch',c.id,c.nameTh,c.id===branch?'on':'')).join('')}<small>Job Lv.${data.progression.job.jobChoiceLevel} · เลือกหนึ่งอาชีพ</small></div>`:'';
  return `<div class="journal-screen" style="--chapter-ink:${category.color}">${head}${branches}${graph(`<svg class="journal-lines" width="${w}" height="${h}" aria-hidden="true">${edges}</svg>${gates}${nodes}`,w,h,sel.node||entries[0][0])}${footer()}${sel.journalReset?resetSheet(ui):sel.node?detail(ui,sel.node,effectText):''}</div>`;
}

/** Camera affects the view only. No pointer gesture allocates points. */
export function mountJobNetwork(ui) {
  const root=ui.body.querySelector('.seeker-graph');if(!root)return()=>{};
  const plane=root.querySelector('.seeker-plane'),output=ui.body.querySelector('.seeker-graph-tools output');
  const w=+root.dataset.width,h=+root.dataset.height,key=(ui.sel.constellation||'overview')+':'+(ui.sel.jobBranch||'');
  const cameras=ui.jobCameras||(ui.jobCameras={});
  const fitZoom=()=>Math.min(root.clientWidth/w,root.clientHeight/h)*.95;
  const clamp=z=>Math.max(.3,Math.min(1.7,z));
  const cam=cameras[key]||(cameras[key]={x:w/2,y:h/2,zoom:root.clientWidth<700?(root.classList.contains('journal-overview')?.60:.72):clamp(fitZoom())});
  const paint=()=>{
    plane.style.setProperty('--inverse-zoom',1/cam.zoom);
    plane.style.setProperty('--node-hit',Math.max(60,44/cam.zoom)+'px');
    cam.x=Math.max(0,Math.min(w,cam.x));cam.y=Math.max(0,Math.min(h,cam.y));
    plane.style.transform=`translate(${root.clientWidth/2-cam.x*cam.zoom}px,${root.clientHeight/2-cam.y*cam.zoom}px) scale(${cam.zoom})`;
    output.value=Math.round(cam.zoom*100)+'%';
  };
  const fit=()=>{Object.assign(cam,{x:w/2,y:h/2,zoom:root.clientWidth<700?(root.classList.contains('journal-overview')?.60:.72):clamp(fitZoom())});paint();};
  const focus=()=>{
    const n=ui.game.data.jobtree.nodes[root.dataset.selected];
    if(!n)return fit();[cam.x,cam.y]=n.clusterPos;cam.zoom=1;paint();
  };
  const zoom=(next,x=root.clientWidth/2,y=root.clientHeight/2)=>{
    next=clamp(next);const dx=x-root.clientWidth/2,dy=y-root.clientHeight/2;
    cam.x+=dx/cam.zoom-dx/next;cam.y+=dy/cam.zoom-dy/next;cam.zoom=next;paint();
  };
  const click=e=>{
    const t=e.target.closest('[data-zoom],[data-fit],[data-focus]');if(!t)return;
    if(t.dataset.zoom)zoom(cam.zoom*(+t.dataset.zoom>0?1.2:1/1.2));
    if(t.hasAttribute('data-fit'))fit();if(t.hasAttribute('data-focus'))focus();
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
  if(ui.focusNextNode){focus();ui.focusNextNode=false;}
  return()=>{resize.disconnect();ui.body.removeEventListener('click',click);for(const args of listeners)root.removeEventListener(...args);pts.clear();};
}
