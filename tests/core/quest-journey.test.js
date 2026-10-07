import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../../src/core/data-node.js';
import { createWorld } from '../../src/core/world.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, migrateCharacter, CHARACTER_VERSION } from '../../src/core/character.js';
import { enterMap } from '../../src/core/maps.js';
import { questIds, questObjectives, questState, questProgress, refreshQuests, questEvent, claimQuestReward, trackQuest, trackedQuest, migrateQuestJournal } from '../../src/core/quests.js';
import { questNavigation, questMapRoute } from '../../src/core/quest-navigation.js';
import { questJournalView, handleQuestJournalAction } from '../../src/ui/quest-journal.js';
import { trackerMarkup } from '../../src/ui/fieldhud.js';

const data=loadData(), A='azure-harbor-v1', F='frontier-wilds-v1';
const worlds=Object.fromEntries(Object.entries(data.maps).map(([id,d])=>[id,createWorld(d)]));
const fresh=()=>{const d={...data,world:data.maps[A]};const g=new Game(d,{world:worlds[A],seed:11});g.worlds=worlds;return g;};
const beforeQuest=(g,id)=>{for(const key of data.quests.main.slice(0,data.quests.main.indexOf(id)))g.ch.progress.quests[key]={status:'done',progress:data.quests.quests[key].count,rewardClaimed:true};g.completeQuests(refreshQuests(g.ch,g.data));};
const changeMap=(g,to,pos=null)=>{enterMap(g.ch,g.data,to,pos);g.data.world=g.data.maps[to];g.world=worlds[to];if(pos)[g.player.x,g.player.z]=pos;g.completeQuests(refreshQuests(g.ch,g.data));};
const visit=(g,map,waypoint)=>{if(g.data.world.id!==map)changeMap(g,map);const wp=g.world.waypoints.find(w=>w.id===waypoint);g.player.x=wp.x;g.player.z=wp.z;g.checkWorld();};
const active=(g,id)=>{g.ch.progress.quests[id]={status:'active',progress:0,objectives:{}};refreshQuests(g.ch,g.data);};
const renders=g=>questJournalView({game:g,sel:{}},{art:()=>'',rewardText:()=>''});
const copy=v=>JSON.parse(JSON.stringify(v));

test('one acyclic journey, every current quest reachable, historical definitions explicitly archived',()=>{
 const Q=data.quests, ids=questIds(data),known=new Set(Object.keys(Q.quests));
 assert.equal(Q.schema,2);assert.equal(new Set([...Q.main,...Q.side]).size,Q.main.length+Q.side.length);
 assert.deepEqual(Q.chapters.flatMap(c=>c.quests),Q.main);assert.equal(Q.main[0],'h_slimes');assert.ok(Q.side.includes('h_lighthouse'));assert.ok(Q.main.includes('s_coast'));
 assert.deepEqual([...ids,...Q.archived].sort(),[...known].sort());
 const visited=new Set(),visiting=new Set();const dfs=id=>{assert.ok(known.has(id));assert.ok(!visiting.has(id),'no cycle: '+id);if(visited.has(id))return;visiting.add(id);for(const p of Q.quests[id].requires||[])dfs(p);visiting.delete(id);visited.add(id);};ids.forEach(dfs);
 for(const id of ids){const d=Q.quests[id], objectives=questObjectives(d);assert.ok(d.chapter&&d.descTh&&d.objectiveTextTh);assert.equal(new Set(objectives.map(o=>o.id)).size,objectives.length);assert.ok(objectives.some(o=>o.id==='primary'));for(const o of objectives){assert.ok(o.count>0);for(const map of o.worlds||[o.world].filter(Boolean))assert.ok(data.maps[map],map);if(o.type==='waypoint')assert.ok(data.maps[o.world].waypoints.some(w=>w.id===o.target));if(o.type==='zone')assert.ok(data.maps[o.world].zones.some(z=>z.id===o.target));}}
});
test('all primary counts and numeric rewards remain exactly the v7 contract',()=>{
 const old=JSON.parse(readFileSync(new URL('../fixtures/quest-v7-contract.json',import.meta.url)));
 for(const [id,q]of Object.entries(data.quests.quests)){assert.deepEqual(q.reward,old[id].reward,id);assert.equal(q.count,old[id].count,id);assert.equal(questObjectives(q).find(o=>o.id==='primary').count,old[id].count,id);}
});
test('fresh play begins on the shore, not a town round trip or a flood of late side quests',()=>{
 const g=fresh();assert.equal(trackedQuest(g.ch,data),'h_slimes');assert.equal(data.quests.side.filter(id=>g.ch.progress.quests[id].status==='active').length,0);
 for(let i=0;i<3;i++)g.notify({type:'kill',target:'salt_slime'});
 assert.equal(trackedQuest(g.ch,data),'h_crabs');assert.equal(questState(g.ch,'h_birds').status,'active');
 for(let i=0;i<3;i++)g.notify({type:'kill',target:'reef_crab'});
 assert.equal(trackedQuest(g.ch,data),'h_arrival');visit(g,A,'town');assert.equal(trackedQuest(g.ch,data),'h_craft');
 g.notify({type:'craft'});assert.equal(trackedQuest(g.ch,data),'h_fields');
});
test('matching monster names in a different map do not grant scoped shore credit',()=>{
 const g=fresh();g.notify({type:'kill',target:'salt_slime',world:F});assert.equal(questState(g.ch,'h_slimes').progress,0);
 g.notify({type:'kill',target:'salt_slime',world:A});assert.equal(questState(g.ch,'h_slimes').progress,1);
});
test('discovery is map-qualified even during the frame where character and data world differ',()=>{
 const g=fresh();active(g,'h_arrival');enterMap(g.ch,g.data,F);assert.equal(g.data.world.id,A);assert.ok(g.ch.progress.waypoints.includes('town'));
 g.completeQuests(refreshQuests(g.ch,g.data));assert.notEqual(questState(g.ch,'h_arrival').status,'done');
});
test('previous discoveries complete the current mission from another map without returning',()=>{
 const g=fresh();beforeQuest(g,'h_grove');g.ch.progress.waypoints.push('forest');enterMap(g.ch,g.data,F);g.data.world=g.data.maps[F];g.world=worlds[F];
 const finished=refreshQuests(g.ch,g.data);assert.ok(finished.includes('h_grove'));assert.ok(finished.includes('f_road'));assert.equal(trackedQuest(g.ch,data),'m_forest');
});
test('one cross-map mission has two independent map-qualified objective records',()=>{
 const g=fresh();beforeQuest(g,'f_road');g.ch.progress.waypoints.push('forest');g.completeQuests(refreshQuests(g.ch,g.data));
 let p=questProgress(g.ch,data,'f_road');assert.equal(p.current,1);assert.equal(p.total,2);assert.equal(p.next.world,F);
 changeMap(g,F);p=questProgress(g.ch,data,'f_road');assert.equal(p.status,'done');assert.equal(p.current,2);
});
test('crossing the actual seam preserves pin, partial credit, player identity and quest rewards',()=>{
 const g=fresh();active(g,'m_boars');g.notify({type:'kill',target:'tusk_boar'});trackQuest(g.ch,g.data,'m_boars');
 const id=g.player.id,credits=copy(questState(g.ch,'m_boars'));const seam=g.world.seams[0];[g.player.x,g.player.z]=seam.gate;
 assert.ok(g.crossSeam(seam).ok);g.enterWorld(worlds[F]);assert.equal(g.player.id,id);assert.equal(trackedQuest(g.ch,g.data),'m_boars');assert.deepEqual(questState(g.ch,'m_boars'),credits);
 g.notify({type:'kill',target:'tusk_boar'});assert.equal(questState(g.ch,'m_boars').progress,2);
 const back=g.world.seams[0];[g.player.x,g.player.z]=back.gate;assert.ok(g.crossSeam(back).ok);g.enterWorld(worlds[A]);assert.equal(trackedQuest(g.ch,g.data),'m_boars');assert.equal(questState(g.ch,'m_boars').progress,2);
});
test('optional multi-map counts accumulate without using kills from an unlisted map',()=>{
 const g=fresh();active(g,'s_wolves');g.notify({type:'kill',target:'thornback_wolf'});changeMap(g,F);g.notify({type:'kill',target:'thornback_wolf'});g.notify({type:'kill',target:'thornback_wolf',world:'unrelated'});assert.equal(questState(g.ch,'s_wolves').progress,2);
});
test('one event is not replayed into a newly unlocked successor',()=>{
 const g=fresh(), q=g.data.quests;const local={...g.data,quests:{main:['a','b'],side:[],quests:{a:{type:'kill',target:'salt_slime',count:1},b:{type:'kill',target:'salt_slime',count:1}}}};
 const ch=createCharacter(local);questEvent(ch,local,{type:'kill',target:'salt_slime'});assert.equal(questState(ch,'a').status,'done');assert.equal(questState(ch,'b').progress,0);assert.equal(g.data.quests,q);
});
test('zero, negative and non-finite collected quantities never create extra credit; counts cap',()=>{
 const g=fresh();active(g,'s_feathers');for(const qty of [0,-3,NaN,Infinity])g.notify({type:'collect',item:'hawk_feather',qty,world:F});assert.equal(questState(g.ch,'s_feathers').progress,0);
 g.notify({type:'collect',item:'hawk_feather',qty:100,world:F});assert.equal(questState(g.ch,'s_feathers').progress,6);
});
test('earned rewards are applied once even for duplicate ids and subsequent refreshes',()=>{
 const g=fresh();for(let i=0;i<3;i++)g.notify({type:'kill',target:'salt_slime'});const paid=JSON.stringify(g.snapshot());
 g.completeQuests(['h_slimes','h_slimes']);g.completeQuests(refreshQuests(g.ch,g.data));assert.equal(JSON.stringify(g.snapshot()),paid);assert.equal(claimQuestReward(g.ch,g.data,'h_slimes'),null);
});
test('completed but unpaid v8 state is resumed once after a save reload',()=>{
 const g=fresh();questEvent(g.ch,g.data,{type:'kill',target:'salt_slime'});questEvent(g.ch,g.data,{type:'kill',target:'salt_slime'});questEvent(g.ch,g.data,{type:'kill',target:'salt_slime'});
 const before=g.ch.gold,loaded=new Game(g.data,{world:g.world,character:copy(g.snapshot()),seed:11});assert.equal(loaded.ch.gold,before+50);
 const reloaded=new Game(g.data,{world:g.world,character:copy(loaded.snapshot()),seed:11});assert.equal(reloaded.ch.gold,loaded.ch.gold);
});
test('v7 migration preserves paid quests, partial counters, inventory, discovery and historical ids',()=>{
 const g=fresh(),old=copy(g.snapshot());old.version=7;delete old.progress.questJournal;
 old.progress.quests={h_slimes:{status:'done',progress:3},h_crabs:{status:'active',progress:2},m_craft:{status:'done',progress:1},custom_old:{status:'done',progress:7}};
 old.progress.maps[F]={waypoints:['forest'],zones:['forest']};const owned=copy({gear:old.gear,materials:old.materials,gold:old.gold,level:old.level,maps:old.progress.maps});
 const ch=migrateCharacter(old,data);assert.equal(ch.version,CHARACTER_VERSION);assert.equal(ch.version,9);assert.equal(ch.progress.quests.h_crabs.objectives.primary,2);assert.equal(ch.progress.quests.custom_old.progress,7);
 const loaded=new Game(data,{world:worlds[A],character:copy(ch),seed:11});assert.deepEqual({gear:loaded.ch.gear,materials:loaded.ch.materials,gold:loaded.ch.gold,level:loaded.ch.level,maps:loaded.ch.progress.maps},owned);assert.equal(loaded.ch.progress.quests.h_slimes.rewardClaimed,true);
 const once=JSON.stringify(loaded.snapshot());migrateCharacter(loaded.ch,data);assert.equal(JSON.stringify(loaded.snapshot()),once);
});
test('partial primary credit maps safely into a new multi-objective mission',()=>{
 const ch=createCharacter(data);delete ch.progress.questJournal;ch.progress.quests={m_warden:{status:'active',progress:1}};migrateQuestJournal(ch,data,{legacy:true});
 assert.deepEqual(ch.progress.quests.m_warden.objectives,{approach:0,primary:1});assert.equal(ch.progress.quests.m_warden.status,'active');
});
test('unknown historical quest records remain opaque through migration and reload, without rewards',()=>{
 for(const version of [7,8]){
  const g=fresh(),old=copy(g.snapshot());old.version=version;
  if(version===7)delete old.progress.questJournal;
  const records={intro:{done:true,note:'original history',extra:{stage:4,tags:['retired','keep']}},future_record:{status:'archived',progress:'seven',rewardClaimed:false,arbitrary:[1,{flag:true}]},retired_marker:17};
  Object.assign(old.progress.quests,copy(records));
  const owned=copy({gold:old.gold,exp:old.exp,jobExp:old.jobExp,materials:old.materials});
  const loaded=new Game(g.data,{world:g.world,character:copy(old),seed:11});
  const check=ch=>{for(const [id,record]of Object.entries(records))assert.deepEqual(ch.progress.quests[id],record,id+' remains unchanged');assert.deepEqual({gold:ch.gold,exp:ch.exp,jobExp:ch.jobExp,materials:ch.materials},owned);};
  check(loaded.ch);for(const id of Object.keys(records))assert.equal(claimQuestReward(loaded.ch,g.data,id),null);
  loaded.completeQuests(refreshQuests(loaded.ch,g.data));migrateCharacter(loaded.ch,g.data);check(loaded.ch);
  const reloaded=new Game(g.data,{world:g.world,character:copy(loaded.snapshot()),seed:11});check(reloaded.ch);
 }
});
test('previously active missions are not relocked by the new prerequisite order',()=>{
 const ch=createCharacter(data);ch.version=7;delete ch.progress.questJournal;ch.progress.quests={s_golems:{status:'active',progress:2}};migrateCharacter(ch,data);refreshQuests(ch,data);assert.equal(ch.progress.quests.s_golems.status,'active');assert.equal(ch.progress.quests.s_golems.progress,2);
});
test('pin survives save/restore; completion returns to the story; invalid pins refuse',()=>{
 const g=fresh();active(g,'h_birds');assert.equal(trackQuest(g.ch,data,'h_birds'),true);assert.equal(trackQuest(g.ch,data,'m_warden'),false);assert.equal(trackQuest(g.ch,data,'missing'),false);
 const loaded=new Game(data,{world:worlds[A],character:copy(g.snapshot()),seed:11});assert.equal(trackedQuest(loaded.ch,data),'h_birds');for(let i=0;i<5;i++)loaded.notify({type:'kill',target:'shore_gull'});assert.equal(trackedQuest(loaded.ch,data),'h_slimes');
});
test('legacy single-objective fixture format remains playable without modern chapter metadata',()=>{
 const d={...data,quests:{main:['boar','craft'],side:['job'],quests:{boar:{type:'kill',target:'tusk_boar',count:2,reward:{gold:2}},craft:{type:'craft',count:1},job:{type:'job',count:1}}}};
 const g=new Game(d,{world:worlds[A]});assert.equal(trackedQuest(g.ch,d),'boar');g.notify({type:'kill',target:'tusk_boar'});g.notify({type:'kill',target:'tusk_boar'});assert.equal(trackedQuest(g.ch,d),'craft');g.notify({type:'craft'});assert.equal(questState(g.ch,'craft').status,'done');
});
test('every live mission has a real spatial target or an explicit menu destination',()=>{
 const g=fresh();for(const id of questIds(data)){active(g,id);const n=questNavigation(g,id);assert.ok(n?.spatial||n?.menu,id+' has reachable authored destination');assert.equal(n.unavailable,undefined,id);}
});
test('remote same-name waypoint routes to its own map, not the current towns stone',()=>{
 const g=fresh();beforeQuest(g,'f_road');g.ch.progress.waypoints.push('forest');g.completeQuests(refreshQuests(g.ch,g.data));const n=questNavigation(g,'f_road');assert.equal(n.world,F);assert.equal(n.remote,true);assert.deepEqual([n.x,n.z],g.world.seams[0].gate);assert.equal(n.goal.world,F);
});
test('displayed remaining distance is continuous across a change of map-local origin',()=>{
 const g=fresh();active(g,'m_forest');const gate=g.world.seams[0].gate;[g.player.x,g.player.z]=gate;const a=questNavigation(g,'m_forest');
 const [ox,oz]=data.maps[F].atlas.offset;changeMap(g,F,[gate[0]-ox,gate[1]-oz]);const b=questNavigation(g,'m_forest');assert.ok(Math.abs(a.distance-b.distance)<1e-9);assert.deepEqual(a.goal,b.goal);assert.equal(b.remote,false);
});
test('map route finds indirect connections and returns no arbitrary exit for unreachable worlds',()=>{
 const maps={a:{atlas:{seams:[{to:'wrong',gate:[0,0]},{to:'b',gate:[1,1]}]}},b:{atlas:{seams:[{to:'a',gate:[0,0]},{to:'c',gate:[2,2]}]}},c:{},wrong:{},island:{}};
 assert.deepEqual(questMapRoute(maps,'a','c').map(s=>s.to),['b','c']);assert.equal(questMapRoute(maps,'a','island'),null);
});
test('unknown material does not send the player through an arbitrary map exit',()=>{
 const g=fresh();g.data={...g.data,quests:{...data.quests,quests:{...data.quests.quests,probe:{type:'collect',target:'missing',count:1}}}};g.ch.progress.quests.probe={status:'active',progress:0};assert.equal(questNavigation(g,'probe').unavailable,true);
});
test('collection navigation includes zone drops rather than only monster-owned drops',()=>{
 const g=fresh(),d={...g.data,quests:{...data.quests,quests:{...data.quests.quests,probe:{type:'collect',target:'zone_only',count:1,objectives:[{id:'primary',type:'collect',target:'zone_only',count:1,world:F}]}}}};
 d.maps={...data.maps,[F]:{...data.maps[F],zoneDrops:{forest:[{item:'zone_only',chance:1,min:1,max:1}]}}};g.data=d;g.ch.progress.quests.probe={status:'active',progress:0};assert.equal(questNavigation(g,'probe').world,F);
});
test('rendering and inspecting chapters is read-only, tracking alone uses normal save callback',()=>{
 const g=fresh(),ui={game:g,sel:{},render(){this.renders=(this.renders||0)+1;},changed(){this.saves=(this.saves||0)+1;}};
 const before=JSON.stringify(g.snapshot());const html=renders(g);assert.ok(html.includes('ก้าวแรกของผู้เดินทาง'));assert.ok(html.includes('data-quest-id="h_slimes"'));assert.equal(JSON.stringify(g.snapshot()),before);
 assert.ok(handleQuestJournalAction(ui,{dataset:{act:'quest-chapter',id:'shared-road'}}));assert.ok(handleQuestJournalAction(ui,{dataset:{act:'quest-mode',id:'optional'}}));assert.equal(ui.saves,undefined);assert.equal(JSON.stringify(g.snapshot()),before);
 active(g,'h_birds');assert.ok(handleQuestJournalAction(ui,{dataset:{act:'quest-track',id:'h_birds'}}));assert.equal(ui.saves,1);assert.equal(trackedQuest(g.ch,g.data),'h_birds');
});
test('tracker displays next objective and stable final-goal distance, not changing gate distance',()=>{
 const g=fresh();beforeQuest(g,'f_road');g.ch.progress.waypoints.push('forest');g.completeQuests(refreshQuests(g.ch,g.data));const nav=questNavigation(g,'f_road'),html=trackerMarkup(g,'f_road',nav);assert.ok(html.includes('1/2'));assert.ok(html.includes(`~${Math.round(nav.distance)} ม.`));assert.ok(html.includes('ไปต่อทาง'));
});

test('the complete 13-mission journey finishes once, including save reloads and a real handover',()=>{
 let g=fresh(); const completions=[];
 const gather=()=>completions.push(...g.drainEvents().filter(e=>e.type==='questDone').map(e=>e.id));
 for(const id of data.quests.main){
  assert.equal(trackedQuest(g.ch,g.data),id,id+' is the next story mission');
  for(const o of questObjectives(data.quests.quests[id])){
   if(questProgress(g.ch,g.data,id).objectives.find(p=>p.id===o.id).progress>=o.count)continue;
   if(o.world && o.world!==g.data.world.id){
    const s=g.world.seams.find(s=>s.to===o.world);assert.ok(s);[g.player.x,g.player.z]=s.gate;
    assert.ok(g.crossSeam(s).ok);g.enterWorld(worlds[o.world]);
   }
   if(o.type==='waypoint'){const wp=g.world.waypoints.find(w=>w.id===o.target);[g.player.x,g.player.z]=[wp.x,wp.z];g.checkWorld();}
   if(o.type==='zone'){
    const zone=g.world.zones.find(z=>z.id===o.target),r=zone.rects[0];
    const pos=zone.label||[(r[0]+r[1])/2,(r[2]+r[3])/2];
    assert.equal(g.world.zoneAt(...pos).id,zone.id);[g.player.x,g.player.z]=pos;g.checkWorld();
   }
   if(o.type==='kill')for(let i=0;i<o.count;i++)g.notify({type:'kill',target:o.target});
   if(o.type==='craft')g.notify({type:'craft'});
  }
  assert.equal(questState(g.ch,id).status,'done',id+' completed');gather();
  const saved=copy(g.snapshot());g=new Game(g.data,{world:g.world,seed:11,character:saved});g.worlds=worlds;gather();
 }
 for(const id of data.quests.main)assert.equal(completions.filter(done=>done===id).length,1,id+' paid once across reloads');
 assert.equal(data.quests.main.filter(id=>questState(g.ch,id).status==='done').length,13);
 assert.ok(data.quests.side.includes(trackedQuest(g.ch,g.data)),'optional work remains after the story');
});
test('journal distinguishes a pending earned reward from a reward already received',()=>{
 const g=fresh();for(let i=0;i<3;i++)questEvent(g.ch,g.data,{type:'kill',target:'salt_slime'});
 assert.equal(questProgress(g.ch,g.data,'h_slimes').rewardClaimed,false);
 let html=renders(g);assert.ok(html.includes('รอรับอัตโนมัติ'));
 g.completeQuests(refreshQuests(g.ch,g.data));assert.equal(questProgress(g.ch,g.data,'h_slimes').rewardClaimed,true);
 html=renders(g);assert.ok(html.includes('รับแล้ว'));assert.ok(!html.includes('รอรับอัตโนมัติ'));
});
test('menu objectives open only their existing page without spending or inventing a distance',()=>{
 const g=fresh();active(g,'s_mods');const before=JSON.stringify(g.snapshot());let opened;
 const ui={game:g,open(id){opened=id;}};
 assert.equal(handleQuestJournalAction(ui,{dataset:{act:'quest-menu',id:'skills'}}),true);assert.equal(opened,'skills');
 assert.equal(handleQuestJournalAction(ui,{dataset:{act:'quest-menu',id:'settings'}}),false);assert.equal(JSON.stringify(g.snapshot()),before);
 assert.ok(!trackerMarkup(g,'s_mods',questNavigation(g,'s_mods')).includes('NaN'));assert.ok(renders(g).includes('สมุดการเดินทาง'));
});
test('legacy unregistered single-map discovery still completes unscoped fixture objectives',()=>{
 const d={...data,world:{...data.world,id:'legacy-map'},quests:{main:['explore'],side:[],quests:{explore:{type:'waypoint',target:'forest',count:1}}}};
 const ch=createCharacter(d);ch.progress.waypoints.push('forest');assert.ok(refreshQuests(ch,d).includes('explore'));
 const g={data:d,ch:createCharacter(d),player:{x:0,z:0}};refreshQuests(g.ch,d);assert.ok(questNavigation(g,'explore').spatial);
});
