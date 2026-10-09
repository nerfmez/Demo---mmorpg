// Focused production High review. Start a built preview at COAST_URL first.
// The owner camera is reconstructed from the shell/shrub anchors in the private
// reference, not from the apparent screen position of the seam alone.
// COAST_WALK=0 captures a baseline; final runs exercise the real main frame loop.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.COAST_OUT||'/tmp/coastal-seam';mkdirSync(out,{recursive:true});
const report={source:process.env.COAST_SOURCE||null,errors:[],captures:[],walks:[],softwareGPU:true};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:320,height:240},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.stack));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))report.errors.push(m.text());});
 await page.addInitScript(()=>{
  let f;window.__coastReads={sync:0,async:0};
  Object.defineProperty(window,'__frontier',{configurable:true,get:()=>f,set:value=>{
   f=value;for(const [key,label]of [['readRenderTargetPixels','sync'],['readRenderTargetPixelsAsync','async']]){
    const original=f.view.renderer[key];f.view.renderer[key]=function(...args){__coastReads[label]++;return original.apply(this,args);};
   }
  }});
 });
 await page.goto((process.env.COAST_URL||'http://127.0.0.1:4177/')+'?fresh=1&seed=9&quality=high&dynres=0',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'),null,{timeout:180000});
 await page.evaluate(()=>{const f=__frontier,v=f.view;f.paused=true;f.input.disabled=true;f.input.reset();document.querySelector('.banner')?.remove();f.questRoute.hide();v.__coastDraw=v.render.bind(v);v.render=()=>{};Object.assign(f.game.player,{x:-156.9,z:77,hp:1e9});v.updateStreaming(-156.9,77);});
 const waitNeighbour=()=>page.waitForFunction(()=>__frontier.view.neighbours.get('frontier-wilds-v1')?.region?.importedState==='imported-ready',null,{timeout:180000});
 await waitNeighbour();console.log('High neighbour imported, production queue');
 await page.setViewportSize({width:2048,height:1280});await page.evaluate(()=>new Promise(requestAnimationFrame));
 const capture=async(name,x,z,time)=>{
  const state=await page.evaluate(([x,z,time])=>{const f=__frontier,v=f.view,[ox,oz]=v.world.data.atlas.offset;Object.assign(f.game.player,{x:x-ox,z:z-oz,facing:Math.PI});v.zoom=1;v.shake=0;v.snapCamera();v.__coastDraw(1/60,time,{});f.hud.update(.6,f.panels);v.__coastDraw(0,time,{});return{global:[x,z],time,map:v.world.data.id,camera:v.camera.matrixWorld.elements.slice(),projection:v.camera.projectionMatrix.elements.slice(),quality:v.quality,dpr:v.renderer.getPixelRatio(),post:!!v.post,shadowSize:v.sun.shadow.mapSize.toArray(),budgetMs:v.buildQueue.budgetMs,glError:v.renderer.getContext().getError(),lost:v.renderer.getContext().isContextLost()};},[x,z,time]);
  assert.equal(state.quality,'high');assert.equal(state.post,true);assert.deepEqual(state.shadowSize,[2048,2048]);assert.equal(state.budgetMs,6);assert.equal(state.glError,0);assert.equal(state.lost,false);
  await page.screenshot({path:out+'/'+name+'.png',timeout:60000});report.captures.push({name,...state});console.log('captured '+name);
 };
 for(const [name,x,z,time]of [['reference',-156.9,77,10.5],['foam',-156.9,77,9],['retreat',-156.9,77,13],['inland',-166,-92,12]])await capture(name,x,z,time);
 if(process.env.COAST_WALK!=='0'){
  await page.setViewportSize({width:844,height:528});await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.evaluate(()=>{const f=__frontier,v=f.view;Object.assign(f.game.player,{x:-156.9,z:77});v.snapCamera();f.__coastIdentity={id:f.game.player.id,gold:f.game.ch.gold,gear:JSON.stringify(f.game.ch.gear),skills:JSON.stringify(f.game.ch.skills)};f.__coastSamples=[];const original=f.game.update.bind(f.game);f.game.update=dt=>{original(dt);const w=f.game.world,[ox,oz]=w.data.atlas.offset;f.__coastSamples.push({map:w.data.id,x:f.game.player.x+ox,z:f.game.player.z+oz,dt});};});
  for(const [direction,map,target]of [[-1,'frontier-wilds-v1',-163],[1,'azure-harbor-v1',-156.9]]){
   await page.evaluate(direction=>{const f=__frontier;f.paused=false;f.view.render=f.view.__coastDraw;f.game.setMove(direction,0);},direction);
   await page.waitForFunction(({direction,map,target})=>{const f=__frontier,[ox]=f.world.data.atlas.offset,x=f.game.player.x+ox;if(f.world.data.id===map&&(direction<0?x<=target:x>=target)){f.game.setMove(0,0);f.paused=true;return true;}return false;},{direction,map,target},{timeout:120000});
   const state=await page.evaluate(()=>{const f=__frontier,[ox,oz]=f.world.data.atlas.offset;return{map:f.world.data.id,global:[f.game.player.x+ox,f.game.player.z+oz],identity:{id:f.game.player.id,gold:f.game.ch.gold,gear:JSON.stringify(f.game.ch.gear),skills:JSON.stringify(f.game.ch.skills)}};});
   report.walks.push({direction,...state});await page.screenshot({path:out+(direction<0?'/walk-west.png':'/walk-east.png')});console.log('walked '+state.map);
  }
  report.walkSamples=await page.evaluate(()=>__frontier.__coastSamples);
  const identity=await page.evaluate(()=>__frontier.__coastIdentity);for(const w of report.walks)assert.deepEqual(w.identity,identity);
  assert.ok(report.walkSamples.some(s=>s.map==='frontier-wilds-v1'));
  for(let i=1;i<report.walkSamples.length;i++)assert.ok(Math.abs(report.walkSamples[i].x-report.walkSamples[i-1].x)<.6,'crossing adds no hop');
  // Evict the real neighbour, then rebuild with the normal async queue. Fixture
  // placement is separate from the actual walking/crossing evidence above.
  report.eviction=await page.evaluate(()=>{const v=__frontier.view,n=v.neighbours.get('frontier-wilds-v1'),old=n.region;v.render=()=>{};Object.assign(__frontier.game.player,{x:100,z:77});v.updateStreaming(100,77);window.__coastOld=old;return{removed:!v.neighbours.has('frontier-wilds-v1'),disposed:old.disposed};});
  assert.deepEqual(report.eviction,{removed:true,disposed:true});
  await page.evaluate(()=>{Object.assign(__frontier.game.player,{x:-156.9,z:77});__frontier.view.updateStreaming(-156.9,77);});await waitNeighbour();
  assert.equal(await page.evaluate(()=>__frontier.view.neighbours.get('frontier-wilds-v1').region!==window.__coastOld),true);
  await capture('reloaded',-156.9,77,10.5);console.log('evicted and reloaded');
 }
 report.readbacks=await page.evaluate(()=>window.__coastReads);assert.equal(report.readbacks.sync,0);assert.ok(report.readbacks.async>0);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
