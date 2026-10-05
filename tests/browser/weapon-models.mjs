// Focused exact-source weapon integration proof. Uses existing core equip/save APIs.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { enterFullscreenGate } from './fullscreen-entry.mjs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = `tests/browser/out/weapon-models-${engine.name()}`;
mkdirSync(out, { recursive: true });
const provenance = JSON.parse(readFileSync('docs/WEAPON-MODEL-PROVENANCE.json')).items;
const ids = Object.keys(provenance);
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', '4237', '--strictPort'], {stdio:'ignore',detached:true});
const url='http://localhost:4237/?fresh=1&quality=low&seed=5&stream=0';
for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{} if(i>60)throw Error('server');await new Promise(r=>setTimeout(r,250));}
let browser;
try {
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true});
 page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if((m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))||m.text().includes('model not loaded'))errors.push(m.text());});
 const requests=[];page.on('request',r=>{if(r.url().includes('/models/weapons/'))requests.push(r.url());});
 await page.goto(url);await page.waitForFunction(()=>window.__frontier?.modelsReady && window.__frontier.game?.time>.3);
 assert.equal(await page.locator('.vite-error-overlay').count(),0);
 await page.evaluate(()=>{document.querySelector('.banner')?.remove();const f=window.__frontier;f.game.monsters=[];f.view.zoom=.3;f.view.snapCamera();f.game.ch.level=100;for(const s in f.game.ch.stats)f.game.ch.stats[s]=100;});
 const equip=async(id,off=null)=>{
  const result=await page.evaluate(({id,off})=>{const f=window.__frontier,g=f.game,ch=g.ch;ch.equipped.offhand=null;
   const give=(base,slot)=>{let item=ch.gear.find(i=>i.base===base);if(!item){item={uid:ch.nextUid++,base,itemLevel:g.data.items.gearBases[base].itemLevel,grade:'B',upgrade:0,options:[]};ch.gear.push(item);}const r=f.equip(ch,g.data,item.uid,slot);if(!r.ok)throw Error(base+' '+r.reason);};
   give(id,'weapon');if(off)give(off,'offhand');g.refresh();g.player.facing=.6;return g.gearLook();
  },{id,off});
  await page.waitForFunction(({id,tris})=>{const f=window.__frontier;if(JSON.parse(f.view.heroLookKey || '[]')[1]?.bases?.weapon!==id)return false;let actual=0;f.view.hero.bones.weapon.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)actual+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return actual===tris;},{id,tris:provenance[id]?.tris ?? 0});
  await page.waitForTimeout(180);return result;
 };
 const coldStart=await page.evaluate(()=>{const all=performance.getEntriesByType('resource');const weapons=all.filter(r=>r.name.includes('/models/weapons/'));return {weaponRequests:weapons.length,weaponBytes:weapons.reduce((n,r)=>n+r.decodedBodySize,0),allResourceRequests:all.length,allDecodedBytes:all.reduce((n,r)=>n+r.decodedBodySize,0)};});
 assert.equal(requests.length,1,'cold start only demands the starter weapon');
 const shot=(options)=>process.env.SKIP_CAPTURES==='1'?Promise.resolve():page.screenshot(options);
 const samples=[];
 for(const id of ids){
  console.log('capture',id);
  const look=await equip(id);
  const sample=await page.evaluate(()=>{const f=window.__frontier,b=f.view.hero.bones.weapon;let tris=0,parts=0;b.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial){parts++;tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});f.view.renderer.render(f.view.scene,f.view.camera);const frame=f.view.renderer.info.render;return {parts,tris,kind:f.view.hero.weaponKind,offhand:f.view.hero.offhandKind,frame:{activeTriangles:frame.triangles,drawCalls:frame.calls}};});
  assert.equal(sample.tris,provenance[id].tris,id+' exact geometry');assert.ok(sample.parts>0);
  if(['apprentice_staff','tide_staff','spore_staff'].includes(id)){
   sample.grip=await page.evaluate(()=>{const r=window.__frontier.view.hero;r.root.updateMatrixWorld(true);const group=r.bones.weapon.children.find(o=>o.type==='Group'&&o.userData.attachmentGrip);const anchor=group.userData.attachmentGrip;const source=r.gripCenter.clone().fromArray(anchor);group.localToWorld(source);const palm=r.gripCenter.clone();r.skin.body.getObjectByName('J_Bip_R_Hand').localToWorld(palm);return {sourceAnchor:anchor,localTranslation:group.position.toArray(),palmDistance:source.distanceTo(palm)};});
   assert.ok(sample.grip.palmDistance<1e-5,id+' chosen source grip meets actual palm');
   assert.deepEqual(sample.grip.sourceAnchor,id==='apprentice_staff'?[0,0,.585]:[0,0,0]);
   assert.ok(Math.abs(sample.grip.localTranslation[2]+(id==='apprentice_staff'?.585:0))<1e-12,'attachment sign');
  }
  await shot({path:`${out}/${id}-desktop.png`,clip:{x:360,y:180,width:460,height:460}});
  samples.push({id,...sample,look});
 }
 await equip('tusk_blade','fang_dagger');await shot({path:`${out}/dual-wield.png`,clip:{x:360,y:180,width:460,height:460}});
 await equip('beetle_maul','crag_tower_shield');await shot({path:`${out}/maul-shield.png`,clip:{x:360,y:180,width:460,height:460}});
 // Core offhand unequip and prohibited main-hand unequip preserve actual semantics.
 await page.evaluate(()=>{const f=window.__frontier;f.panels.onClick({target:{closest:()=>({dataset:{act:'unequip',slot:'offhand'}})}});if(f.game.ch.equipped.offhand!==null)throw Error('offhand unequip');});
 console.log('all 19 exact geometry checks passed');
 for(const [label,width,height] of [['ipad',1024,768],['mobile',844,390]]){
  await page.setViewportSize({width,height});
  for(const id of ['rusty_sword','tide_staff','tusk_greatblade','fang_bow','frontier_kris']){await equip(id);await page.evaluate(()=>window.__frontier.view.snapCamera());await shot({path:`${out}/${id}-${label}.png`});}
 }
 await page.setViewportSize({width:1180,height:820});
 await equip('fang_bow');
 const bowGrip=await page.evaluate(()=>{const r=window.__frontier.view.hero;r.root.updateMatrixWorld(true);const hand=r.skin.body.getObjectByName('J_Bip_R_Hand'),palm=r.bones.weapon.position.clone().copy(r.gripCenter);hand.localToWorld(palm);return r.bones.weapon.getWorldPosition(r.bones.weapon.position.clone()).distanceTo(palm);});
 assert.ok(bowGrip<1e-5,'imported bow has zero palm offset');
 const ammo=await page.evaluate(()=>{const f=window.__frontier,g=f.game;g.ch.slots[0]={skill:'hunter_shot',mods:[]};g.refresh();g.player.mp=g.player.maxMp;const before=Object.values(g.ch.arrows.stock).reduce((a,n)=>a+n,0);g.castSlot(0,{x:g.player.x+5,z:g.player.z});return before;});
 await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>Object.values(window.__frontier.game.ch.arrows.stock).reduce((a,n)=>a+n,0)),ammo-1,'bow ammo');
 // Freeze at measured animation phases to inspect grip contact through carry/swing/walk.
 for(const id of ['rusty_sword','tusk_greatblade','tide_staff','fang_bow']){
  await equip(id);
  for(const [phase,t] of [['idle',0],['windup',.1],['hit',.3],['recover',.55]]){
   await page.evaluate(({phase,t})=>{const f=window.__frontier;f.paused=true;const s={speed:0,moving:false,facing:f.view.hero.root.rotation.y,dead:false,time:f.game.time};if(phase!=='idle')f.view.heroAnim.play(f.view.hero.weaponKind==='bow'?'hunter_shot':f.view.hero.weaponKind==='staff'?'firebolt':'slash',.8,f.view.hero.weaponKind,0,.3,'attack');f.view.heroAnim.update(t,s);f.view.renderer.render(f.view.scene,f.view.camera);},{phase,t});
   await shot({path:`${out}/${id}-${phase}.png`,clip:{x:360,y:180,width:460,height:460}});
   await page.evaluate(()=>window.__frontier.paused=false);
  }
 }
 // Walking/stop samples from actual keyboard movement.
 await equip('rusty_sword');await page.keyboard.down('w');await page.waitForTimeout(650);await shot({path:`${out}/walking.png`});await page.keyboard.up('w');await page.waitForTimeout(500);await shot({path:`${out}/stopped.png`});
 console.log('viewport, action, walk and stop captures complete');
 const resource=[];
 for(let round=0;round<3;round++){
  // All assets are already warm: exercise real equip plus the same view rebuild synchronously.
  await page.evaluate(ids=>{const f=window.__frontier,g=f.game;for(const id of ids){g.ch.equipped.offhand=null;const item=g.ch.gear.find(i=>i.base===id);if(!f.equip(g.ch,g.data,item.uid,'weapon').ok)throw Error('switch');g.refresh();f.view.setHeroLook(g.ch.appearance,g.gearLook());f.view.updateHero(0,g.time);f.view.renderer.render(f.view.scene,f.view.camera);}},ids);
  console.log('resource round',round);
  resource.push(await page.evaluate(()=>{const i=window.__frontier.view.renderer.info;return {...i.memory,programs:i.programs.length,drawCalls:i.render.calls,activeTriangles:i.render.triangles};}));
 }
 assert.equal(resource[2].geometries,resource[1].geometries,'geometry stabilizes');assert.equal(resource[2].textures,resource[1].textures,'textures stabilize');
 assert.equal(requests.length,ids.length,'no reload per equip');
 const loading=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('/models/weapons/')).map(r=>({file:r.name.split('/').at(-1),bytes:r.decodedBodySize,durationMs:r.duration})));
 writeFileSync(`${out}/measurements.json`,JSON.stringify({engine:engine.name(),coldStart,bowGrip,samples,resource,loading,stage:'before save reload'},null,2));
 // Persist the fixture in a real slot and reload through the menu.
 const equipped=await page.evaluate(async()=>{const f=window.__frontier;f.game.ch.level=f.game.data.progression.character.maxLevel;f.game.ch.stats={...f.game.data.progression.character.startingStats,STR:30,DEX:30,INT:30};f.game.ch.statPoints=10;localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character:f.game.ch}));localStorage.setItem('frontier.lastSlot','1');return f.game.ch.equipped;});
 await page.goto('http://localhost:4237/?quality=low&seed=5&stream=0');
 await page.waitForFunction(()=>window.__frontier.modelsReady);
 await enterFullscreenGate(page);
 const continueButton=page.getByRole('button',{name:/continue|เล่นต่อ|ดำเนินต่อ/i});
 if(await continueButton.count())await continueButton.first().click();else await page.locator('[data-act="continue"], [data-action="continue"]').first().click();
 await page.waitForFunction(()=>window.__frontier.game?.time>.3);
 assert.deepEqual(await page.evaluate(()=>window.__frontier.game.ch.equipped),equipped,'save equip compatibility');
 writeFileSync(`${out}/measurements.json`,JSON.stringify({engine:engine.name(),coldStart,bowGrip,samples,resource,loading,requestsBeforeReload:ids.length,errors},null,2));
 assert.deepEqual(errors,[]);
 console.log('PASS weapon models',engine.name(),JSON.stringify(resource));
} finally {await browser?.close();try { process.kill(-server.pid); } catch (e) { if(e.code!=='ESRCH')throw e; }}
