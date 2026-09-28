import {art} from './art.js';
import {icon} from './icons.js';
import {jobNodeState,jobPath,currentJob,respecCost} from '../core/character.js';
import {esc} from './buildmeta.js';

export function clusterNodes(tree, category, branch) {
 return Object.entries(tree.nodes).filter(([,n])=>n.category===category&&(category!=='specialist'||(n.branch||n.requiresJob)===branch));
}
const effects=(n,fn)=>Object.entries(n.effects).map(([k,v])=>fn(k,v)).join(' · ');
const glyph=n=>n.type==='origin'?'◇':n.type==='job'?'✦':Object.keys(n.effects).some(k=>k.includes('Hp'))?'HP':Object.keys(n.effects).some(k=>k.includes('Mp'))?'MP':n.type==='notable'?'✧':'+';
export function jobView(ui,{effectText}) {
 const {game:g,sel}=ui,{ch,data}=g,tree=data.jobtree,categories=tree.constellations;
 const category=categories.find(c=>c.id===sel.constellation), branch=sel.jobBranch||tree.groups[0].id;
 const search=sel.nodeSearch||'', lower=search.toLocaleLowerCase();
 const matches=lower?Object.entries(tree.nodes).filter(([id,n])=>[id,n.name,n.nameTh,n.descTh,effects(n,effectText),categories.find(c=>c.id===n.category)?.nameTh].join(' ').toLocaleLowerCase().includes(lower)):[];
 const cost=respecCost(ch,data), job=currentJob(ch,data);
 const head=`<div class="seeker-heading seeker-tree-heading"><div><span class="section-kicker">SEEKER / PASSIVE NETWORK</span><h3>เส้นทางความสามารถ</h3><p>Job Lv.${ch.jobLevel} · เหลือ <b>${ch.jobPoints} Job Point</b> · ${Object.keys(tree.nodes).length} โหนด</p></div><button class="btn" data-act="constellation" data-id="">ภาพรวมหมวด</button></div>
 <form class="seeker-node-search"><label for="node-search">ค้นหาชื่อ / ค่าสถานะ</label><input id="node-search" name="node-search" value="${esc(search)}" placeholder="เช่น รัศมี, HP, คูลดาวน์" type="search"><button class="btn" type="submit">ค้นหา</button>${search?'<button class="btn" data-act="clear-node-search" type="button">ล้าง</button>':''}</form>`;
 const reset=`<details class="seeker-respec"><summary>อาชีพ: ${job?.nameTh||'ยังไม่เลือก'} · ลงแล้ว ${ch.jobNodes.length-1} แต้ม · รีแต้ม</summary><p>Stat Point อยู่หน้าตัวละคร · สกิลและม็อดอัปด้วยวัตถุดิบ ไม่ใช่ Job Point</p><button class="btn" data-act="respec-job" ${g.nearby().inTown&&ch.gold>=cost.job&&ch.jobNodes.length>1?'':'disabled'}>รี Job Tree · ${cost.job} G</button><small>กลับนิคมเพื่อรีแต้ม · ไม่ลบเลเวลสกิลหรือม็อด</small></details>`;
 if(search) return head+`<div class="seeker-search-results"><p>พบ ${matches.length} โหนด · ค้นหาทุกหมวด</p>${matches.map(([id,n])=>`<button class="seeker-search-result" data-act="jump-node" data-id="${id}"><b>${n.nameTh}</b><span>${categories.find(c=>c.id===n.category).nameTh} · ${effects(n,effectText)||'จุดเริ่ม'}</span></button>`).join('')||'<p>ไม่พบโหนดที่ตรงกับคำค้น</p>'}</div>`;
 if(!category) return head+`<div class="seeker-node-legend"><span>● โหนดเล็ก: ค่าสถานะ</span><span>◆ โหนดหลัก: เสริมแนวทาง</span><span>✦ อาชีพ: เลือกหนึ่งสายเมื่อพร้อม</span></div><div class="seeker-constellations">${categories.map((c,i)=>{
 const nodes=Object.entries(tree.nodes).filter(([,n])=>n.category===c.id),taken=nodes.filter(([id])=>ch.jobNodes.includes(id)).length,ready=nodes.filter(([id])=>jobNodeState(ch,data,id).can).length;
 return `<button class="seeker-constellation" data-act="constellation" data-id="${c.id}"><span class="seeker-category-art">${icon(c.icon==='shield'?'ward':c.icon)}<small>${String(i+1).padStart(2,'0')}</small></span><h3>${c.nameTh}</h3><p>${c.descTh||c.desc||''}</p><div class="seeker-node-strip" aria-hidden="true">● ─ ● ─ ◆</div><small>${taken}/${nodes.length} ลงแล้ว${ready?' · ลงได้ '+ready+' โหนด':''}</small></button>`;
 }).join('')}</div><p class="seeker-hint">หมวดเป็นการจัดหน้าจอ ไม่ใช่คลาสบังคับ · เส้นทางข้ามหมวดยังเชื่อมกันตามโหนดจริง</p>`+reset;
 const entries=clusterNodes(tree,category.id,branch),ids=new Set(entries.map(([id])=>id));
 const selected=ids.has(sel.node)?sel.node:(entries.find(([id])=>jobNodeState(ch,data,id).can)||entries[0])[0];
 const node=tree.nodes[selected],state=jobNodeState(ch,data,selected),path=jobPath(ch,data,selected),remaining=path.filter(id=>!ch.jobNodes.includes(id));
 const reason=state.taken?'ลงแต้มแล้ว':state.reason==='requires_job'?'ต้องเลือกอาชีพ '+tree.groups.find(c=>c.id===state.need)?.nameTh:state.reason==='not_linked'?'ต้องต่อจากโหนดที่ลงแต้มแล้ว':state.reason==='no_points'?'Job Point ไม่พอ':state.reason==='job_level'?'เลือกอาชีพได้เมื่อ Job Lv.'+state.need:state.reason==='one_job'?'เลือกอาชีพหลักได้เพียงหนึ่งสาย · รีแต้มก่อนเปลี่ยน':'พร้อมลง 1 Job Point';
 const w=Math.max(680,...entries.map(([,n])=>n.clusterPos[0]+110)),h=Math.max(500,...entries.map(([,n])=>n.clusterPos[1]+120));
 const edges=entries.flatMap(([id,n])=>n.links.filter(l=>ids.has(l)&&id<l).map(l=>{const other=tree.nodes[l],taken=ch.jobNodes.includes(id)&&ch.jobNodes.includes(l);return `<line x1="${n.clusterPos[0]}" y1="${n.clusterPos[1]}" x2="${other.clusterPos[0]}" y2="${other.clusterPos[1]}" class="seeker-edge ${taken?'taken':''}"/>`;})).join('');
 const nodes=entries.map(([id,n])=>{const st=jobNodeState(ch,data,id);return `<button class="seeker-node ${n.type} ${st.taken?'taken':st.can?'available':'locked'} ${id===selected?'selected':''}" style="left:${n.clusterPos[0]}px;top:${n.clusterPos[1]}px" data-act="node" data-id="${id}" aria-label="${esc(n.nameTh+' · '+(st.taken?'ลงแล้ว':st.can?'ลงได้':'ยังลงไม่ได้'))}" aria-pressed="${id===selected}"><span class="seeker-node-disc">${n.type==='minor'?glyph(n):art('job',id)}</span><span class="seeker-node-caption">${n.nameTh}</span>${st.taken?'<i>✓</i>':''}${n.links.some(l=>!ids.has(l))?'<em class="seeker-cross-mark">↗</em>':''}</button>`;}).join('');
 const cross=node.links.filter(id=>!ids.has(id));
 const links=cross.map(id=>`<button class="btn small" data-act="jump-node" data-id="${id}">${tree.nodes[id].nameTh} ↗ <small>${categories.find(c=>c.id===tree.nodes[id].category).nameTh}</small></button>`).join('');
 return head+`<div class="seeker-category-tabs" aria-label="หมวดความสามารถ">${categories.map(c=>`<button class="btn ${c.id===category.id?'on':''}" data-act="constellation" data-id="${c.id}">${c.nameTh}</button>`).join('')}</div>
 ${category.id==='specialist'?`<div class="seeker-action-row">${tree.groups.map(c=>`<button class="btn ${c.id===branch?'on':''}" data-act="job-branch" data-id="${c.id}">${c.nameTh}</button>`).join('')}</div>`:''}
 <div class="seeker-tree-layout"><section class="seeker-graph-shell"><div class="seeker-graph-header"><b>${category.nameTh}</b><small>ลากเลื่อน · สองนิ้วซูม · แตะเพื่อดู</small></div><div class="seeker-graph" tabindex="0" aria-label="ผังย่อย ${category.nameTh}" data-width="${w}" data-height="${h}" data-selected="${selected}"><div class="seeker-plane" style="width:${w}px;height:${h}px"><svg width="${w}" height="${h}" aria-hidden="true">${edges}</svg>${nodes}</div></div><div class="seeker-graph-tools"><button class="btn" data-zoom="1" aria-label="ซูมเข้า">+</button><output>100%</output><button class="btn" data-zoom="-1" aria-label="ซูมออก">−</button><button class="btn" data-fit>ดูทั้งหมด</button><button class="btn" data-focus>โหนดที่เลือก</button></div><div class="seeker-node-legend"><span>✓ ลงแล้ว</span><span>● สว่าง: ลงได้</span><span>○ มืด: ยังลงไม่ได้</span><span>↗ เชื่อมข้ามหมวด</span></div></section>
 <aside class="card seeker-node-detail" aria-live="polite"><small>${node.type==='minor'?'โหนดเล็ก':node.type==='job'?'อาชีพหลัก':node.type==='origin'?'จุดเริ่ม':'โหนดหลัก'} · ${category.nameTh}</small><h3>${node.nameTh}</h3><div class="seeker-effects">${Object.entries(node.effects).map(([k,v])=>`<p>${effectText(k,v)}</p>`).join('')||'<p>เริ่มต้นเส้นทางความสามารถ</p>'}</div>${node.descTh?`<p>${node.descTh}</p>`:''}<p class="${state.can?'ok':'muted'}">${reason}</p><button class="btn primary" data-act="take-node" data-id="${selected}" ${state.can?'':'disabled'}>${state.taken?'ลงแต้มแล้ว':'ลงแต้ม · 1 JP'}</button>
 ${remaining.length>1?`<div class="seeker-route"><b>อีก ${remaining.length} แต้มตามเส้นทางที่สั้นที่สุด</b><button class="btn" data-act="jump-node" data-id="${remaining[0]}">ไปดูโหนดถัดไป: ${tree.nodes[remaining[0]].nameTh}</button><small>ปุ่มนี้เปิดรายละเอียดเท่านั้น ไม่ลงแต้มแทน</small></div>`:''}
 ${links?`<div class="seeker-crosslinks"><b>เส้นเชื่อมข้ามหมวด</b>${links}</div>`:''}</aside></div>`+reset;
}

/** View camera only. Per-category state survives inspections and point allocation. */
export function mountJobNetwork(ui) {
 const root=ui.body.querySelector('.seeker-graph');if(!root)return()=>{};
 const plane=root.querySelector('.seeker-plane'),output=ui.body.querySelector('.seeker-graph-tools output');
 const w=+root.dataset.width,h=+root.dataset.height,key=ui.sel.constellation+':'+(ui.sel.jobBranch||'');
 const cameras=ui.jobCameras||(ui.jobCameras={}),cam=cameras[key]||(cameras[key]={x:w/2,y:Math.min(h/2,300),zoom:1});
 const clamp=z=>Math.max(.45,Math.min(1.5,z));
 const paint=()=>{plane.style.setProperty('--inverse-zoom',1/cam.zoom);plane.style.setProperty('--node-hit',Math.max(64,44/cam.zoom)+'px');cam.x=Math.max(0,Math.min(w,cam.x));cam.y=Math.max(0,Math.min(h,cam.y));plane.style.transform=`translate(${root.clientWidth/2-cam.x*cam.zoom}px,${root.clientHeight/2-cam.y*cam.zoom}px) scale(${cam.zoom})`;output.value=Math.round(cam.zoom*100)+'%';};
 const focus=()=>{[cam.x,cam.y]=ui.game.data.jobtree.nodes[root.dataset.selected].clusterPos;cam.zoom=1;paint();};
 const zoom=(next,x=root.clientWidth/2,y=root.clientHeight/2)=>{next=clamp(next);const dx=x-root.clientWidth/2,dy=y-root.clientHeight/2;cam.x+=dx/cam.zoom-dx/next;cam.y+=dy/cam.zoom-dy/next;cam.zoom=next;paint();};
 const click=e=>{const t=e.target.closest('[data-zoom],[data-fit],[data-focus]');if(!t)return;if(t.dataset.zoom)zoom(cam.zoom*(+t.dataset.zoom>0?1.2:1/1.2));if(t.hasAttribute('data-fit')){cam.x=w/2;cam.y=h/2;cam.zoom=clamp(Math.min(root.clientWidth/w,root.clientHeight/h)*.95);paint();}if(t.hasAttribute('data-focus'))focus();};
 const pts=new Map();let drag=null,suppress=false;
 const measure=()=>{const p=[...pts.values()];return p.length===1?{x:p[0].x,y:p[0].y,d:0}:{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};};
 const down=e=>{if(e.button>0)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={...measure(),cx:cam.x,cy:cam.y,z:cam.zoom};suppress=false;};
 const move=e=>{if(!pts.has(e.pointerId)||!drag)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=measure();if(!suppress&&Math.hypot(m.x-drag.x,m.y-drag.y)<5&&Math.abs(m.d-drag.d)<5)return;suppress=true;root.setPointerCapture(e.pointerId);e.preventDefault();const z=drag.d&&m.d?clamp(drag.z*m.d/drag.d):drag.z,r=root.getBoundingClientRect();cam.x=drag.cx+(drag.x-r.left-root.clientWidth/2)/drag.z-(m.x-r.left-root.clientWidth/2)/z;cam.y=drag.cy+(drag.y-r.top-root.clientHeight/2)/drag.z-(m.y-r.top-root.clientHeight/2)/z;cam.zoom=z;paint();};
 const up=e=>{pts.delete(e.pointerId);drag=pts.size?{...measure(),cx:cam.x,cy:cam.y,z:cam.zoom}:null;};
 const cancel=e=>{pts.delete(e.pointerId);drag=null;};
 const guard=e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false;}};
 const wheel=e=>{e.preventDefault();const r=root.getBoundingClientRect();zoom(cam.zoom*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);};
 const keydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Home')focus();else if(e.key==='+')zoom(cam.zoom*1.2);else if(e.key==='-')zoom(cam.zoom/1.2);else{cam.x+=({'ArrowLeft':-80,'ArrowRight':80}[e.key]||0)/cam.zoom;cam.y+=({'ArrowUp':-80,'ArrowDown':80}[e.key]||0)/cam.zoom;paint();}};
 ui.body.addEventListener('click',click);root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);root.addEventListener('click',guard,true);root.addEventListener('wheel',wheel,{passive:false});root.addEventListener('keydown',keydown);
 const resize=new ResizeObserver(paint);resize.observe(root);paint();
 if(ui.focusNextNode){focus();ui.focusNextNode=false;}
 return()=>{resize.disconnect();ui.body.removeEventListener('click',click);};
}
