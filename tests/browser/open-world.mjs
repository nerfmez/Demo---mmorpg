// Unified resident world: native input crosses every content boundary without
// scene construction, travel gates, document changes or resident actor resets.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.WORLD_OUT||new URL(`./out/open-world-${engine.name()}/`,import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const port=4207,url=`http://127.0.0.1:${port}/?fresh=1&quality=${process.env.WORLD_QUALITY||'high'}&seed=4&dynres=0`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser,page;const errors=[],warnings=[],report={};
try{
 for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('preview startup');await new Promise(r=>setTimeout(r,100));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});page.setDefaultTimeout(120000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});
 const started=Date.now();await page.goto(url);
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.view.worldPrepared&&document.querySelector('#loading').classList.contains('done'));
 report.startupMs=Date.now()-started;
 report.runtime=await page.evaluate(()=>{const gl=__frontier.view.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),scripts:[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean)};});
 report.ready=await page.evaluate(()=>{
  const f=__frontier,v=f.view,g=f.game;window.__unifiedDocument={};window.__actorIds=g.monsters.map(m=>m.id);window.__worldIdentity=g.world;window.__queueSteps=v.buildQueue.stats.steps;window.__crossingEvents=[];
  const emit=g.emit.bind(g);g.emit=e=>{if(['worldChanged','travel','travelRefused'].includes(e.type))__crossingEvents.push(e);emit(e);};
  g.ch.opening.stage='done';v.heroDown=v.heroDownTarget=0;f.questRoute.hide();document.querySelector('.banner')?.remove();g.player.hp=1e9;g.inCombat=()=>true;g.canCrossSeam=()=>false;
  return {quality:v.quality,origin:g.coordinateOrigin,regions:[...v.regions].map(([id,r])=>({id,state:r.importedState,spatial:r.spatial.stats,buffers:r.bufferStats})),memory:{...v.renderer.info.memory},queue:{...v.buildQueue.stats},monsters:g.monsters.length};
 });
 assert.ok(report.ready.regions.every(r=>r.state==='imported-ready'&&r.spatial),'all regional content is ready before play');
 await page.evaluate(()=>{const f=__frontier;f.paused=true;f.game.player.x=165;f.game.player.z=85;f.view.heroY=f.game.world.groundY(165,85);f.view.snapCamera();});
 await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/01-high-ground.png'});
 report.view=await page.evaluate(()=>{const v=__frontier.view;return {camera:v.camera.position.toArray(),regions:[...v.regions].map(([id,r])=>({id,spatial:{...r.spatial.stats},buffers:r.bufferStats})),objects:(()=>{let n=0;v.scene.traverse(()=>n++);return n;})()};});
 const joins=[
  {from:'azure-harbor-v1',to:'frontier-wilds-v1',at:[-159.7,-92],key:'ArrowLeft',name:'02-coastal-join'},
  {from:'frontier-wilds-v1',to:'moonroot-grove-v1',at:[223.7,-67.5],key:'ArrowRight',name:'03-forest-join'},
  {from:'moonroot-grove-v1',to:'azure-harbor-v1',at:[-12,58.2],key:'ArrowDown',name:'04-grove-coast-join'},
 ];
 report.crossings=[];
 for(const join of joins){
  await page.evaluate(({from,at})=>{const f=__frontier,g=f.game;f.input.reset();[g.player.x,g.player.z]=g.scenePoint(from,...at);g.activateRegion(from);f.view.switchRegion(from);f.view.heroY=g.world.groundY(g.player.x,g.player.z);f.view.snapCamera();f.paused=false;},{from:join.from,at:join.at});
  await page.keyboard.down(join.key);
  await page.waitForFunction(id=>__frontier.game.data.world.id===id,join.to,{timeout:15000});await page.keyboard.up(join.key);
  const crossing=await page.evaluate(()=>{const f=__frontier,g=f.game,v=f.view;f.paused=true;return {sameWorld:g.world===__worldIdentity,sameActors:__actorIds.every(id=>g.monsters.some(m=>m.id===id)),world:g.data.world.id,position:g.worldPoint(g.player.x,g.player.z),queueSteps:v.buildQueue.stats.steps-__queueSteps,memory:{...v.renderer.info.memory}};});
  assert.ok(crossing.sameWorld&&crossing.sameActors,'resident world and actors survive crossing');assert.equal(crossing.queueSteps,0,'walking performs no region build/GPU preparation');
  report.crossings.push({...join,...crossing});await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/'+join.name+'.png'});
 }
 // Actual touch gesture in the same mobile session, using the production zone.
 const client=engine===chromium?await page.context().newCDPSession(page):null;
 if(client){
  await page.evaluate(()=>{const f=__frontier;f.paused=false;f.game.inCombat=()=>false;[f.game.player.x,f.game.player.z]=f.game.scenePoint('azure-harbor-v1',165,85);f.game.activateRegion('azure-harbor-v1');f.view.switchRegion('azure-harbor-v1');f.view.snapCamera();});
  // Keyboard crossings switch input to desktop mode. A real canvas touch restores
  // touch mode before addressing the joystick (which is hidden in desktop mode).
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:422,y:195,id:1}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const box=await page.locator('.joyzone').boundingBox(),x=box.x+box.width*.4,y=box.y+box.height*.6;
  const before=await page.evaluate(()=>__frontier.game.player.x);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+55,y,id:1}]});
  await page.waitForFunction(x=>__frontier.game.player.x>x+.2,before,{timeout:10000});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.evaluate(()=>new Promise(requestAnimationFrame));
  report.touch=await page.evaluate(()=>({released:__frontier.game.input.moveX===0,position:[__frontier.game.player.x,__frontier.game.player.z]}));assert.equal(report.touch.released,true);
 }
 await page.evaluate(()=>{__frontier.paused=true;__frontier.view.snapCamera();});
 await page.setViewportSize({width:1194,height:834});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>{__frontier.input.reset();window.dispatchEvent(new Event('resize'));});
 await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/05-ipad-high.png'});
 report.ipad=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],regions:[...__frontier.view.regions].map(([id,r])=>({id,spatial:{...r.spatial.stats}}))}));
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/06-desktop-high.png'});
 await page.setViewportSize({width:1194,height:834});
 for(const [id,name] of [['frontier-wilds-v1','07-frontier-town'],['azure-harbor-v1','08-azure-town']]){
  await page.evaluate(id=>{const f=__frontier,g=f.game;const at=g.worlds[id].data.town.workbench;f.input.reset();[g.player.x,g.player.z]=g.scenePoint(id,...at);g.activateRegion(id);f.view.switchRegion(id);f.view.heroY=g.world.groundY(g.player.x,g.player.z);f.view.snapCamera();},id);
  await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/'+name+'.png'});
 }
 report.events=await page.evaluate(()=>__crossingEvents);assert.ok(!report.events.some(e=>e.type==='travel'||e.type==='travelRefused'),'no loading/combat seam notice or reload');
 assert.deepEqual(errors,[]);report.errors=errors;report.warningCounts=Object.fromEntries([...new Set(warnings)].map(w=>[w,warnings.filter(s=>s===w).length]));
 writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('PASS unified world',JSON.stringify({startupMs:report.startupMs,regions:report.ready.regions.length,crossings:report.crossings.map(c=>c.queueSteps),memory:report.ready.memory,touch:report.touch}));
}catch(error){report.error=error.message;report.errors=errors;report.state=await page?.evaluate(()=>{const f=__frontier,v=f?.view;return {prepared:v?.worldPrepared,regions:v?.regions&&[...v.regions].map(([id,r])=>({id,state:r.importedState,error:r.error?.message})),queue:v?.buildQueue.stats};}).catch(()=>null);writeFileSync(out+'/report.json',JSON.stringify(report,null,2));throw error;
}finally{await browser?.close();server.kill();}
