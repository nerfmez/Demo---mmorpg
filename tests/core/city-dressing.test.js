import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{loadData}from'../../src/core/data-node.js';import{createWorld}from'../../src/core/world.js';import{cityFloorAt,cityRoadDistance}from'../../src/core/city.js';import{cityNavigation}from'./city-navigation.js';
const data=loadData(),city=data.world.city,d=city.dressing,world=createWorld(data.world);
test('individual kit identities, full-size groups and supported stacks retain clear streets and source land',()=>{
 assert.ok(d.placements.length>=200);assert.ok(Object.keys(d.assets).length>=16);const groups=new Map();
 for(const[id,a]of Object.entries(d.assets)){const bytes=readFileSync(new URL('../../public/'+a.url,import.meta.url));assert.equal(bytes.length,a.bytes,id);assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256,id);assert.ok(a.dimensions.every(v=>v>0&&Number.isFinite(v)));}
 for(const p of d.placements){const a=d.assets[p.asset],r=Math.hypot(a.dimensions[0],a.dimensions[2])*p.scale/2;assert.ok(cityFloorAt(city,p.x,p.z,r+.5),p.id+' remains on supported land');assert.ok(cityRoadDistance(city,p.x,p.z)>=r+.45,p.id+' preserves full street polygon');assert.ok(p.scale>=.9&&p.scale<=1.1,'real meter-scale props');groups.set(p.group,(groups.get(p.group)||0)+1);
  if(p.stackOn){const base=d.placements.find(b=>b.id===p.stackOn);assert.ok(base);assert.equal(p.x,base.x);assert.equal(p.z,base.z);assert.equal(p.lift,d.assets[base.asset].dimensions[1]*base.scale);assert.ok(p.scale<=base.scale);assert.ok(!d.colliders.some(c=>c.id===p.id),'supported copy reuses base footprint');}
 }
 assert.ok([...groups.values()].every(n=>n>=2),'no isolated placement groups');
 for(const collider of d.colliders)assert.equal(world.isFree(collider.x,collider.z,.1),false,'solid props block their actual footprint');
});
test('every approved entrance, functional NPC, waypoint and pier landing remains independently walkable',()=>{
 const nav=cityNavigation(world);for(const e of city.entries)assert.ok(nav.path(e.x,e.z),e.id);for(const id of['trainer','workbench'])assert.ok(nav.path(...data.world.town[id]),id);
 const wp=world.waypoints.find(w=>w.id==='town');assert.ok(nav.path(wp.x,wp.z+2.2));for(const dock of world.docks)assert.ok(nav.path(dock.x,dock.z),dock.id);
 assert.ok(world.isFree(...data.world.town.respawn,.45));assert.ok(world.isFree(...data.world.playerSpawn,.45));
});
