// Reviewed directed layout; eligibility remains in core/character.js.
export function createLayout(tree){return {
layout(ids,primary,tier,phone,short=false,view=null){let width,height,coords={},snake=false,zoom=0;if(tier===1){width=phone?600:1300;height=phone?920:480;const positions=phone?[[300,70],[300,310],[135,550],[135,790],[465,550],[465,790]]:[[110,240],[405,240],[755,125],[1110,125],[755,350],[1110,350]];tree.presentation.stages[0].nodes.forEach((id,i)=>coords[id]=positions[i]);}
 else{
  const context=ids.filter(id=>!primary.includes(id)),depths={},levels=new Map();
  const depth=id=>depths[id]??(depths[id]=1+Math.max(0,...tree.nodes[id].requires.filter(k=>primary.includes(k)).map(depth)));
  for(const id of primary){const level=depth(id);if(!levels.has(level))levels.set(level,[]);levels.get(level).push(id);}
  const slots=2,contextRows=Math.ceil(context.length/slots),offset=Math.max(1,contextRows);
  width=phone?760:280*(offset+Math.max(...levels.keys()))+140;height=phone?190*(offset+Math.max(...levels.keys()))+140:520;
  context.forEach((id,i)=>coords[id]=phone?[context.length===1?380:170+i%slots*420,90+Math.floor(i/slots)*190]:[110+Math.floor(i/slots)*280,context.length===1?260:150+i%slots*220]);
  const sharedPhoneRow=phone&&context.length<=2;if(sharedPhoneRow){height=90+(Math.max(...levels.keys())-1)*230+120;context.forEach((id,i)=>coords[id]=[context.length===1?170:i===0?110:650,90]);}
  for(const [level,list] of levels){list.forEach((id,i)=>{const parents=tree.nodes[id].requires.filter(k=>coords[k]&&primary.includes(k)),cross=list.length>1?(phone?170+i*420:150+i*220):parents.length?parents.reduce((sum,p)=>sum+coords[p][phone?0:1],0)/parents.length:(phone?380:260);coords[id]=phone?[sharedPhoneRow&&level===1?(context.length===1?590:380):cross,sharedPhoneRow?90+(level-1)*230:90+(offset+level-1)*190]:[110+(offset+level-1)*280,cross];});}
 }
 // A long single chain (a build line): wrap it back and forth in rows. Captions keep their
 // screen size at any zoom, so columns follow the viewport width (one caption each) and rows
 // get a caption's height on screen; a list taller than the page scrolls instead of shrinking.
 const chain=tier!==1&&view&&primary.length>6&&primary.every(id=>(tree.nodes[id].requires||[]).filter(k=>primary.includes(k)).length<=1)&&new Set(primary.flatMap(id=>(tree.nodes[id].requires||[]).filter(k=>primary.includes(k)))).size===primary.length-1;
 if(chain){
  const ordered=[],seen=new Set(),included=new Set(ids);
  const visit=id=>{if(seen.has(id))return;seen.add(id);for(const parent of tree.nodes[id].requires||[])if(included.has(parent))visit(parent);ordered.push(id);};ids.forEach(visit);
  const n=ordered.length,dx=250,rows=Math.ceil(n/Math.max(1,Math.min(n,Math.floor((view.width-40)/125)))),cols=Math.ceil(n/rows);
  zoom=Math.min(.8,view.width/(cols*dx+120));const dy=Math.max(170,100/zoom);
  width=cols*dx+120;height=rows*dy+80;snake=true;
  ordered.forEach((id,i)=>{const row=Math.floor(i/cols),col=row%2?cols-1-i%cols:i%cols;coords[id]=[60+dx/2+col*dx,40+dy/2-25+row*dy];});
 }
 if(short&&!phone&&!snake){
  // Give every caption its own column in a shallow landscape viewport.
  // Parent-first ordering keeps the directed graph readable without clipping a second row.
  const ordered=[],seen=new Set(),included=new Set(ids);
  const visit=id=>{if(seen.has(id))return;seen.add(id);for(const parent of tree.nodes[id].requires||[])if(included.has(parent))visit(parent);ordered.push(id);};ids.forEach(visit);
  width=ordered.length*280+140;height=280;ordered.forEach((id,i)=>coords[id]=[110+i*280,140]);
 }return {width,height,coords,compactRow:short&&!phone&&!snake,zoom};}
};}
