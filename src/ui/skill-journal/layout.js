// Reviewed directed layout; eligibility remains in core/character.js.
const parents=n=>[...(n?.requires||[]),...(n?.requiresAny||[])];
export function createLayout(tree){return {
layout(ids,primary,tier,phone,short=false,view=null,grid=null){let width,height,coords={},snake=false,zoom=0;if(tier===1){width=phone?600:1300;height=phone?920:480;const positions=phone?[[300,70],[300,310],[135,550],[135,790],[465,550],[465,790]]:[[110,240],[405,240],[755,125],[1110,125],[755,350],[1110,350]];tree.presentation.stages[0].nodes.forEach((id,i)=>coords[id]=positions[i]);}
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
 // A build-line page carries its own grid (lines as columns, a fork's two focuses side by
 // side, bridges between lines). Captions keep their screen size at any zoom, so a column gets
 // a caption's width on screen and a row a caption's height; a page taller than the view
 // scrolls instead of shrinking. Context nodes (parents on another page) sit above or beside.
 if(grid&&view&&primary.every(id=>grid[id])){
  const cell={...Object.fromEntries(primary.map(id=>[id,grid[id]]))},taken=new Set(Object.values(cell).map(([c,r])=>c+':'+r));
  const free=(c,r)=>!taken.has(c+':'+r);
  for(const id of ids.filter(id=>!cell[id])){
   const child=primary.find(k=>parents(tree.nodes[k]).includes(id)),[c,r]=child?cell[child]:[0,Math.max(...Object.values(cell).map(p=>p[1]))+1];
   const minRow=Math.min(...primary.map(k=>cell[k][1]));
   const options=r===minRow?[[c,r-1],[c+1,r],[c-1,r]]:[[c+1,r],[c-1,r],[c,r-1],[c,r+1]];
   let spot=options.find(([x,y])=>free(x,y));for(let x=c+2;!spot;x++)if(free(x,r))spot=[x,r];
   cell[id]=spot;taken.add(spot[0]+':'+spot[1]);
  }
  const cs=Object.values(cell).map(p=>p[0]),rs=Object.values(cell).map(p=>p[1]),c0=Math.min(...cs),r0=Math.min(...rs),cols=Math.max(...cs)-c0+1,rows=Math.max(...rs)-r0+1,dx=250;
  zoom=Math.min(.8,(view.width-40)/(cols*dx+60));const dy=Math.max(150,118/zoom);
  width=cols*dx+60;height=rows*dy+40;snake=true;
  for(const [id,[c,r]] of Object.entries(cell))coords[id]=[30+dx/2+(c-c0)*dx,20+dy/2-20+(r-r0)*dy];
 }
 if(short&&!phone&&!snake){
  // Give every caption its own column in a shallow landscape viewport.
  // Parent-first ordering keeps the directed graph readable without clipping a second row.
  const ordered=[],seen=new Set(),included=new Set(ids);
  const visit=id=>{if(seen.has(id))return;seen.add(id);for(const parent of tree.nodes[id].requires||[])if(included.has(parent))visit(parent);ordered.push(id);};ids.forEach(visit);
  width=ordered.length*280+140;height=280;ordered.forEach((id,i)=>coords[id]=[110+i*280,140]);
 }return {width,height,coords,compactRow:short&&!phone&&!snake,zoom,column:snake?250:0};}
};}
