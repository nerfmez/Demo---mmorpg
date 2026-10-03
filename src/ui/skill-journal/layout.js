// Reviewed directed layout; eligibility remains in core/character.js.
export function createLayout(tree){return {
layout(ids,primary,tier,phone,short=false){let width,height,coords={};if(tier===1){width=phone?600:1300;height=phone?920:480;const positions=phone?[[300,70],[300,310],[135,550],[135,790],[465,550],[465,790]]:[[110,240],[405,240],[755,125],[1110,125],[755,350],[1110,350]];tree.presentation.stages[0].nodes.forEach((id,i)=>coords[id]=positions[i]);}
 else{
  const context=ids.filter(id=>!primary.includes(id)),depths={},levels=new Map();
  const depth=id=>depths[id]??(depths[id]=1+Math.max(0,...tree.nodes[id].requires.filter(k=>primary.includes(k)).map(depth)));
  for(const id of primary){const level=depth(id);if(!levels.has(level))levels.set(level,[]);levels.get(level).push(id);}
  const slots=2,contextRows=Math.ceil(context.length/slots),offset=Math.max(1,contextRows);
  width=phone?760:280*(offset+Math.max(...levels.keys()))+140;height=phone?190*(offset+Math.max(...levels.keys()))+140:520;
  context.forEach((id,i)=>coords[id]=phone?[context.length===1?380:170+i%slots*420,90+Math.floor(i/slots)*190]:[110+Math.floor(i/slots)*280,context.length===1?260:150+i%slots*220]);
  const sharedPhoneRow=phone&&context.length<=2;if(sharedPhoneRow){height=90+(Math.max(...levels.keys())-1)*230+120;context.forEach((id,i)=>coords[id]=[context.length===1?170:i===0?110:650,90]);}
  for(const [level,list] of levels){list.forEach((id,i)=>{const parents=tree.nodes[id].requires.filter(k=>coords[k]&&primary.includes(k)),cross=list.length>1?(phone?170+i*420:150+i*220):parents.length?parents.reduce((sum,p)=>sum+coords[p][phone?0:1],0)/parents.length:(phone?380:260);coords[id]=phone?[sharedPhoneRow&&level===1?(context.length===1?590:380):cross,sharedPhoneRow?90+(level-1)*230:90+(offset+level-1)*190]:[110+(offset+level-1)*280,cross];});}
 }if(short&&!phone){
  // Give every caption its own column in a shallow landscape viewport.
  // Parent-first ordering keeps the directed graph readable without clipping a second row.
  const ordered=[],seen=new Set(),included=new Set(ids);
  const visit=id=>{if(seen.has(id))return;seen.add(id);for(const parent of tree.nodes[id].requires||[])if(included.has(parent))visit(parent);ordered.push(id);};ids.forEach(visit);
  width=ordered.length*280+140;height=280;ordered.forEach((id,i)=>coords[id]=[110+i*280,140]);
 }return {width,height,coords,compactRow:short&&!phone};}
};}
