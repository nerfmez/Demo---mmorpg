// Focused review, called by the existing workspace suite. No new workflow or deployment.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {compareCraftRecipes,recipeEquipmentLevel,skillCraftGuide} from '../../src/core/craft-order.js';

export async function verifyEncounterCraft(page,{size,width,height,touch,out}) {
 const before=await page.evaluate(()=>{
  const f=__frontier,g=f.game,p=f.panels;
  const saved=JSON.parse(JSON.stringify({ch:g.ch,sel:p.sel,player:{x:g.player.x,z:g.player.z},paused:f.paused}));
  f.paused=true;g.ch.gold=100000;for(const id in g.data.items.materials)g.ch.materials[id]=1000;
  for(const r of Object.values(g.data.recipes.recipes))if(r.type==='skill')delete g.ch.skills[r.result];
  [g.player.x,g.player.z]=g.data.world.town.workbench;g.refresh();p.sel.craft='weapon';p.sel.craftReady=false;p.sel.craftSearch='';p.sel.craftRecipe=null;p.open('craft');return saved;
 });
 const report={size,width,height,touch,checks:[],artifacts:[]};
 const click=async selector=>{const q=page.locator(selector).first();await (touch?q.tap():q.click());};
 const shot=async label=>{const name=size+'-encounter-'+label+'.png';await page.screenshot({path:out+name,timeout:60000});report.artifacts.push(name);};
 const visibleIds=()=>page.locator('[data-recipe-id]:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.dataset.recipeId));
 const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),size+' horizontal overflow');
 const data=await page.evaluate(()=>__frontier.game.data);
 const inCategory=(r,cat)=>r.type==='gear'&&(cat==='weapon'?['weapon','offhand'].includes(data.items.gearBases[r.result].slot):cat==='charm'?data.items.gearBases[r.result].slot==='charm':['armor','helm','gloves','boots'].includes(data.items.gearBases[r.result].slot));
 try{
  for(const cat of ['weapon','armor','charm']){
   await click(`[data-act="craft-filter"][data-id="${cat}"]`);
   const expected=Object.entries(data.recipes.recipes).filter(([,r])=>inCategory(r,cat)).sort((a,b)=>compareCraftRecipes(data,a,b));
   assert.deepEqual(await visibleIds(),expected.map(([id])=>id),cat+' canonical order');
   assert.deepEqual(await page.locator('[data-recipe-id]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.equipmentLevel))),expected.map(([,r])=>recipeEquipmentLevel(data,r)));
   const ids=await visibleIds();
   await page.evaluate(()=>{const g=__frontier.game;g.ch.materials={crab_shell:1000,salt_gel:1000};__frontier.panels.render(true);});
   assert.deepEqual(await visibleIds(),ids,'inventory cannot reorder recipes');
   const ready=await page.locator('[data-recipe-id].ready').evaluateAll(nodes=>nodes.map(n=>n.dataset.recipeId));
   await click('[data-act="craft-ready"]');assert.deepEqual(await visibleIds(),ready,'craftable is an ordered subsequence');
   await click('[data-act="craft-ready"]');assert.deepEqual(await visibleIds(),ids);
   const input=page.locator('[data-craft-search]');await input.fill(data.items.gearBases[expected[0][1].result].name);
   const found=await visibleIds();assert.ok(found.length>0,'English name search');assert.deepEqual(found,ids.filter(id=>found.includes(id)));
   await input.fill('ไม่พบสูตรทดสอบ123');assert.equal((await visibleIds()).length,0);assert.ok(await page.locator('[data-craft-empty]').isVisible());
   await input.fill('');assert.deepEqual(await visibleIds(),ids);
   await page.evaluate(()=>{const g=__frontier.game;for(const id in g.data.items.materials)g.ch.materials[id]=1000;__frontier.panels.render(true);});
   await noOverflow();if(cat==='weapon')await shot('craft-weapons');
  }
  await click('[data-act="craft-filter"][data-id="skill"]');
  const skills=Object.entries(data.recipes.recipes).filter(([,r])=>r.type==='skill').sort((a,b)=>compareCraftRecipes(data,a,b));
  assert.deepEqual(await visibleIds(),skills.map(([id])=>id));
  assert.equal(await page.locator('[data-recipe-id="learn_healing_spring"]').getAttribute('data-craft-stage'),'0');
  assert.equal(await page.locator('[data-recipe-id="learn_war_cry"]').getAttribute('data-craft-stage'),'0');
  assert.deepEqual(await page.locator('[data-craft-group]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.craftGroup))),[0,1,2]);
  for(const [id,r]of skills)assert.equal(Number(await page.locator(`[data-recipe-id="${id}"]`).getAttribute('data-craft-stage')),skillCraftGuide(data,r).stage);
  await noOverflow();await shot('craft-skills');
  const search=page.locator('[data-craft-search]');await search.fill('ฟื้นฟู');assert.ok((await visibleIds()).includes('learn_healing_spring'));await search.fill('');
  const inventory=await page.evaluate(()=>JSON.stringify({gold:__frontier.game.ch.gold,materials:__frontier.game.ch.materials,gear:__frontier.game.ch.gear,skills:__frontier.game.ch.skills}));
  await click('[data-act="craft-open"][data-id="learn_healing_spring"]');
  assert.ok(await page.locator('[data-recipe="learn_healing_spring"]').isVisible());
  assert.equal(await page.evaluate(()=>JSON.stringify({gold:__frontier.game.ch.gold,materials:__frontier.game.ch.materials,gear:__frontier.game.ch.gear,skills:__frontier.game.ch.skills})),inventory,'inspection spends nothing');
  await noOverflow();await shot('craft-detail');await click('[data-act="craft-back"]');
  report.checks.push('actual-level sorting','stable inventory/search/craftable subsequences','early support and mechanical stages','inspection does not spend','craft touch controls and overflow');
  // Reveal only this never-saved fixture so every region can be reviewed in one image.
  await page.evaluate(()=>{
   const g=__frontier.game,p=__frontier.panels;
   for(const [id,map]of Object.entries(g.data.maps)){
    const d=id===g.data.world.id?g.ch.progress:(g.ch.progress.maps[id]||={});
    d.zones=map.zones.map(z=>z.id);d.waypoints=map.waypoints.map(w=>w.id);
   }
   p.sel.zone=g.data.world.id+':coast';p.sel.waypoint=null;p.open('map');
  });
  assert.equal(await page.locator('[data-encounter-pin]').count(),Object.values(data.maps).flatMap(m=>m.spawns).reduce((n,s)=>n+s.count,0));
  const positions=await page.evaluate(()=>({x:__frontier.game.player.x,z:__frontier.game.player.z,map:__frontier.game.data.world.id}));
  for(const [mapId,map]of Object.entries(data.maps)){
   for(const z of map.zones){
    await click(`[data-act="select-zone"][data-id="${mapId}:${z.id}"]`);
    const counts=await page.locator('[data-encounter-entry]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.encounterEntry,count:Number(n.dataset.encounterCount)})));
    const normal=map.spawns.filter(s=>s.zone===z.id);
    for(const s of normal)assert.equal(counts.find(c=>c.id===s.monster)?.count,s.count,mapId+'/'+z.id+'/'+s.monster);
    if(mapId===positions.map){
     const actual=await page.evaluate(zone=>__frontier.game.spawnPoints.filter(p=>p.zone===zone).map(p=>p.monster),z.id);
     assert.equal(counts.reduce((n,c)=>n+c.count,0),actual.length,'guide matches runtime population');
    }
    if(z.safe)assert.equal(counts.length,0,'safe zones have no monsters');
   }
  }
  assert.deepEqual(await page.evaluate(()=>({x:__frontier.game.player.x,z:__frontier.game.player.z,map:__frontier.game.data.world.id})),positions,'inspecting zones never travels');
  await click('[data-act="select-zone"][data-id="azure-harbor-v1:coast"]');
  await page.locator('.worldmap').scrollIntoViewIfNeeded();await noOverflow();await shot('map-overview');
  await click('[data-act="select-zone"][data-id="frontier-wilds-v1:wetland"]');
  await page.locator('.region-detail').scrollIntoViewIfNeeded();await noOverflow();await shot('map-wetland');
  const colors=await page.locator('[data-encounter-pin]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('fill')))]);assert.ok(colors.length>1,'species markers must not all use a missing color fallback');
  report.checks.push('distinct species marker colors','both maps actual normal counts','active simulation vs field guide','safe zones empty','zone selection never teleports','map touch controls and overflow');
  report.ok=true;
 }finally{
  await page.evaluate(saved=>{const f=__frontier,g=f.game,p=f.panels;p.close();for(const key of Object.keys(g.ch))delete g.ch[key];Object.assign(g.ch,saved.ch);Object.assign(g.player,saved.player);for(const key of Object.keys(p.sel))delete p.sel[key];Object.assign(p.sel,saved.sel);f.paused=saved.paused;g.refresh();},before);
  writeFileSync(out+size+'-encounter-report.json',JSON.stringify(report,null,2));
 }
 return report;
}
