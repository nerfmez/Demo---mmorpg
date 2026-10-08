// Bounded navigation aid. Uses the same actor clearance, water and slopes as walking.
// No character mutation, auto-walk or collision bypass. A remote target ends at its real gate.
const WALK_OPTIONS={allowSeams:true};
function* segmentChecks(world, a, b) {
  const distance = Math.hypot(b.x-a.x,b.z-a.z), steps = Math.max(1,Math.ceil(distance/.4));
  let x=a.x,z=a.z;
  for(let i=1;i<=steps;i++) {
    const nx=a.x+(b.x-a.x)*i/steps,nz=a.z+(b.z-a.z)*i/steps;
    if(!world.isFree(nx,nz,.48,WALK_OPTIONS))return false;
    const moved=world.move(x,z,.48,nx-x,nz-z,WALK_OPTIONS);
    if(Math.hypot(moved.x-nx,moved.z-nz)>.01)return false;
    x=nx;z=nz;
    yield;
  }
  return true;
}
/** Synchronous contract for safety checks; presentation uses the cooperative search below. */
export function routeSegmentClear(world, a, b) {
  // The short per-frame lead check needs no generator or yielded result objects.
  const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(distance/.4));
  let x=a.x,z=a.z;
  for(let i=1;i<=steps;i++){
    const nx=a.x+(b.x-a.x)*i/steps,nz=a.z+(b.z-a.z)*i/steps;
    if(!world.isFree(nx,nz,.48,WALK_OPTIONS))return false;
    const moved=world.move(x,z,.48,nx-x,nz-z,WALK_OPTIONS);
    if(Math.hypot(moved.x-nx,moved.z-nz)>.01)return false;
    x=nx;z=nz;
  }
  return true;
}
/** Directed edges: uphill/downhill need separate movement validation. Bounded CPU-only cache. */
export function createQuestRouteCache(world, cell=2) {
  return {world,cell,free:new Map(),edges:new Map()};
}
function remember(map,key,value,limit) {
  if(map.size>=limit&&!map.has(key))map.delete(map.keys().next().value);
  map.set(key,value);return value;
}
class Heap {
  constructor(){this.nodes=[];}
  push(n){const a=this.nodes;let i=a.length;a.push(n);while(i){const p=(i-1)>>1;if(a[p].f<=n.f)break;a[i]=a[p];i=p;}a[i]=n;}
  pop(){const a=this.nodes,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function* searchQuestRoute(world, start, target, { maxNodes=12000, cell=2, cache=null }={}) {
  if(!target?.spatial)return [];
  let goal={x:target.x,z:target.z};
  // Workbenches and other interactable props can occupy their authored anchor.
  // End in walking clearance within interaction reach, never inside the prop.
  if(!world.isFree(goal.x,goal.z,.48,{allowSeams:true})) {
    let approach=null;
    for(const radius of [.8,1.6,2.4])for(let a=0;a<8&&!approach;a++) {
      const p={x:goal.x+Math.sin(a*Math.PI/4)*radius,z:goal.z+Math.cos(a*Math.PI/4)*radius};
      if(world.isFree(p.x,p.z,.48,{allowSeams:true}))approach=p;
    }
    if(!approach)return [];
    goal=approach;
  }
  if(yield* segmentChecks(world,start,goal))return [start,goal];
  if(cache?.world!==world||cache.cell!==cell)cache=createQuestRouteCache(world,cell);
  const open=new Heap(), best=new Map(), closed=new Set(), free=cache.free, edges=cache.edges, b=world.bounds;
  const key=(x,z)=>`${x},${z}`;
  const heuristic=(x,z)=>Math.hypot(x-goal.x,z-goal.z);
  const push=(x,z,g,parent)=>{const k=key(x,z);if(g>=(best.get(k)??Infinity))return;best.set(k,g);open.push({x,z,g,f:g+heuristic(x,z),parent,k});};
  for(const dx of [0,1])for(const dz of [0,1]) {
    const x=(Math.floor(start.x/cell)+dx)*cell,z=(Math.floor(start.z/cell)+dz)*cell;
    if(yield* segmentChecks(world,start,{x,z}))push(x,z,Math.hypot(x-start.x,z-start.z),{...start});
  }
  let visits=0;
  while(open.nodes.length&&visits++<maxNodes) {
    yield;
    const n=open.pop();if(closed.has(n.k))continue;closed.add(n.k);
    if(heuristic(n.x,n.z)<cell*2&&(yield* segmentChecks(world,n,goal))) {
      const path=[goal];for(let p=n;p;p=p.parent)path.push({x:p.x,z:p.z});path.reverse();
      // Compress only collision-tested segments. Keep slope/water checks at every sample.
      const simple=[path[0]];let anchor=0;
      while(anchor<path.length-1){let next=Math.min(path.length-1,anchor+12);while(next>anchor+1&&!(yield* segmentChecks(world,path[anchor],path[next])))next--;simple.push(path[next]);anchor=next;}
      return simple;
    }
    for(const dx of [-1,0,1])for(const dz of [-1,0,1]) {
      if(!dx&&!dz)continue;
      const x=n.x+dx*cell,z=n.z+dz*cell,k=key(x,z);
      if(closed.has(k)||x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
      if(!free.has(k))remember(free,k,world.isFree(x,z,.48,{allowSeams:true}),30000);
      if(!free.get(k))continue;
      const edge=n.k+'>'+k;
      const clear=edges.has(edge)?edges.get(edge):remember(edges,edge,yield* segmentChecks(world,n,{x,z}),60000);
      if(clear)push(x,z,n.g+Math.hypot(dx,dz)*cell,n);
    }
  }
  return []; // Never fall back to a line through an inaccessible obstacle.
}

/** Keep the pure blocking API for callers/tests which explicitly need a complete route. */
export function findQuestRoute(world,start,target,options) {
  const search=searchQuestRoute(world,start,target,options);let step;
  do { step=search.next(); } while(!step.done);
  return step.value;
}
