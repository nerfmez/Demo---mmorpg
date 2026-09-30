import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, legacyData } from './helpers.js';
import { fromBoxLocal } from '../../src/core/math.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, migrateCharacter } from '../../src/core/character.js';
import { trackedQuest, questState } from '../../src/core/quests.js';
import { craft } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';
import { updateMonster } from '../../src/core/ai.js';

const world = createWorld(data.world);
const step = (g, seconds) => { for (let i=0;i<seconds*60;i++) g.update(1/60); };

test('harbor is a local land-first map; new characters start on a safe dry beach', () => {
  const b=world.bounds; let land=0,total=0;
  for(let x=b.minX+1;x<b.maxX;x+=2) for(let z=b.minZ+1;z<b.maxZ;z+=2) { total++; if(!world.isWater(x,z)) land++; }
  assert.ok(land/total>=.60 && land/total<=.75, `land ${land/total}`);
  const g=new Game(data,{world,seed:1});
  assert.equal(world.zoneAt(g.player.x,g.player.z).id,'landing');
  assert.ok(!world.isWater(g.player.x,g.player.z));
  assert.ok(world.isFree(g.player.x,g.player.z,.45));
  assert.ok(g.isSafe(g.player.x,g.player.z));
  assert.ok(!g.isWaypointUnlocked('town'));
  assert.equal(g.teleportTo('town').reason,'locked');
  assert.equal(trackedQuest(g.ch,data),'h_arrival');
});

test('all active roads are continuous and walkable, with a safe arrival route', () => {
  for(const road of world.roads) {
    for(let i=1;i<road.points.length;i++) {
      const [ax,az]=road.points[i-1], [bx,bz]=road.points[i], distance=Math.hypot(bx-ax,bz-az);
      let x=ax,z=az;
      for(let t=0;t<=distance;t+=.3) {
        const nx=ax+(bx-ax)*t/distance, nz=az+(bz-az)*t/distance;
        assert.ok(world.isFree(nx,nz,.45), `${road.id} blocked at ${nx},${nz}`);
        assert.ok(!world.tooSteep(x,z,nx,nz),`${road.id} cliff`);
        if(road.id==='arrival') assert.ok(world.isSafe(nx,nz));
        const moved=world.move(x,z,.45,nx-x,nz-z);
        assert.ok(Math.hypot(moved.x-nx,moved.z-nz)<.05,`${road.id} movement interrupted`);
        x=nx;z=nz;
      }
    }
  }
});

test('pier decks support walking over deep water; their sides still block the sea', () => {
  for (const deck of world.docks.filter(d => d.kind === 'pier' && !d.rampFromTerrain)) {
    const ramp = world.docks.find(d => d.id === deck.id + '_ramp');
    const start = fromBoxLocal(ramp, 0, -ramp.hz);
    assert.equal(ramp.startY, world.terrainY(start.x, start.z), 'ramp starts at its rotated land end');
    let previous = start;
    for(let lz=-ramp.hz; lz<=ramp.hz+deck.hz*2-.5; lz+=.2) {
      const p=fromBoxLocal(ramp,0,lz);
      assert.ok(world.isFree(p.x,p.z,.45), `${deck.id} joins at ${lz}`);
      assert.ok(!world.tooSteep(previous.x,previous.z,p.x,p.z)); previous=p;
    }
    assert.ok(world.inSea(deck.x,deck.z));
    assert.equal(world.groundY(deck.x,deck.z),deck.height);
    const side=fromBoxLocal(deck,deck.hx+.5,0);
    assert.ok(!world.isFree(side.x,side.z,.45), 'outer deck sides block deep water');
  }
  assert.ok(world.decor.shells.every(s=>!world.dockAt(s.x,s.z)));
  assert.ok(data.world.docks.every(d=>d.startY===undefined));
});

test('monster spawns remain dry, separated and outside safe routes for multiple seeds', () => {
  for(const seed of [1,9,31]) {
    const g=new Game(data,{world,seed});
    for(const type of ['reef_crab','salt_slime','shore_gull','hermit_crab']) assert.ok(g.monsters.some(m=>m.type===type),`${type} exists, seed ${seed}`);
    for(const sp of g.spawnPoints) {
      assert.ok(!world.isWater(sp.x,sp.z));
      assert.ok(!world.isSafe(sp.x,sp.z));
      assert.ok(world.isFree(sp.x,sp.z,1.5));
      assert.ok(world.roadDist(sp.x,sp.z)>=3);
    }
    for(let i=0;i<g.spawnPoints.length;i++) for(let j=i+1;j<g.spawnPoints.length;j++) assert.ok(Math.hypot(g.spawnPoints[i].x-g.spawnPoints[j].x,g.spawnPoints[i].z-g.spawnPoints[j].z)>=6);
  }
});

test('new coastline monsters visibly wind up and cannot damage before the windup ends', () => {
  for(const type of ['reef_crab','salt_slime','shore_gull','hermit_crab']) {
    const g=new Game(data,{world,seed:3}),m=g.monsters.find(m=>m.type===type);
    g.monsters=[m]; m.aggro=true;m.state='chase';m.staggerT=0;
    for(const key in m.cd) m.cd[key]=0;
    const gap=m.r+g.player.r+.5;
    const angle=[0,Math.PI/2,Math.PI,-Math.PI/2].find(a=>!g.isSafe(m.x+Math.sin(a)*gap,m.z+Math.cos(a)*gap));
    g.player.x=m.x+Math.sin(angle)*gap;g.player.z=m.z+Math.cos(angle)*gap;
    const hp=g.player.hp;
    updateMonster(g,m,1/60);
    assert.equal(m.state,'windup',type);
    assert.equal(m.windup.name,m.def.primaryAttack,type);
    const duration=m.windup.total;
    for(let t=0;t<duration-.1;t+=1/60) updateMonster(g,m,1/60);
    assert.equal(g.player.hp,hp,type+' hit before telegraph');
    updateMonster(g,m,.2);
    assert.equal(m.state,'act',type+' has a stationary contact phase');
    assert.equal(g.player.hp,hp,type+' cannot hit before its contact pose');
    updateMonster(g,m,m.def.attacks[m.def.primaryAttack].duration);
    assert.ok(g.player.hp<hp,type+' finishes attack');
    assert.equal(m.state,'recover');
  }
});

test('newcomer progression reaches town, fights both starters, then crafts with beach drops', () => {
  const g=new Game(data,{world,seed:4});
  const [x,z]=data.world.town.centre;
  g.player.x=x;g.player.z=z;step(g,.5);
  assert.equal(questState(g.ch,'h_arrival').status,'active','arrival requires reaching its stone');
  const wp=world.waypoints.find(w=>w.id==='town');g.player.x=wp.x+1.5;g.player.z=wp.z;step(g,.5);
  assert.ok(g.isWaypointUnlocked('town'));
  assert.equal(trackedQuest(g.ch,data),'h_slimes');
  for(const m of g.monsters.filter(m=>m.type==='salt_slime').slice(0,3)) g.hitMonster(m,1e6);
  assert.equal(trackedQuest(g.ch,data),'h_crabs');
  for(const m of g.monsters.filter(m=>m.type==='reef_crab').slice(0,3)) g.hitMonster(m,1e6);
  assert.equal(trackedQuest(g.ch,data),'h_craft');
  assert.ok(craft(g.ch,data,'salt_boots',createRng(5)).ok,'guaranteed quest materials permit first craft');
  g.notify({type:'craft'});
  assert.equal(trackedQuest(g.ch,data),'h_fields');
});

test('legacy map saves relocate once and retain equipment, progression and quest history', () => {
  const ch=createCharacter(legacyData);
  delete ch.worldId;ch.pos=[20,0];ch.level=7;ch.gold=333;
  ch.progress.quests.m_boars={status:'done',progress:5};ch.progress.waypoints.push('ruins');
  const gear=structuredClone(ch.gear);
  const saved=migrateCharacter(ch,data);
  assert.equal(saved.pos,null);
  assert.deepEqual(saved.gear,gear);assert.equal(saved.level,7);assert.equal(saved.gold,333);
  assert.equal(saved.progress.quests.m_boars.status,'done');
  assert.ok(!saved.progress.waypoints.includes('ruins'));
  assert.ok(saved.progress.waypoints.includes('landing'));
  saved.pos=[62,22];migrateCharacter(saved,data);assert.deepEqual(saved.pos,[62,22]);
});

test('a pre-town death returns to the beach; unlocked town restores the town checkpoint', () => {
  const g=new Game(data,{world,seed:8});g.damagePlayer(1e6);step(g,5);
  assert.ok(world.isSafe(g.player.x,g.player.z));assert.equal(world.zoneAt(g.player.x,g.player.z).id,'landing');
  g.ch.progress.waypoints.push('town');[g.player.x,g.player.z]=data.world.town.centre;g.damagePlayer(1e6);step(g,5);
  assert.equal(world.zoneAt(g.player.x,g.player.z).id,'settlement');
});

test('active quests only send players to reachable content; all new parts have recipes', () => {
  for(const id of [...data.quests.main,...data.quests.side]) {
    const q=data.quests.quests[id];
    if(q.type==='kill') assert.ok(data.world.spawns.some(s=>s.monster===q.target),id);
    if(q.type==='waypoint') assert.ok(world.waypoints.some(w=>w.id===q.target),id);
  }
  for(const id of ['salt_gel','shore_feather','hermit_fragment']) assert.ok(Object.values(data.recipes.recipes).some(r=>r.cost[id]),id);
  for(const wp of world.waypoints) assert.ok(world.isFree(wp.x,wp.z+2.2,.45),wp.id+' arrival');
});



test('U bay opens south, all districts connect, and authored building footprints stay on land', () => {
  assert.ok(world.inSea(0,0) && world.inSea(0,118));
  assert.ok(!world.inSea(-130,25) && !world.inSea(130,25));
  assert.ok(data.world.harbor.lighthouse[0]<0 && data.world.harbor.lighthouse[1]>0);
  assert.ok(data.world.roads.find(r=>r.id==='residential_loop').points.length>5);
  for (const b of world.boxes.filter(b=>b.type==='house')) {
    const source=data.world.town.buildings.find(a=>a.id===b.id);
    assert.equal(b.hx,source.hx);assert.equal(b.hz,source.hz);assert.equal(b.roofColor,source.roofColor);
    for(const x of [-b.hx,b.hx]) for(const z of [-b.hz,b.hz]) {
      const p=fromBoxLocal(b,x,z);assert.ok(!world.inSea(p.x,p.z),b.id+' footprint dry');
    }
  }
  for (const p of [[-152,99],[152,99]]) assert.ok(world.isBeach(...p));
  for (const p of [[0,-24],[-78,0],[112,75]]) assert.ok(!world.isBeach(...p),'quays and slipway are not sand');
});

test('existing Azure saves retain all progress through the layout change and relocate only once', () => {
  const ch=createCharacter(data);delete ch.worldLayoutRevision;
  ch.level=9;ch.jobLevel=6;ch.gold=456;ch.pos=[62,22];
  ch.progress.quests.h_arrival={status:'done',progress:1};ch.progress.waypoints.push('town','forest');
  const before=structuredClone(ch);
  const saved=migrateCharacter(ch,data);
  for (const key of ['level','jobLevel','gold','gear','skills','slots','materials','progress']) assert.deepEqual(saved[key],before[key],key+' preserved');
  assert.equal(saved.pos,null);saved.pos=[-20,-42];migrateCharacter(saved,data);assert.deepEqual(saved.pos,[-20,-42]);
});


test('rotated repair slipway joins dry ground and descends along its own axis', () => {
  const d=world.docks.find(d=>d.kind==='slipway');
  const land=fromBoxLocal(d,0,-d.hz);
  assert.equal(d.startY,world.terrainY(land.x,land.z));
  let previous=land;
  for(let z=-d.hz;z<d.hz-.45;z+=.2){
    const p=fromBoxLocal(d,0,z);
    assert.ok(world.isFree(p.x,p.z,.45),'slipway access stays clear of the repair shed');
    assert.ok(!world.tooSteep(previous.x,previous.z,p.x,p.z));
    assert.ok(Math.abs(world.groundY(p.x,p.z)-(d.startY+(d.height-d.startY)*(z+d.hz)/(2*d.hz)))<1e-7);
    previous=p;
  }
});
