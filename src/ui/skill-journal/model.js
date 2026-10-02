// Read-only presentation indexes. Eligibility remains in core/character.js.
export function journalProgress(ch,data){
 const tree=data.jobtree,known=new Set(Object.keys(tree.nodes));
 const spent=new Set(ch.jobNodes.filter(id=>id!==tree.origin&&known.has(id))).size;
 const tiers=[...new Set(Object.values(tree.sections).map(s=>s.tier))].sort((a,b)=>a-b);
 const names=['ก้าวแรกของการเดินทาง','ทางแยกนอกเมือง','เขียนเส้นทางของตัวเอง','พ้นขอบฟ้า','ใต้แสงดาว','เส้นทางที่ยังเปิดกว้าง'];
 const stages=tiers.map(tier=>{const requiresSpent=Math.min(...Object.values(tree.sections).filter(s=>s.tier===tier).map(s=>s.requiresSpent));return {tier,requiresSpent,nameTh:names[tier-1]||`บท ${tier}`,unlocked:spent>=requiresSpent};});
 return {spent,stages,current:stages.filter(s=>s.unlocked).at(-1)||stages[0],next:stages.find(s=>!s.unlocked)||null};
}
export function startingEntries(tree){
 // Gather CURRENT canonical foundation and actual origin neighbours. No old IDs/data.
 const ids=new Set([tree.origin,...Object.entries(tree.nodes).filter(([,n])=>n.category==='foundation'&&tree.sections[n.section].tier===1).map(([id])=>id),...tree.nodes[tree.origin].links.filter(id=>tree.sections[tree.nodes[id].section].tier===1)]);
 return [...ids].map(id=>[id,tree.nodes[id]]);
}
export function chapterSpreads(tree,tier){
 const shared=tier===1?new Set(startingEntries(tree).map(([id])=>id)):new Set();
 const entries=(category,branch)=>Object.entries(tree.nodes).filter(([id,n])=>!shared.has(id)&&n.category===category&&tree.sections[n.section].tier===tier&&(category!=='specialist'||(n.branch||n.requiresJob)===branch)).sort((a,b)=>a[1].clusterPos[1]-b[1].clusterPos[1]||a[1].clusterPos[0]-b[1].clusterPos[0]);
 const leaves=[];
 for(const c of tree.constellations.filter(c=>c.id!=='specialist')){
  const nodes=entries(c.id);for(let i=0;i<nodes.length;i+=6)leaves.push({label:c.labelTh||c.nameTh,color:c.color,entries:nodes.slice(i,i+6)});
 }
 const spreads=tier===1?[[{label:'ก้าวแรกร่วมกัน',color:tree.constellations.find(c=>c.id==='foundation').color,entries:startingEntries(tree)}]]:[];
 for(let i=0;i<leaves.length;i+=2)spreads.push(leaves.slice(i,i+2));
 for(const g of tree.groups){const nodes=entries('specialist',g.id),notes=[];for(let i=0;i<nodes.length;i+=6)notes.push({label:g.nameTh+' · รอยจดที่เกี่ยวข้อง',color:g.color,entries:nodes.slice(i,i+6)});for(let i=0;i<notes.length;i+=2)spreads.push(notes.slice(i,i+2));}
 return spreads;
}
