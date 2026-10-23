// Authored landscape bands. Rules, heightfield and scenery share these native XZ footprints.
// This pass runs after the original seeded scatter; unchanged areas keep their exact layout.
import { clamp, distToPolyline, distToSegment, coastSample, pointInPolygon, pointInBox } from './math.js';
import { createRng } from './rng.js';

const smooth = (a,b,v) => { const t=clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };
const rectDistance = (r,x,z) => Math.hypot(Math.max(r[0]-x,x-r[1],0),Math.max(r[2]-z,z-r[3],0));

export function compileLandscape(data) {
  const config=data.landscape;
  if(!config) return null;
  const policy=config.clearance, bounds=data.bounds;
  const anchors=[
    [...data.playerSpawn,policy.spawn],
    ...(data.waypoints||[]).map(p=>[...p.pos,policy.waypoint]),
    ...(data.landmarks||[]).map(p=>[...p.at,(p.clear||6)+policy.landmark]),
    ...(data.bosses||[]).map(p=>[p.arena.x,p.arena.z,p.arena.r+policy.landmark]),
    ...(config.openCourts||[]).map(p=>[...p.at,p.diameter/2]),
  ];
  for(const key of ['centre','workbench','trainer','shop','well','respawn'])
    if(data.town?.[key]) anchors.push([...data.town[key],policy.service]);
  if(data.camp?.fire) anchors.push([...data.camp.fire,policy.service]);
  const safeRects=data.zones.filter(p=>p.safe).flatMap(p=>p.rects);
  const floors=data.city?.enabled?data.city.floors:[];
  const features=config.features.map(f=>{
    let total=0;
    const segments=f.points.slice(1).map((b,i)=>{
      const a=f.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),arc=total;
      total+=length; return {a,b,length,arc};
    });
    return {...f,segments,total,minX:Math.min(...f.points.map(p=>p[0]))-f.width,
      maxX:Math.max(...f.points.map(p=>p[0]))+f.width,minZ:Math.min(...f.points.map(p=>p[1]))-f.width,
      maxZ:Math.max(...f.points.map(p=>p[1]))+f.width};
  });
  const clearance=(x,z,pad=0)=>{
    let d=Math.min(x-bounds.minX,bounds.maxX-x,z-bounds.minZ,bounds.maxZ-z)-policy.border;
    if(d<=pad) return 0;
    for(const s of data.atlas?.seams||[]){
      const alongX=s.edge.endsWith('Z'),along=alongX?x:z,inside=((alongX?z:x)-bounds[s.edge])*(s.edge.startsWith('max')?-1:1);
      if(along>=s.span[0]-policy.seam-pad&&along<=s.span[1]+policy.seam+pad)d=Math.min(d,inside-policy.seam);
    }
    if(d<=pad)return 0;
    for(const r of data.roads||[])d=Math.min(d,distToPolyline(x,z,r.points)-r.width/2-policy.road);
    for(const r of data.safeRoutes||[])d=Math.min(d,distToPolyline(x,z,r.points)-r.width/2-policy.road);
    for(const r of safeRects)d=Math.min(d,rectDistance(r,x,z)-policy.service);
    for(const [ax,az,r] of anchors)d=Math.min(d,Math.hypot(x-ax,z-az)-r);
    if(data.river)d=Math.min(d,distToPolyline(x,z,data.river.points)-data.river.width/2-(data.river.bankWidth??6)-policy.water);
    for(const [px,pz,r]of data.ponds||[])d=Math.min(d,Math.hypot(x-px,z-pz)-r-policy.water);
    if(data.sea?.shore){const c=coastSample(data.sea,x,z);d=Math.min(d,c.distance-(c.kind==='beach'?(data.sea.beach||14):0)-policy.water);}
    if(d<=pad)return 0;
    for(const f of floors){
      if(f.bounds&&rectDistance(f.bounds,x,z)>policy.city+policy.blend+pad)continue;
      if(pointInPolygon(f.points,x,z)&&!(f.holes||[]).some(h=>pointInPolygon(h,x,z)))return 0;
      for(const loop of[f.points,...f.holes||[]])for(let i=0;i<loop.length;i++)d=Math.min(d,distToSegment(x,z,...loop[i],...loop[(i+1)%loop.length]).d-policy.city);
    }
    return smooth(0,policy.blend,d-pad);
  };
  const nearest=(f,x,z)=>{
    let distance=Infinity,arc=0;
    for(const s of f.segments){const p=distToSegment(x,z,...s.a,...s.b);if(p.d<distance){distance=p.d;arc=s.arc+p.t*s.length;}}
    return {distance,arc};
  };
  const weight=(f,x,z)=>{
    if(x<f.minX||x>f.maxX||z<f.minZ||z>f.maxZ)return 0;
    const n=nearest(f,x,z),wobble=(Math.sin(n.arc*.81)+Math.sin(n.arc*1.71)*.4)*config.edgeWobble;
    const shape=1-smooth(f.width/2-f.edge,f.width/2+wobble,n.distance);
    return shape?smooth(0,f.taper,Math.min(n.arc,f.total-n.arc))*shape*clearance(x,z):0;
  };
  const influence=(x,z)=>features.reduce((best,f)=>Math.max(best,weight(f,x,z)),0);
  const along=(f,arc)=>{
    const s=f.segments.find(s=>s.arc+s.length>=arc)||f.segments.at(-1),u=clamp((arc-s.arc)/s.length,0,1);
    return {x:s.a[0]+(s.b[0]-s.a[0])*u,z:s.a[1]+(s.b[1]-s.a[1])*u,angle:Math.atan2(s.b[0]-s.a[0],s.b[1]-s.a[1])};
  };
  return {config,features,clearance,nearest,weight,influence,along};
}

export function raiseLandscape(grid,base,profile){
  const delta=new Float32Array(base.length);
  if(!profile)return delta;
  for(const f of profile.features){
    if(!f.height)continue;
    const i0=Math.max(0,Math.floor((f.minX-grid.ox)/grid.res)),i1=Math.min(grid.w-1,Math.ceil((f.maxX-grid.ox)/grid.res));
    const j0=Math.max(0,Math.floor((f.minZ-grid.oz)/grid.res)),j1=Math.min(grid.h-1,Math.ceil((f.maxZ-grid.oz)/grid.res));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const x=grid.ox+i*grid.res,z=grid.oz+j*grid.res,w=profile.weight(f,x,z);
      if(!w)continue;
      const arc=profile.nearest(f,x,z).arc;
      const variation=1+(Math.sin(arc*.21)*.6+Math.sin(arc*.39+1.1)*.4)*profile.config.heightWobble;
      const k=j*grid.w+i;delta[k]=Math.max(delta[k],w*f.height*variation);
    }
  }
  return delta;
}

export function dressLandscape(profile,hf,circles,boxes,decor){
  const authored={features:profile?.config.features||[],walls:[],trees:[],roots:[],rocks:[]};
  if(!profile)return authored;
  const cfg=profile.config,rng=createRng(cfg.seed);
  const natural=new Set(['tree','birch','pine','willow','palm','rock','boulder','crystal','stump','log','ruin_wall','ruin_block','pillar_broken']);
  for(const list of[circles,boxes])for(let i=list.length-1;i>=0;i--)
    if(natural.has(list[i].type)&&profile.influence(list[i].x,list[i].z)>.05)list.splice(i,1);
  for(const key of['grass','flowers','bushes','ferns','mushrooms','pebbles','bones','logsDecor'])
    decor[key]=decor[key].filter(p=>profile.influence(p.x,p.z)<=.05||hf.slopeAt(p.x,p.z)<.6);
  const occupied=(x,z,r)=>circles.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+r+.35)||boxes.some(p=>pointInBox(p,x,z,r+.35));
  for(const f of profile.features){
    if(f.kind==='ruin_wall'){
      const p=cfg.wall;
      for(let arc=p.length/2,index=0;arc<f.total;arc+=p.length,index++){
        if(!p.pattern[index%p.pattern.length])continue;
        const at=profile.along(f,arc),r=Math.hypot(p.length/2,p.thickness/2);
        if(profile.clearance(at.x,at.z,r)<.99||occupied(at.x,at.z,r*.7))continue;
        const wall={...at,hx:p.thickness/2,hz:p.length/2,angle:at.angle,height:rng.range(...p.height),type:'landscape_wall',landscape:f.id,seed:rng.int(1,65535)};
        boxes.push(wall);authored.walls.push(wall);
      }
      continue;
    }
    for(let arc=f.taper;arc<f.total-f.taper;arc+=f.trees.spacing){
      const at=profile.along(f,arc),side=rng.range(-1,1)*f.width*.17;
      const x=at.x+Math.cos(at.angle)*side,z=at.z-Math.sin(at.angle)*side,scale=rng.range(...f.trees.scale),r=.75*scale;
      if(profile.weight(f,x,z)<.72||profile.clearance(x,z,r)<.99||hf.slopeAt(x,z)>.58||occupied(x,z,r))continue;
      const tree={x,z,r,type:rng.pick(f.trees.species),scale,rot:rng.range(0,Math.PI*2),landscape:f.id};
      circles.push(tree);authored.trees.push(tree);
      if(f.trees.roots)authored.roots.push({...tree,angle:at.angle});
    }
    const rock=cfg.rock;
    for(let arc=f.taper;arc<f.total-f.taper;arc+=rock.spacing)for(const side of[-1,1]){
      if(!rng.chance(rock.chance))continue;
      const at=profile.along(f,arc),r=rng.range(...rock.radius),offset=(f.width/2-r*.35)*side;
      const x=at.x+Math.cos(at.angle)*offset,z=at.z-Math.sin(at.angle)*offset;
      if(profile.clearance(x,z,r)<.99||occupied(x,z,r))continue;
      const item={x,z,r,height:Math.max(1.1,f.height*rng.range(...rock.heightScale)),rot:rng.range(0,Math.PI*2),type:'landscape_rock',landscape:f.id,seed:rng.int(1,65535)};
      circles.push(item);authored.rocks.push(item);
    }
  }
  return authored;
}
