import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {createWorld} from '../../src/core/world.js';
import {Game} from '../../src/core/game.js';
import {fromBoxLocal} from '../../src/core/math.js';

const data=loadData();
const pairs=Object.values(data.maps).map(d=>{
  const base=structuredClone(d);delete base.landscape;
  return {data:d,world:createWorld(d),base:createWorld(base)};
});
const atRoad=(road,visit)=>{
  for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]));
    for(let j=0;j<=n;j++)visit(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n);
  }
};

test('landscape leaves original roads, anchors, water and city surfaces at their exact heights',()=>{
  for(const p of pairs){
    const check=(x,z)=>assert.equal(p.world.groundY(x,z),p.base.groundY(x,z),p.data.id+' '+[x,z]);
    for(const r of p.data.roads)atRoad(r,(x,z)=>{check(x,z);assert.equal(p.world.isFree(x,z,.45),p.base.isFree(x,z,.45),'no new road blocker');});
    check(...p.data.playerSpawn);for(const wp of p.data.waypoints)check(...wp.pos);
    for(const lm of p.data.landmarks||[])check(...lm.at);
    for(const pond of p.data.ponds||[])check(...pond);
    for(const f of p.data.city?.floors||[])for(const v of f.points)check(...v);
  }
});

test('every authored feature is present and the full shared seam band stays unchanged',()=>{
  for(const{world,base}of pairs){
    const profile=world.heightfield.landscape;
    for(const f of profile.features){
      if(f.kind==='ruin_wall'){assert.ok(world.landscape.walls.some(w=>w.landscape===f.id));continue;}
      let relief=0;
      for(let arc=0;arc<f.total;arc+=1){const p=profile.along(f,arc);relief=Math.max(relief,world.groundY(p.x,p.z)-base.groundY(p.x,p.z));}
      assert.ok(relief>.4,f.id+' must not disappear behind clearance masks');
    }
    for(const seam of world.seams)for(let along=seam.span[0];along<=seam.span[1];along+=4)for(let inside=0;inside<=24;inside+=4){
      const edge=world.bounds[seam.edge]-seam.outward*inside,x=seam.alongX?along:edge,z=seam.alongX?edge:along;
      assert.equal(world.terrainY(x,z),base.terrainY(x,z),'seam '+seam.edge);
    }
  }
});

test('original planting outside authored footprints retains the seeded layout',()=>{
  for(const {world,base}of pairs){
    const outside=p=>!p.landscape&&world.heightfield.landscape.influence(p.x,p.z)<=.05;
    for(const key of['circles','boxes'])assert.deepEqual(world[key].filter(outside),base[key].filter(outside),key);
    for(const key of Object.keys(base.decor))assert.deepEqual(world.decor[key].filter(outside),base.decor[key].filter(outside),key);
  }
});

test('new trees, rocks and masonry are solid and their complete footprints clear routes and water',()=>{
  for(const {world}of pairs){
    const authored=[...world.landscape.trees,...world.landscape.rocks,...world.landscape.walls];
    assert.ok(authored.length>0);
    for(const p of authored){
      assert.equal(world.isFree(p.x,p.z,.45),false,p.type);
      const radius=p.r??Math.hypot(p.hx,p.hz);
      assert.ok(world.heightfield.landscape.clearance(p.x,p.z,radius)>.98,p.landscape);
      assert.equal(world.isWater(p.x,p.z,radius),false);
      assert.equal(world.isBeach(p.x,p.z,radius),false);
    }
  }
});

test('saved characters displaced by a new wall recover locally without losing progression',()=>{
  const p=pairs.find(p=>p.world.landscape.walls.length),wall=p.world.landscape.walls[0];
  const g=new Game({...data,world:p.data},{world:p.world,seed:9});g.ch.gold=734;g.ch.level=8;
  const spot=g.freeSpotNear(wall.x,wall.z);
  assert.ok(p.world.isFree(spot.x,spot.z,g.player.r));assert.ok(Math.hypot(spot.x-wall.x,spot.z-wall.z)<=6);
  assert.equal(g.ch.gold,734);assert.equal(g.ch.level,8);
  const edge=fromBoxLocal(wall,wall.hx+g.player.r+.2,0);
  const moved=p.world.move(edge.x,edge.z,g.player.r,wall.x-edge.x,wall.z-edge.z);
  assert.ok(Math.hypot(moved.x-wall.x,moved.z-wall.z)>.5);
});

test('heightfield shoulders block steep ascent and retain graded ends',()=>{
  let steep=0,ramp=0;
  for(const{world,base}of pairs){
    const hf=world.heightfield;
    for(let j=1;j<hf.h-1;j+=1)for(let i=1;i<hf.w-1;i+=1){
      const k=j*hf.w+i;if(hf.landscapeDelta[k]<.2)continue;
      const x=hf.ox+i*hf.res,z=hf.oz+j*hf.res;
      if(world.tooSteep(x,z+1,x,z)&&!base.tooSteep(x,z+1,x,z))steep++;
      if(hf.landscapeDelta[k]>.4&&hf.landscapeDelta[k]<1.5&&world.slopeAt(x,z)<.55)ramp++;
    }
  }
  assert.ok(steep>20);assert.ok(ramp>20);
});
