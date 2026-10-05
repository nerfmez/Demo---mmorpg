// Cold start, fallback and stale asynchronous equip completion in the real game.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=`tests/browser/out/weapon-loading-${engine.name()}`;mkdirSync(out,{recursive:true});
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4238','--strictPort'],{stdio:'ignore',detached:true});
const url='http://localhost:4238/?fresh=1&quality=low&seed=5&stream=0';
for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('server');await new Promise(r=>setTimeout(r,250));}
let browser;
try{
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});page.setDefaultTimeout(90000);
 const requests=[],errors=[];page.on('request',r=>{if(r.url().includes('/models/weapons/'))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game?.time>.3);
 assert.equal(requests.length,1,'one starter weapon, not the full catalogue');
 const coldStart=await page.evaluate(()=>{const all=performance.getEntriesByType('resource'),weapons=all.filter(r=>r.name.includes('/models/weapons/')),nav=performance.getEntriesByType('navigation')[0];return {weaponRequests:weapons.length,weaponDecodedBytes:weapons.reduce((n,r)=>n+r.decodedBodySize,0),resourceRequests:all.length,resourceDecodedBytes:all.reduce((n,r)=>n+r.decodedBodySize,0),documentDecodedBytes:nav.decodedBodySize};});
 await page.evaluate(()=>{document.querySelector('.banner')?.remove();const f=window.__frontier;f.game.monsters=[];f.game.ch.level=100;for(const k in f.game.ch.stats)f.game.ch.stats[k]=100;f.view.zoom=.3;f.view.snapCamera();});
 const select=id=>page.evaluate(id=>{const f=window.__frontier,g=f.game,ch=g.ch;let it=ch.gear.find(i=>i.base===id);if(!it){it={uid:ch.nextUid++,base:id,itemLevel:g.data.items.gearBases[id].itemLevel,grade:'B',upgrade:0,options:[]};ch.gear.push(it);}ch.equipped.offhand=null;if(!f.equip(ch,g.data,it.uid,'weapon').ok)throw Error('equip');g.refresh();},id);
 const current=id=>page.waitForFunction(id=>JSON.parse(window.__frontier.view.heroLookKey||'[]')[1]?.bases?.weapon===id,id);
 const triangles=()=>page.evaluate(()=>{let n=0;window.__frontier.view.hero.bones.weapon.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;});
 let release;const gate=new Promise(r=>release=r);let parsedRequest;
 const response=new Promise(r=>parsedRequest=r);
 await page.route('**/frontier_kris.glb',async route=>{await gate;await route.continue();});
 page.on('requestfinished',r=>{if(r.url().endsWith('/frontier_kris.glb'))parsedRequest();});
 await select('frontier_kris');await current('frontier_kris');assert.ok(await triangles()>0,'procedural fallback is present while loading');assert.notEqual(await triangles(),9646);
 await page.screenshot({path:`${out}/kris-pending-fallback.png`});
 await select('fang_dagger');await current('fang_dagger');await page.waitForFunction(()=>{let n=0;window.__frontier.view.hero.bones.weapon.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n===23610;});
 const currentRig=await page.evaluate(()=>window.__frontier.view.hero.root.uuid);
 release();await response;await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(()=>window.__frontier.view.hero.root.uuid),currentRig,'late Kris completion does not rebuild or attach to current Fang Dagger');
 assert.equal(await triangles(),23610);
 await page.screenshot({path:`${out}/late-kris-keeps-fang-dagger.png`});
 await select('frontier_kris');await current('frontier_kris');await page.waitForFunction(()=>{let n=0;window.__frontier.view.hero.bones.weapon.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n===9646;});
 assert.equal(requests.filter(r=>r.endsWith('/frontier_kris.glb')).length,1,'cached Kris is not downloaded again');
 // Current model arrival preserves the active authored cast instead of restarting its animator.
 let releaseStaff;const staffGate=new Promise(r=>releaseStaff=r);
 await page.route('**/spore_staff.glb',async route=>{await staffGate;await route.continue();});
 await select('spore_staff');await current('spore_staff');
 await page.evaluate(()=>{const f=window.__frontier;f.paused=true;f.view.heroAnim.play('firebolt',.8,'staff',0,.3);f.view.heroAnim.action.t=.2;f.view.heroAnim.actionW=.7;window.__weaponLoadAnimator=f.view.heroAnim;window.__weaponLoadAction=f.view.heroAnim.action;const update=f.view.heroAnim.update.bind(f.view.heroAnim);f.view.heroAnim.update=(_dt,state)=>update(0,state);});
 releaseStaff();
 await page.waitForFunction(()=>{const f=window.__frontier;let n=0;f.view.hero.bones.weapon.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n===26164;});
 assert.deepEqual(await page.evaluate(()=>{const f=window.__frontier;return {sameAnimator:f.view.heroAnim===window.__weaponLoadAnimator,sameAction:f.view.heroAnim.action===window.__weaponLoadAction,t:f.view.heroAnim.action.t,weight:f.view.heroAnim.actionW};}),{sameAnimator:true,sameAction:true,t:.2,weight:.7});
 await page.screenshot({path:`${out}/staff-load-preserves-active-cast.png`});
 await page.evaluate(()=>{delete window.__weaponLoadAnimator.update;delete window.__weaponLoadAnimator;delete window.__weaponLoadAction;window.__frontier.paused=false;});
 // An absent registry model still uses its established procedural fallback.
 const before=requests.length;await select('wisp_staff');await current('wisp_staff');assert.ok(await triangles()>0);assert.equal(requests.length,before);
 // A failed GLB URL falls back once and never reloads on subsequent equips.
 await page.route('**/tide_staff.glb',r=>r.abort());await select('tide_staff');await current('tide_staff');await page.waitForTimeout(300);assert.ok(await triangles()>0);
 await select('rusty_sword');await current('rusty_sword');await select('tide_staff');await current('tide_staff');assert.equal(requests.filter(r=>r.endsWith('/tide_staff.glb')).length,1);
 // The largest completed legal light pair is measured with its outlines and current field.
 await select('wolfbite_sword');
 await page.evaluate(()=>{const f=window.__frontier,g=f.game,ch=g.ch;const base='spore_wand',item={uid:ch.nextUid++,base,itemLevel:g.data.items.gearBases[base].itemLevel,grade:'B',upgrade:0,options:[]};ch.gear.push(item);if(!f.equip(ch,g.data,item.uid,'offhand').ok)throw Error('dual equip');g.refresh();});
 await page.waitForFunction(()=>{const f=window.__frontier;const count=b=>{let n=0;b?.traverse(o=>{if(o.isMesh&&o.material.isMeshToonMaterial)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;};return count(f.view.hero.bones.weapon)===34544&&count(f.view.hero.bones.offhand)===33168;});
 const peakPair=await page.evaluate(()=>{const f=window.__frontier;f.view.renderer.render(f.view.scene,f.view.camera);const i=f.view.renderer.info;return {main:'wolfbite_sword',offhand:'spore_wand',sourceWeaponTriangles:67712,opaqueWeaponTrianglesIncludingOutlines:135424,wholeSceneTriangles:i.render.triangles,wholeSceneDrawCalls:i.render.calls,geometries:i.memory.geometries,textures:i.memory.textures};});
 const grip=await page.evaluate(()=>{const r=window.__frontier.view.hero;r.root.updateMatrixWorld(true);const distance=(bone,hand,center)=>{const palm=bone.position.clone().copy(center);hand.localToWorld(palm);return bone.getWorldPosition(bone.position.clone()).distanceTo(palm);};return {right:distance(r.bones.weapon,r.skin.body.getObjectByName('J_Bip_R_Hand'),r.gripCenter),left:distance(r.bones.offhand,r.skin.body.getObjectByName('J_Bip_L_Hand'),r.offhandGripCenter)};});
 assert.ok(grip.right<1e-5&&grip.left<1e-5,'imported grips meet both palms');
 await page.screenshot({path:`${out}/largest-completed-light-pair.png`});
 assert.deepEqual(errors,[]);
 writeFileSync(`${out}/measurements.json`,JSON.stringify({engine:engine.name(),coldStart,peakPair,grip,weaponRequests:requests.map(r=>r.split('/').at(-1)),staleCompletion:'current rig UUID unchanged',currentCompletion:'active animator/action/progress retained',missingFallback:'passed',failedFallback:'passed; no repeated request',errors},null,2));
 console.log('PASS weapon loading',JSON.stringify(coldStart));
}finally{await browser?.close();try{process.kill(-server.pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
