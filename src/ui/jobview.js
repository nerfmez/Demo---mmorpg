import {jobNodeState, jobTierProgress, jobPath, respecCost} from '../core/character.js';
import {esc,tagsHtml,TAGS} from './buildmeta.js';
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
    <div class="journal-points"><b>${ch.jobPoints}</b><span>แต้มคงเหลือ<small>Job Lv.${ch.jobLevel}/${ui.game.data.progression.job.maxLevel}</small></span></div>
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
const tierName = (tier) => ['','I','II','III','IV','V','VI'][tier] || String(tier);
function investmentGuide(ch,tree) {
  const spent=new Set(ch.jobNodes.filter(id=>id!==tree.origin&&tree.nodes[id])).size;
  return `<div class="journal-investment"><b>ใช้ไปแล้ว ${spent} แต้ม <small>นับรวมทุกสาย</small></b><span>โหนดย่อย: ต่อเส้นจากโหนดที่มี · โหนดใหญ่: ต่อเส้น + ใช้แต้มรวมถึงเกณฑ์</span></div>`;
}
function detail(ui, id, format) {
  const {ch,data}=ui.game,tree=data.jobtree,n=tree.nodes[id];
  if(!n)return '';
  const st=jobNodeState(ch,data,id), tier=jobTierProgress(ch,data,id);
  const chapter=tree.constellations.find(c=>c.id===n.category);
  const text=st.taken?'ลงทุนแล้ว':st.reason==='tier_points'? `กลุ่มนี้ต้องใช้แต้มที่ลงทุนรวมอีก ${Math.max(0,st.need-st.have)} แต้ม`:st.reason==='not_linked'?'ต้องต่อจากโหนดที่ลงทุนไว้':st.reason==='no_points'?'แต้มพาสซีฟไม่พอ':st.reason==='job_level'?'ต้องมี Job Lv.'+st.need:st.reason==='one_job'?'เลือกอาชีพได้หนึ่งสาย · รีแต้มก่อนเปลี่ยน':st.reason==='requires_job'?'ต้องเลือกอาชีพ '+tree.groups.find(x=>x.id===st.need)?.nameTh:'พร้อมลงทุน 1 แต้ม';
  const cross=n.links.filter(k=>tree.nodes[k].category!==n.category);
  const tierStatus=tier.tier? `<div class="journal-tier-status"><b>${tier.major?'โหนดใหญ่ · ขั้น '+tierName(tier.tier):'โหนดย่อย'}</b><span>${tier.requires?`ใช้แต้มรวม ${tier.spent}/${tier.requires}`:'เดินตามเส้น · ไม่มีเกณฑ์แต้มรวม'}</span></div>`:'';
  const route=st.taken||st.can?[]:jobPath(ch,data,id).filter(k=>k!==id);
  const path=route.length?`<div class="seeker-route"><b>เส้นทางที่ยังต้องต่อ</b>${route.map(k=>button('jump-node',k,esc(tree.nodes[k].nameTh)+' ↗')).join('')}<small>กดเพื่อดูโหนด · ไม่ใช้แต้มอัตโนมัติ</small></div>`:'';
  return `<aside class="journal-inspector seeker-node-detail" role="region" aria-label="รายละเอียดโหนด" aria-live="polite"><button class="journal-dismiss" data-act="dismiss-node" aria-label="ปิดรายละเอียดโหนด">×</button><small>${chapter.nameTh} / ${n.type==='minor'?'บันทึกย่อย':n.type==='job'?'คำสาบาน':'บันทึกสำคัญ'}</small><h3>${n.nameTh}</h3>${n.tags?tagsHtml(n.tags,'node'):''}${tierStatus}<div class="seeker-effects">${effects(n,format).map(e=>`<p>${e}</p>`).join('')||'<p>จุดเริ่มต้นของทุกเส้นทาง</p>'}</div><p>${text}</p>${path}<button class="btn primary" data-act="take-node" data-id="${id}" ${st.can?'':'disabled'}>${st.taken?'บันทึกแล้ว ✓':'ลงทุน · 1 แต้ม'}</button>${cross.length?`<details class="seeker-crosslinks"><summary>เชื่อมไปยังบันทึกอื่น (${cross.length})</summary>${cross.map(k=>button('jump-node',k,tree.nodes[k].nameTh+' ↗')).join('')}</details>`:''}</aside>`;
}

export function jobView(ui,{effectText}) {
  const {game:g,sel}=ui, {ch,data}=g,tree=data.jobtree,chapters=tree.constellations;
  const category=chapters.find(c=>c.id===sel.constellation),branch=sel.jobBranch||tree.groups[0].id;
  const head=journalHeader(ui,category),guide=investmentGuide(ch,tree),query=sel.nodeSearch?.trim().toLocaleLowerCase();
  if(query) {
    const matches=Object.entries(tree.nodes).filter(([id,n])=>[id,n.name,n.nameTh,n.descTh,...(n.tags||[]).map(t=>TAGS[t]||t),...effects(n,effectText),chapters.find(c=>c.id===n.category).nameTh].join(' ').toLocaleLowerCase().includes(query));
    return `<div class="journal-screen">${head}<section class="journal-results"><div class="journal-results-head"><h3>พบ ${matches.length} บันทึก</h3>${button('clear-node-search','','กลับผัง')}</div>${matches.map(([id,n])=>`<button class="seeker-search-result" data-act="jump-node" data-id="${id}"><b>${n.nameTh}</b><span>${chapters.find(c=>c.id===n.category).nameTh} · ${effects(n,effectText).join(' · ')}</span></button>`).join('')||'<p>ไม่พบบันทึกที่ตรงกัน</p>'}</section></div>`;
  }
  if(!category) {
    const stamps=chapters.map((c,i)=>{
      const entries=Object.entries(tree.nodes).filter(([,n])=>n.category===c.id);
      const count=entries.filter(([id,n])=>n.type!=='origin'&&ch.jobNodes.includes(id)).length;
      return `<button class="seeker-constellation journal-chapter ${count?'invested':''}" data-act="constellation" data-id="${c.id}" style="--chapter-ink:${c.color}" aria-label="เปิดบท ${c.nameTh} · ลงทุนแล้ว ${count} แต้ม"><span class="journal-chapter-no">${String(i+1).padStart(2,'0')}</span><span class="journal-stamp">${sigil(c.icon)}</span><strong>${c.labelTh||c.nameTh}</strong><span class="journal-subtitle">${c.nameTh}</span><span class="journal-chapter-desc">${c.descTh}</span><small>${count?'ใช้ไปแล้ว '+count+' แต้ม':'กดดูเครือข่าย'}</small></button>`;
    }).join('');
    return `<div class="journal-screen">${head}${guide}<section class="journal-chapter-grid" aria-label="เลือกสายสกิลทรี">${stamps}</section>${sel.journalReset?resetSheet(ui):''}</div>`;
  }
  const entries=clusterNodes(tree,category.id,branch),ids=new Set(entries.map(([id])=>id));
  const layout=tree.layout, gatesBySpent=[...new Set(entries.map(([,n])=>tree.sections[n.section].requiresSpent))].sort((a,b)=>a-b);
  const w=layout.padding*2+gatesBySpent.length*layout.columnWidth,h=Math.max(720,...entries.map(([,n])=>n.clusterPos[1]+150));
  // Border markers are real neighbouring nodes in OTHER chapters, not invented
  // connections or a demand to complete that chapter. Clicking only navigates.
  const outside=[...new Set(entries.flatMap(([,n])=>n.links.filter(id=>!ids.has(id))))];
  const coords=Object.fromEntries(entries.map(([id,n])=>[id,n.clusterPos]));
  const gatewayRows=Math.ceil(outside.length/Math.max(1,Math.floor((w-80)/210))),gatewayCols=Math.max(1,Math.floor((w-80)/210));
  outside.forEach((id,i)=>{coords[id]=[120+(i%gatewayCols)*210,h+35+Math.floor(i/gatewayCols)*68];});
  const spent=new Set(ch.jobNodes.filter(id=>id!==tree.origin)).size;
  const sections=gatesBySpent.map((requiresSpent,i)=>{
    const members=entries.filter(([,n])=>tree.sections[n.section].requiresSpent===requiresSpent),major=members.some(([,n])=>n.type==='job'||n.type==='notable');
    return {requiresSpent,tier:tree.sections[members[0][1].section].tier,members,major,x:layout.padding+i*layout.columnWidth};
  });
  const tierGuide=sections.map(section=>{
    const locked=section.major&&spent<section.requiresSpent;
    return `<div class="journal-section ${locked?'locked':'unlocked'}" data-stage="${section.tier}" style="left:${section.x}px;top:100px;width:${layout.columnWidth}px;height:${h-110}px"><div class="journal-section-heading"><b>${section.major?'โหนดใหญ่ · ขั้น '+tierName(section.tier):'เครือข่ายโหนดย่อย'}</b><span>${section.major?`ใช้แต้มรวม ${spent}/${section.requiresSpent} ${locked?'🔒':'✓'}`:'ต่อจากโหนดที่มี · ไม่มีเกณฑ์แต้มรวม'}</span></div></div>`;
  }).join('');
  const stageNav=`<nav class="journal-stage-nav" aria-label="ไปยังกลุ่มโหนด">${sections.map((s,i)=>`<button data-focus-stage data-stage-x="${s.members[0][1].clusterPos[0]}" data-stage-y="${s.members[0][1].clusterPos[1]}">${s.major?'โหนดใหญ่ '+tierName(s.tier)+' · '+s.requiresSpent+' แต้ม':'เส้นทางย่อย '+(i+1)}</button>`).join('')}</nav>`;
  const edges=entries.flatMap(([id,n])=>n.links.filter(l=>!ids.has(l)||id<l).map(l=>{
    const [x,y]=coords[id],[xx,yy]=coords[l],taken=ch.jobNodes.includes(id)&&ch.jobNodes.includes(l);
    const midpoint=(x+xx)/2, bend=Math.abs(xx-x)>160&&Math.abs(yy-y)<90?75:0;
    return `<path d="M${x} ${y} C${midpoint} ${y+bend},${midpoint} ${yy+bend},${xx} ${yy}" fill="none" class="seeker-edge ${taken?'taken':''} ${ids.has(l)?'':'external'}"/>`;
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
  const focusId=sel.node||[...ch.jobNodes].reverse().find(id=>ids.has(id))||entries.find(([id])=>jobNodeState(ch,data,id).can)?.[0]||entries[0][0];
  const graphHeight=h+gatewayRows*68+65;
  return `<div class="journal-screen" style="--chapter-ink:${category.color}">${head}${guide}${branches}${stageNav}${ch.progress.balanceMigration?`<p class="balance-notice">${esc(ch.progress.balanceMigration)}</p>`:''}${graph(`${tierGuide}<svg class="journal-lines" width="${w}" height="${graphHeight}" aria-hidden="true">${edges}</svg>${gates}${nodes}`,w,graphHeight,focusId)}${footer()}${sel.journalReset?resetSheet(ui):sel.node?detail(ui,sel.node,effectText):''}</div>`;
}

/** Camera affects the view only. No pointer gesture allocates points. */
export function mountJobNetwork(ui) {
  const root=ui.body.querySelector('.seeker-graph');if(!root)return()=>{};
  const plane=root.querySelector('.seeker-plane'),output=ui.body.querySelector('.seeker-graph-tools output');
  const w=+root.dataset.width,h=+root.dataset.height,key=(ui.sel.constellation||'overview')+':'+(ui.sel.jobBranch||'');
  const cameras=ui.jobCameras||(ui.jobCameras={});
  const fitZoom=()=>Math.min(root.clientWidth/w,root.clientHeight/h)*.95;
  const clamp=z=>Math.max(.3,Math.min(1.7,z));
  const start=ui.game.data.jobtree.nodes[root.dataset.selected]?.clusterPos||[w/2,h/2];
  const cam=cameras[key]||(cameras[key]={x:start[0],y:start[1],zoom:1});
  const paint=()=>{
    plane.style.setProperty('--inverse-zoom',1/cam.zoom);
    plane.style.setProperty('--node-hit',Math.max(60,44/cam.zoom)+'px');
    cam.x=Math.max(0,Math.min(w,cam.x));cam.y=Math.max(0,Math.min(h,cam.y));
    plane.style.transform=`translate(${root.clientWidth/2-cam.x*cam.zoom}px,${root.clientHeight/2-cam.y*cam.zoom}px) scale(${cam.zoom})`;
    output.value=Math.round(cam.zoom*100)+'%';
  };
  const fit=()=>{Object.assign(cam,{x:w/2,y:h/2,zoom:clamp(fitZoom())});paint();};
  const focus=()=>{
    const n=ui.game.data.jobtree.nodes[root.dataset.selected];
    if(!n)return fit();[cam.x,cam.y]=n.clusterPos;cam.zoom=1;paint();
  };
  const zoom=(next,x=root.clientWidth/2,y=root.clientHeight/2)=>{
    next=clamp(next);const dx=x-root.clientWidth/2,dy=y-root.clientHeight/2;
    cam.x+=dx/cam.zoom-dx/next;cam.y+=dy/cam.zoom-dy/next;cam.zoom=next;paint();
  };
  const click=e=>{
    const t=e.target.closest('[data-zoom],[data-fit],[data-focus],[data-focus-stage]');if(!t)return;
    if(t.dataset.zoom)zoom(cam.zoom*(+t.dataset.zoom>0?1.2:1/1.2));
    if(t.hasAttribute('data-fit'))fit();if(t.hasAttribute('data-focus'))focus();
    if(t.hasAttribute('data-focus-stage')){Object.assign(cam,{x:+t.dataset.stageX,y:+t.dataset.stageY,zoom:1});paint();}
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
