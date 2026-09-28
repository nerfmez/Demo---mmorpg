import {art} from './art.js';
import {jobNodeState,currentJob,respecCost} from '../core/character.js';
export function jobView(ui,{effectText}) {
 const {game:g,sel}=ui,{ch,data}=g,tree=data.jobtree,near=g.nearby(),cost=respecCost(ch,data);
 const roots=tree.nodes[tree.origin].links;
 const branches=roots.map(root=>{
   const ids=[],seen=new Set([tree.origin]),queue=[root];
   while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);ids.push(id);queue.push(...tree.nodes[id].links.filter(k=>!seen.has(k)));}
   const job=ids.find(id=>tree.nodes[id].type==='job'),jd=tree.nodes[job];
   const nodes=ids.map(id=>{
     const n=tree.nodes[id],st=jobNodeState(ch,data,id);
     return `<button class="path-node ${st.taken?'taken':''} ${st.can?'can':''} ${sel.node===id?'on':''}" data-act="node" data-id="${id}" aria-pressed="${sel.node===id}">${art('job',id)}<span><b>${n.nameTh}</b><small>${st.taken?'✓ เลือกแล้ว':st.can?'ลงแต้มได้':n.type==='job'?'เลือกอาชีพ · Job Lv.'+data.progression.job.jobChoiceLevel:'ปลดล็อกจากโหนดก่อนหน้า'}</small></span><i>${n.type==='job'?'JOB':'›'}</i></button>`;
   }).join('');
   return `<section class="job-branch"><header>${art('job',job)}<div><span class="section-kicker">${jd.name}</span><h3>${jd.nameTh}</h3><p>${jd.descTh}</p></div></header><div class="path-nodes">${nodes}</div></section>`;
 }).join('');
 const id=tree.nodes[sel.node]?sel.node:tree.origin,n=tree.nodes[id],st=jobNodeState(ch,data,id);
 const reason=st.taken?'เลือกโหนดนี้แล้ว':st.reason==='not_linked'?'เลือกโหนดที่เชื่อมต่อก่อน':st.reason==='no_points'?'Job Point ไม่พอ':st.reason==='job_level'?'ต้อง Job Lv.'+st.need:st.reason==='one_job'?'เลือกอาชีพได้ครั้งละหนึ่งสาย · รีแต้มเพื่อเปลี่ยน':'ใช้ 1 Job Point';
 const links=n.links.filter(k=>ch.jobNodes.includes(k)).map(k=>tree.nodes[k].nameTh);
 return `<div class="workbench-summary"><div><h3>เส้นทางอาชีพ</h3><small>เริ่มจากนักเดินทาง แล้วต่อยอด Build ของคุณ</small></div><span class="level-pill">Job Lv.${ch.jobLevel} · เหลือ ${ch.jobPoints} แต้ม</span></div>
 <div class="job-layout"><div class="job-branches">${branches}</div><aside class="job-detail card">
 ${art('job',id)}<span class="section-kicker">${n.name}</span><h3>${n.nameTh}</h3><p>${n.descTh||'แต้มอาชีพแยกจากแต้ม Stat · เลือกโหนดเพื่อดูความสามารถ'}</p>
 <div class="job-effects">${Object.entries(n.effects).map(([k,v])=>`<div>${effectText(k,v)}</div>`).join('')}</div>
 ${id!==tree.origin?`<small class="muted">${links.length?'เชื่อมจาก '+links.join(', '):'ยังไม่เชื่อมกับเส้นทางที่เลือก'}</small>`:''}
 <p class="${st.can?'ok':'muted'}">${reason}</p><button class="btn primary" data-act="take-node" data-id="${id}" ${st.can?'':'disabled'}>ลงแต้ม</button>
 <div class="respec-area"><small>อาชีพปัจจุบัน: ${currentJob(ch,data)?.nameTh||'นักเดินทาง'}</small><button class="btn" data-act="respec-job" ${near.inTown&&ch.gold>=cost.job&&ch.jobNodes.length>1?'':'disabled'}>รีแต้ม Job · ${cost.job} G</button><small class="muted">รีแต้มได้ในนิคม</small></div>
 </aside></div>`;
}

