import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { encounterLayout, encounterPointAllowed, zoneEncounters } from '../../src/core/encounters.js';
const data = loadData();
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, wd]) => [id, createWorld(wd)]));
const protectedContent = JSON.stringify([data.maps, data.monsters, data.skills, data.items, data.recipes, data.progression]);
const rectDistance = (p, r) => Math.hypot(Math.max(r[0]-p.x,0,p.x-r[1]),Math.max(r[2]-p.z,0,p.z-r[3]));
const segmentDistance = (p,a,b) => {
  const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
  const t=l?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/l)):0;
  return Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);
};
for (const [id, world] of Object.entries(worlds)) {
  const rules=data.encounters.maps[id], layout=encounterLayout(world,data);
  test(`${id}: population, source levels and atlas remain exact`, () => {
    assert.deepEqual(layout.failures,[]);
    assert.equal(layout.points.length,world.data.spawns.reduce((n,s)=>n+s.count,0));
    const game=new Game({...data,world:world.data},{world,seed:7});
    for(const [i,s]of world.data.spawns.entries()){
      const points=layout.points.filter(p=>p.group===i);
      assert.equal(points.length,s.count);
      for(const p of points){assert.deepEqual(p.level,s.level);assert.equal(world.zoneAt(p.x,p.z).id,s.zone);}
    }
    for(const zone of world.zones)assert.equal(zoneEncounters(world,data,zone.id).reduce((n,e)=>n+e.count,0),game.spawnPoints.filter(s=>s.zone===zone.id).length);
  });
  test(`${id}: high-risk approaches allow idle wander before any aggro envelope`, () => {
    for(const edge of rules.transitions){
      const from=world.zoneById(edge.from);
      for(const p of layout.points.filter(p=>p.zone===edge.to)){
        const def=data.monsters.monsters[p.monster];
        const required=def.aggroRange+def.radius+data.encounters.placement.wanderMargin+edge.clearance;
        assert.ok(Math.min(...from.rects.map(r=>rectDistance(p,r)))>=required,JSON.stringify({edge,p,required}));
      }
    }
    for(const road of world.roads.filter(r=>rules.quietRoads.includes(r.id)))for(const p of layout.points){
      if(p.level[1]<=(rules.quietRoadMaxLevel||0))continue;
      const def=data.monsters.monsters[p.monster],required=road.width/2+def.aggroRange+def.radius+data.encounters.placement.wanderMargin+data.encounters.placement.roadMargin;
      for(let i=1;i<road.points.length;i++)assert.ok(segmentDistance(p,road.points[i-1],road.points[i])>=required,road.id+'/'+p.monster);
    }
  });
  test(`${id}: actual AI does not camp unattended player spawn, respawn, workbench or warps`, () => {
    const anchors=[['player spawn',world.data.playerSpawn],['respawn',world.data.town.respawn],['workbench',world.data.town.workbench],...world.waypoints.map(p=>[p.id,[p.x,p.z]])];
    for(const [name,pos]of anchors){
      const g=new Game({...data,world:world.data},{world,seed:19});
      Object.assign(g.player,{x:pos[0],z:pos[1]});g.setMove(0,0);g.drainEvents();
      let hits=0,aggro=0;
      for(let i=0;i<600;i++){
        g.update(.05);
        for(const event of g.drainEvents()){if(event.type==='playerHit')hits++;if(event.type==='aggro')aggro++;}
      }
      assert.equal(hits,0,`${id}/${name}: received damage while resting`);
      assert.equal(aggro,0,`${id}/${name}: unprovoked detection during idle wandering`);
      assert.equal(g.player.dead,false);
    }
  });
}
test('hermits occupy existing rocky coast, keep their loot zone and all five spawns', () => {
  const world=worlds['azure-harbor-v1'],hermits=encounterLayout(world,data).points.filter(p=>p.monster==='hermit_crab');
  assert.equal(hermits.length,5);
  for(const p of hermits){const c=world.coastAt(p.x,p.z);assert.equal(c.kind,'rock');assert.ok(c.distance>=0&&c.distance<=10);assert.equal(p.zone,'headland');assert.deepEqual(p.level,[7,8]);}
  const spawn=world.data.spawns.find(s=>s.monster==='hermit_crab'),p=hermits[0];
  assert.equal(encounterPointAllowed({...world,coastAt:()=>({distance:-1,kind:'rock'})},data,spawn,p.x,p.z),false,'negative signed coast distance is water, not coastal habitat');
  assert.equal(encounterPointAllowed({...world,coastAt:()=>({distance:1,kind:'quay'})},data,spawn,p.x,p.z),false,'city quay is not the authored rocky habitat');
});
test('habitats and inspections do not mutate balance, loot, equipment gates or saved data', () => {
  assert.equal(JSON.stringify([data.maps,data.monsters,data.skills,data.items,data.recipes,data.progression]),protectedContent);
  for(const world of Object.values(worlds)){
    const d={...data,world:world.data},g=new Game(d,{world,seed:7}),save=JSON.parse(JSON.stringify(g.snapshot()));
    const after=new Game(d,{world,seed:7,character:save}).snapshot();
    for(const key of ['version','level','jobLevel','gear','equipped','nextUid','progress','skills','mods','movementSkills','gold','materials'])assert.deepEqual(after[key],save[key]);
    assert.equal('encounterAudit' in after,false);
  }
});
