import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, legacyData } from './helpers.js';
import { fromBoxLocal, pointInBox, coastSample, seaContains } from '../../src/core/math.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, migrateCharacter } from '../../src/core/character.js';
import { trackedQuest, questState } from '../../src/core/quests.js';
import { craft } from '../../src/core/crafting.js';
import { createRng } from '../../src/core/rng.js';
import { updateMonster } from '../../src/core/ai.js';
import { readFileSync } from 'node:fs';

const world = createWorld(data.world);
const originalBeach = JSON.parse(readFileSync(new URL('../fixtures/azure-beach/world.json',import.meta.url)));
const referencePoint = (x,z) => [x+(data.world.town.placement?.referenceOffset[0]||0),z+(data.world.town.placement?.referenceOffset[1]||0)];
const step = (g, seconds) => { for (let i=0;i<seconds*60;i++) g.update(1/60); };

test('new characters start on a safe dry beach beside the connected coastal town', () => {
  const g=new Game(data,{world,seed:1});
  assert.equal(world.zoneAt(g.player.x,g.player.z).id,'landing');
  assert.ok(!world.isWater(g.player.x,g.player.z));
  assert.equal(world.coastAt(g.player.x,g.player.z).kind,'beach');
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
  for(const tree of world.circles.filter(c=>['palm','pine','oak'].includes(c.type)))
    assert.ok(!world.docks.some(d=>pointInBox(d,tree.x,tree.z,tree.r)), 'trees leave dock approaches and decks clear');
});

test('market ramps reveal solid wooden approaches and cargo leaves a three-metre aisle', () => {
  for(const id of ['market_west','market_east']){
    const ramp=world.docks.find(d=>d.id===id+'_ramp'),deck=world.docks.find(d=>d.id===id);
    for(const lx of [-1.5,0,1.5])for(const lz of [-2.5,-2,-1]){
      const p=fromBoxLocal(ramp,lx,lz);
      assert.ok(world.groundY(p.x,p.z)-world.terrainY(p.x,p.z)>.05,'wood must not share the paved surface');
    }
    for(let lz=-deck.hz;lz<deck.hz-.5;lz+=.25)for(const lx of [-1.05,0,1.05]){
      const p=fromBoxLocal(deck,lx,lz);
      assert.ok(world.isFree(p.x,p.z,.45),'cargo leaves a three-metre clear aisle');
    }
  }
  for(const prop of data.world.harbor.dockCargo){
    const collider=world.boxes.find(b=>b.id===prop.id);
    assert.equal(collider.hx,prop.hx);assert.equal(collider.hz,prop.hz);
    assert.ok(!world.isFree(prop.x,prop.z,.1),'working cargo has collision');
  }
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
  for(const p of [[0,30],[0,118],[-110,50],[110,100]])assert.ok(world.inSea(...referencePoint(...p)),'bay and outer coasts stay open');
  assert.ok(!world.inSea(...referencePoint(-50,-50)) && !world.inSea(...referencePoint(70,-15)));
  assert.ok(data.world.harbor.lighthouse[0]<data.world.town.centre[0] && data.world.harbor.lighthouse[1]>data.world.town.centre[1]);
  assert.ok(data.world.roads.find(r=>r.id==='residential_loop').points.length>5);
  for (const b of world.boxes.filter(b=>b.type==='house')) {
    const source=data.world.town.buildings.find(a=>a.id===b.id);
    assert.equal(b.hx,source.hx);assert.equal(b.hz,source.hz);assert.equal(b.roofColor,source.roofColor);
    for(const x of [-b.hx,b.hx]) for(const z of [-b.hz,b.hz]) {
      const p=fromBoxLocal(b,x,z);assert.ok(!world.inSea(p.x,p.z),b.id+' footprint dry');
    }
  }
  for (const p of [data.world.playerSpawn,[-100,70]]) assert.ok(world.isBeach(...p));
  for (const p of [[-25,6.5],[-35,74],[36,70]]) assert.ok(!world.isBeach(...referencePoint(...p)),'quays, cape and slipway are not sand');
});

test('the lighthouse cape permits water, land, then water along one X without changing legacy shores', () => {
  for(const [z,water] of [[40,true],[94,false],[115,true]]){
    const p=referencePoint(-34.44,z);
    assert.equal(world.inSea(...p),water);
    assert.equal(world.coastAt(...p).distance<0,water,'paint and surf use the same signed coast');
    assert.equal(world.terrainY(...p)<world.waterLevel,water,'heightfield follows the contour');
  }
  const oldSea={shore:[[-20,10],[20,10]],edgeKinds:['beach']};
  assert.equal(seaContains(oldSea,0,8),false);assert.equal(seaContains(oldSea,0,12),true);
  assert.deepEqual(coastSample(oldSea,0,8),{distance:2,kind:'beach'});
  assert.deepEqual(coastSample(oldSea,0,12),{distance:-2,kind:'beach'});
});

test('the reference inlet remains water behind two connected lighthouse breakwaters', () => {
  assert.ok(world.inSea(...referencePoint(-40,80)),'the reference inlet cannot be filled with land');
  assert.ok(world.terrainY(...referencePoint(-40,80))<world.waterLevel);
  for(const id of ['breakwater','lighthouse_walk']){
    const deck=world.docks.find(d=>d.id===id);
    assert.ok(deck,id+' exists');
    for(let z=-deck.hz+.45;z<deck.hz-.45;z+=.25){
      const p=fromBoxLocal(deck,0,z);
      assert.ok(world.isFree(p.x,p.z,.45),id+' has an unbroken walking surface');
    }
  }
});

test('existing Azure saves retain all progress through the layout change and relocate only once', () => {
  const ch=createCharacter(data);ch.worldLayoutRevision='azure-reference-layout-7';
  ch.level=9;ch.jobLevel=6;ch.gold=456;ch.pos=[-16.4,-12.5];
  ch.progress.quests.h_arrival={status:'done',progress:1};ch.progress.waypoints.push('town','forest');
  const before=structuredClone(ch);
  const saved=migrateCharacter(ch,data);
  for (const key of ['level','jobLevel','gold','gear','skills','slots','materials','progress']) assert.deepEqual(saved[key],before[key],key+' preserved');
  assert.equal(saved.pos,null);saved.pos=[...data.world.town.centre];migrateCharacter(saved,data);assert.deepEqual(saved.pos,data.world.town.centre);
});

test('Azure Coast overlays the original beach town while the western world stays in place',()=>{
  assert.deepEqual(data.world.town.centre,originalBeach.town.centre,'town is anchored to the old town, not a translated whole world');
  assert.deepEqual(data.world.playerSpawn,originalBeach.playerSpawn);
  assert.deepEqual(data.world.waypoints.find(w=>w.id==='landing'),originalBeach.waypoints.find(w=>w.id==='landing'));
  assert.deepEqual(data.world.ponds,originalBeach.ponds);
  for(const id of ['forest','glade'])assert.deepEqual(world.zoneById(id),originalBeach.zones.find(z=>z.id===id));
  for(const p of [[-132,80],[-100,70],[-38,62]]){
    assert.ok(world.isBeach(...p),'original western beach remains beach');
    assert.ok(!world.inSea(...p),'original beach is not drowned by moving the port contour');
  }
  assert.equal(world.zoneAt(-110,-70).id,'forest');
  assert.ok(!world.isWater(-110,-70),'original forest is mainland');
  assert.ok(world.isWater(...originalBeach.ponds[0].slice(0,2)),'original grove pond remains water');
  const arrival=world.roads.find(r=>r.id==='arrival');
  assert.deepEqual(arrival.points[0],originalBeach.playerSpawn);
  assert.ok(world.isFree(...data.world.town.centre,.45),'original town anchor is still a walking point');
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

test('district work areas use individual dry colliders and every frontage has a clear road connection', () => {
  for(const p of data.world.harbor.workProps){
    const box=world.boxes.find(b=>b.id===p.id);
    assert.equal(box.type,'harbor_work');
    for(const key of ['x','z','hx','hz','angle','height'])assert.equal(box[key],p[key],p.id+' '+key);
    assert.ok(!world.isFree(p.x,p.z,.45),p.id+' blocks walking through working equipment');
    for(const x of [-p.hx,p.hx])for(const z of [-p.hz,p.hz]){
      const pt=fromBoxLocal(p,x,z);assert.ok(!world.inSea(pt.x,pt.z),p.id+' stays on land');
    }
  }
  for(const b of data.world.town.buildings){
    assert.ok(b.entryPath?.length>=2,b.id+' has an entry');
    const first=b.entryPath[0],front=fromBoxLocal(b,0,b.hz+.85);
    assert.ok(Math.hypot(first[0]-front.x,first[1]-front.z)<.001,b.id+' reaches its front threshold');
    const end=b.entryPath.at(-1);assert.ok(world.roadDist(...end)<0,b.id+' connects to a road');
    for(let j=1;j<b.entryPath.length;j++){
      const a=b.entryPath[j-1],end=b.entryPath[j],n=Math.max(1,Math.ceil(Math.hypot(end[0]-a[0],end[1]-a[1])/.2));let prev=a;
      for(let k=0;k<=n;k++){
        const p=[a[0]+(end[0]-a[0])*k/n,a[1]+(end[1]-a[1])*k/n];
        assert.ok(world.isFree(...p,.45),b.id+' entry remains clear');
        assert.ok(!world.tooSteep(...prev,...p),b.id+' entry stays walkable');prev=p;
      }
    }
  }
});

test('authored courtyard shade uses existing tree models and dry, off-road trunk collisions', () => {
  for (const tree of data.world.town.trees || []) {
    const trunk=world.circles.find(c=>c.id===tree.id);
    assert.ok(trunk,tree.id+' has a trunk collider');
    assert.equal(trunk.type,tree.species);
    assert.equal(trunk.r,tree.r);
    assert.equal(trunk.scale,tree.scale);
    assert.ok(['birch','palm'].includes(trunk.type));
    assert.ok(!world.isWater(tree.x,tree.z,tree.r));
    assert.ok(world.roadDist(tree.x,tree.z)>tree.r+.45);
    assert.ok(!world.isFree(tree.x,tree.z,.45));
  }
});

test('authored cape rocks use existing boulder collision and leave streets and entrances clear',()=>{
  for(const rock of data.world.town.rocks||[]){
    const collider=world.circles.find(c=>c.id===rock.id);
    assert.equal(collider.type,'boulder');
    assert.equal(collider.r,rock.r);assert.equal(collider.scale,rock.scale);
    assert.ok(!world.inSea(rock.x,rock.z),'rock centre is anchored to shore');
    assert.ok(world.roadDist(rock.x,rock.z)>rock.r+.45);
    assert.ok(!world.isFree(rock.x,rock.z,.45));
  }
});

test('the organised market aisle supports walking across its full advertised width',()=>{
  const aisle=data.world.town.market.aisle,[a,b]=aisle.points;
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
  for(let offset=-aisle.width/2+.45;offset<=aisle.width/2-.45;offset+=.3){
    let previous;
    for(let t=0;t<=length;t+=.2){
      const p=[a[0]+dx*t-dz*offset,a[1]+dz*t+dx*offset];
      assert.ok(world.isFree(...p,.45),'market aisle is blocked at '+p);
      if(previous){
        const moved=world.move(...previous,.45,p[0]-previous[0],p[1]-previous[1]);
        assert.ok(Math.hypot(moved.x-p[0],moved.z-p[1])<.05,'market aisle walking interrupted');
      }
      previous=p;
    }
  }
});

test('town residents stand on dry ground clear of streets and existing work equipment',()=>{
  const withoutResidents=createWorld({...data.world,town:{...data.world.town,residents:[]}});
  for(const resident of data.world.town.residents){
    const collider=world.circles.find(c=>c.id===resident.id);
    assert.equal(collider.type,'citizen');
    for(const key of ['x','z','r'])assert.equal(collider[key],resident[key]);
    assert.ok(withoutResidents.isFree(resident.x,resident.z,resident.r),resident.id+' intersects scenery');
    assert.ok(world.roadDist(resident.x,resident.z)>resident.r,resident.id+' blocks a street');
    assert.ok(!world.isWater(resident.x,resident.z,resident.r),resident.id+' has wet feet');
  }
});

test('generated coconut palms grow in groves behind the beach and lean toward the sea', () => {
  const world=createWorld(data.world),{palmBelt,beach}=data.world.sea;
  const generated=world.circles.filter(c=>c.type==='palm'&&!c.id);
  assert.ok(generated.length>=12,'shore groves exist');
  let seaward=0;
  for(const p of generated){
    const d=world.coastAt(p.x,p.z).distance;
    assert.ok(d<=beach+palmBelt&&d>=beach-3.5,`palm at ${p.x.toFixed(1)},${p.z.toFixed(1)} is off the back-beach band (${d.toFixed(1)})`);
    assert.ok(!world.isWater(p.x,p.z,.5),'palm stands on dry ground');
    // the lean direction (sin rot, cos rot) heads to lower coast distance, i.e. the sea
    if(world.coastAt(p.x+Math.sin(p.rot)*2,p.z+Math.cos(p.rot)*2).distance<d)seaward++;
  }
  assert.ok(seaward/generated.length>.8,'palms lean out over the sand');
  for(const p of generated)for(const q of generated)if(p!==q)assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=2.3,'crowns keep apart');
});

test('the lighthouse collider uses its authored radius', () => {
  const world=createWorld(data.world),tower=world.circles.find(c=>c.type==='lighthouse');
  assert.equal(tower.r,data.world.harbor.lighthouseRadius);
  assert.ok(!world.isFree(tower.x+tower.r-.3,tower.z,.1),'walls block');
});
