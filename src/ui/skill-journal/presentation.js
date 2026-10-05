import {splitLineGroups,purchaseScope} from './line-groups.js';
// Replaceable presentation metadata. This module never decides purchase eligibility.
export const currentPresentation = {
  groups: [
    {id:'strike',name:'แรงปะทะ',note:'ประชิด · เกราะ · ยืนหยัด',icon:'camp',color:'#9a7256',categories:['melee'],branches:['vanguard']},
    {id:'reach',name:'ระยะและความแม่นยำ',note:'กระสุน · ระยะไกล',icon:'horizon',color:'#56818b',categories:['projectile'],branches:['ranger']},
    {id:'weave',name:'พลังและขอบเขต',note:'เวท · พื้นที่ · ควบคุม',icon:'book',color:'#7a729b',categories:['area','control'],branches:['arcanist']},
    {id:'shelter',name:'ดูแลและป้องกัน',note:'ฟื้นฟู · บาเรีย',icon:'tree',color:'#64836e',categories:['support'],branches:['warden']},
    {id:'company',name:'สิ่งที่ร่วมเดินทาง',note:'อัญเชิญ · ผลต่อเนื่อง',icon:'lantern',color:'#9a8557',categories:['summon','lasting'],branches:[]},
    {id:'pace',name:'จังหวะการเดินทาง',note:'พื้นฐาน · การเคลื่อนที่',icon:'signpost',color:'#617d82',categories:['foundation','mobility'],branches:[]},
  ]
};
export function createPresentation(tree,metadata=currentPresentation){
  const active=new Set(metadata.stages?.flatMap(s=>s.nodes||s.paths.flatMap(p=>p.nodes))||Object.keys(tree.nodes));
  const entries=Object.entries(tree.nodes).filter(([id])=>active.has(id)),tierOf=id=>tree.sections[tree.nodes[id]?.section]?.tier;
  const tiers=metadata.stages?.map(s=>s.id)||[...new Set(entries.map(([id])=>tierOf(id)))].sort((a,b)=>a-b);
  const definitions=splitLineGroups(tree,metadata.groups||[]);
  const byId=new Map(definitions.map(g=>[g.id,g])),groupCache=new Map();
  const groupOf=id=>{
    const n=tree.nodes[id];
    return definitions.find(g=>g.nodes?.includes(id)||g.id===n.presentationGroup||g.categories?.includes(n.category)||g.branches?.includes(n.branch||n.requiresJob))?.id
      ||definitions.find(g=>g.bridges?.includes(id))?.id||'other';
  };
  const groups=tier=>{
    if(groupCache.has(tier))return groupCache.get(tier);
    const buckets=new Map();
    for(const [id] of entries)if(tierOf(id)===tier){const key=groupOf(id);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);}
    const result=[...buckets].map(([id,ids])=>{
      const group=byId.get(id);
      return {...group,id,ids:group?.lineId?ids.filter(k=>tree.nodes[k].line===group.lineId):ids,
        name:group?.name||'รอยทางอื่น',color:group?.color||'#617d82',icon:group?.icon||'compass'};
    });
    groupCache.set(tier,result);return result;
  };
  function context(ids,extra=[]){const all=new Set([...ids,...extra]);for(const id of [...all])for(const k of tree.nodes[id]?.links||[])if(tree.nodes[k]&&tierOf(k)<=tierOf(id))all.add(k);return [...all];}
  return {tiers,tierOf,groupOf,groups,hubs:tier=>groups(tier).filter(g=>!g.mastery),routeScope:(target,groupId)=>purchaseScope(tree,target,byId.get(groupId)),stage:tier=>entries.filter(([id])=>tierOf(id)===tier).map(([id])=>id),context};
}
// Deterministic graph layout: shared origin and connected branches, regardless of IDs/count.
export function connectedLayout(tree,ids){
  const set=new Set(ids),roots=ids.includes(tree.origin)?[tree.origin]:ids.filter(id=>!(tree.nodes[id].links||[]).some(k=>set.has(k)&&tree.sections[tree.nodes[k].section].tier<tree.sections[tree.nodes[id].section].tier));
  const root=roots[0]||ids[0],depth=new Map([[root,0]]),parent=new Map(),queue=[root];
  for(let i=0;i<queue.length;i++)for(const k of tree.nodes[queue[i]].links||[])if(set.has(k)&&!depth.has(k)){depth.set(k,depth.get(queue[i])+1);parent.set(k,queue[i]);queue.push(k);}
  for(const id of ids)if(!depth.has(id)){depth.set(id,1);parent.set(id,root);}
  const children=id=>ids.filter(k=>parent.get(k)===id),weight=id=>Math.max(1,children(id).reduce((n,k)=>n+weight(k),0));
  const max=Math.max(...depth.values(),1),width=1600,height=Math.max(780,Math.ceil(ids.length/8)*150+180),coords={[root]:[width/2,height/2]};
  function place(id,start,end){const kids=children(id),total=kids.reduce((n,k)=>n+weight(k),0);let angle=start;
    for(const k of kids){const span=(end-start)*weight(k)/total,a=angle+span/2,d=depth.get(k),r=.3+.7*d/max;coords[k]=[width/2+Math.cos(a)*(width/2-140)*r,height/2+Math.sin(a)*(height/2-150)*r];place(k,angle,angle+span);angle+=span;}}
  place(root,-Math.PI/2,Math.PI*1.5);
  // Resolve fixed-size touch targets and captions once, never in an animation frame.
  for(let pass=0;pass<180;pass++)for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=coords[ids[i]],b=coords[ids[j]],dx=b[0]-a[0],dy=b[1]-a[1],px=215-Math.abs(dx),py=185-Math.abs(dy);
    if(px<=0||py<=0)continue;const axis=px/215<py/185?0:1,shift=(axis===0?px:py)*.51,sign=(axis===0?dx:dy)>=0?1:-1;
    a[axis]-=shift*sign;b[axis]+=shift*sign;
    for(const point of [a,b]){point[0]=Math.max(140,Math.min(width-140,point[0]));point[1]=Math.max(100,Math.min(height-150,point[1]));}
  }
  return {width,height,coords};
}
