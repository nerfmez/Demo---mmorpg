// Presentation only: canonical stage.paths still own route planning and purchases.
const lines = {
 'line.physical':['กายภาพ','ดาเมจโจมตี · เจาะเกราะ','sword'],
 'line.damage':['ดาเมจล้วน','พลังโจมตี · ดาเมจทุกแบบ','sword'],
 'line.crit':['คริติคอล','โอกาสคริ · ความแรงคริ','horizon'],
 'line.element':['ธาตุ','พลังธาตุ · พิษ','drop'],
 'line.mana':['MP','คลังพลัง · ประหยัดพลัง','drop'],
 'line.speed':['ตีเร็ว','ร่ายไว · ฟื้นคูลดาวน์','wind'],
 'line.guardian':['ป้องกันและโจมตี','เกราะ · โล่สวน','shield'],
 'line.agility':['คล่องตัว','ฝีเท้า · หลบไว','wind'],
 'line.treasure':['ล่าสมบัติ','แกะรอย · ถุงทอง','compass'],
};
export function splitLineGroups(tree, definitions) {
 const groups=[];
 for(const family of definitions){
  const lineIds=[...new Set((family.nodes||[]).map(id=>tree.nodes[id]?.line).filter(Boolean))];
  if(!family.line||!lineIds.length){groups.push(family);continue;}
  for(const line of lineIds){
   const nodes=family.nodes.filter(id=>tree.nodes[id].line===line),tier=tree.sections[tree.nodes[nodes[0]].section].tier;
   const mastery=nodes.every(id=>id.includes('.mastery.')),id=`view.${line.slice(5)}.${mastery?'mastery':tier}`;
   const [name,note,icon]=lines[line]||[line,family.note,family.icon];
   const bridges=mastery?[]:Object.entries(tree.nodes).filter(([id,n])=>n.bridge?.includes(line)&&tree.sections[n.section].tier===tier&&tree.presentation.stages.some(s=>s.paths?.some(p=>p.nodes.includes(id)))).map(([id])=>id);
   const raw=nodes.map(k=>family.grid[k]),min=Math.min(...raw.map(p=>p[0]));
   const grid=Object.fromEntries(nodes.map(k=>[k,[family.grid[k][0]-min,family.grid[k][1]]]));
   groups.push({...family,id,name:mastery?`${name} · ความชำนาญ`:name,note,icon,nodes,grid,lineId:line,mastery,bridges,routeScopeId:family.id,hubId:`view.${line.slice(5)}.${tier}`});
  }
 }
 return groups;
}
export function purchaseScope(tree,target,displayGroup){
 const tier=tree.sections[tree.nodes[target]?.section]?.tier,stage=tree.presentation?.stages.find(s=>s.id===tier);
 const scopes=stage?.nodes?[{id:`stage-${tier}`,nodes:stage.nodes}]:stage?.paths||[];
 const members=scopes.filter(g=>g.nodes.includes(target));
 // A bridge proxy may be displayed on either side; its original owner defines its route.
 return members.find(g=>g.id===(displayGroup?.routeScopeId||displayGroup?.id))?.id||members[0]?.id;
}
