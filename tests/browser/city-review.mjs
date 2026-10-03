// Approved source city in the production renderer. Routes are independently solved from actor footprints.
import assert from'node:assert/strict';import{chromium,webkit}from'playwright';import{spawn}from'node:child_process';import{mkdirSync,writeFileSync}from'node:fs';
import{loadData}from'../../src/core/data-node.js';import{createWorld}from'../../src/core/world.js';import{cityNavigation}from'../core/city-navigation.js';import{enterFullscreenGate}from'./fullscreen-entry.mjs';
import{verifyPassiveGestures}from'./passive-checks.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,data=loadData(),world=createWorld(data.world),nav=cityNavigation(world);
const reviewName=process.env.DREAMLOOP_PASS?`dreamloop-${process.env.DREAMLOOP_PASS}`:process.env.AZURE_LAYOUT_REVIEW?`azure-layout-${engine.name()}`:`city-${engine.name()}`;
const out=process.env.CITY_OUT||`tests/browser/out/${reviewName}/`;mkdirSync(out,{recursive:true});
const base=process.env.CITY_URL||process.env.DREAMLOOP_URL||'http://localhost:4194/';
const server=process.env.CITY_URL||process.env.DREAMLOOP_URL?null:spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4194','--strictPort'],{stdio:'ignore',detached:true});
const report={browser:engine.name(),base,errors:[],captures:[],routes:[],physicalDeviceFPS:'not measured'};let browser;
try{
 for(let i=0;server;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('local server');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await ctx.newPage();page.setDefaultTimeout(90000);
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__cityFreeze)cb(t);});});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push('HTTP '+r.status()+' '+r.url());});
 await page.goto(base+'?fresh=1&seed=9&quality=medium&dynres=0');await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.game?.time>.1);await enterFullscreenGate(page);
 await page.evaluate(()=>{__cityFreeze=true;__frontier.paused=true;__frontier.input.disabled=true;});
 const shot=async(name,x,z,zoom=1.4,top=false)=>{
  await page.evaluate(([x,z,zoom,top])=>{const f=__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.zoom=zoom;f.view.scene.fog.near=zoom>2?1000:44;f.view.scene.fog.far=zoom>2?2000:84;f.view.camera.far=600;f.view.camera.updateProjectionMatrix();f.view.snapCamera();if(top){f.view.camera.position.set(x,330,z+.01);f.view.camera.lookAt(x,.76,z);f.view.camera.updateMatrixWorld();}f.view.render(0,1,{});if(top){f.view.camera.position.set(x,330,z+.01);f.view.camera.lookAt(x,.76,z);f.view.camera.updateMatrixWorld();f.view.renderer.render(f.view.scene,f.view.camera);}f.hud.update(.5,f.panels);document.querySelector('#hud').style.visibility=zoom>2?'hidden':'';},[x,z,zoom,top]);
  await page.screenshot({path:out+name+'.png',timeout:90000});report.captures.push({name,...await page.evaluate(()=>{const f=__frontier;return{position:[f.game.player.x,f.game.player.z],calls:f.view.renderer.info.render.calls,triangles:f.view.renderer.info.render.triangles,geometries:f.view.renderer.info.memory.geometries};})});
 };
 const walk=async(id,path)=>{
  assert.ok(path,id+' reachable');const result=await page.evaluate(path=>{const g=__frontier.game;let ticks=0;
   for(const[x,z]of path){let i=0;for(;i<1600&&Math.hypot(x-g.player.x,z-g.player.z)>.04;i++){const distance=Math.hypot(x-g.player.x,z-g.player.z);g.setMove((x-g.player.x)/distance,(z-g.player.z)/distance);g.update(Math.min(1/60,distance/g.derived.moveSpeed));ticks++;if(g.player.dead)throw Error('walk died');}
    if(i===1600)throw Error('walk blocked at '+[x,z]+' from '+[g.player.x,g.player.z]);}
   g.setMove(0,0);for(let i=0;i<30;i++)g.update(1/60);return{ticks,position:[g.player.x,g.player.z],townUnlocked:g.isWaypointUnlocked('town'),arrival:g.ch.progress.quests.h_arrival?.status};},path);
  report.routes.push({id,...result});return result;
 };
 if(!process.env.CITY_CAPTURE_ONLY){
 // Native touch drives the existing production input handler.
 await page.evaluate(()=>__frontier.input.disabled=false);
 if(engine===chromium){const cdp=await ctx.newCDPSession(page);const r=await page.locator('.joy').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2,id:7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.9,y:r.y+r.height/2,id:7}]});report.touch=await page.evaluate(()=>{__frontier.input.update();return __frontier.game.input.moveX;});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
 else report.touch=await page.evaluate(()=>{const f=__frontier,r=f.input.joyZone.getBoundingClientRect();for(const[type,x]of[['pointerdown',r.x+r.width/2],['pointermove',r.x+r.width*.9]])f.input.joyZone.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'touch',clientX:x,clientY:r.y+r.height/2}));f.input.update();const v=f.game.input.moveX;f.input.joyZone.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,pointerType:'touch'}));return v;});
 assert.ok(report.touch>.8);await page.evaluate(()=>__frontier.input.disabled=true);
 await walk('original-safe-arrival',data.world.roads.find(r=>r.id==='arrival').points);
 const wp=world.waypoints.find(p=>p.id==='town');const arrived=await walk('town-waypoint',nav.path(wp.x,wp.z+2.2));assert.ok(arrived.townUnlocked&&arrived.arrival==='done');
 for(const id of['trainer','workbench']){
  await page.evaluate(p=>Object.assign(__frontier.game.player,{x:p[0],z:p[1]}),data.world.town.respawn);
  await walk(id,nav.path(...data.world.town[id]));assert.ok(await page.evaluate(id=>__frontier.game.nearby()[id],id));
 }
 for(const d of world.docks.filter(p=>p.kind==='city_pier')){await page.evaluate(p=>Object.assign(__frontier.game.player,{x:p[0],z:p[1]}),data.world.town.respawn);await walk(d.id,nav.path(d.x,d.z));}
 }
 report.routeChecks=process.env.CITY_CAPTURE_ONLY?'not run (capture-only)':'passed';
 report.progression=await page.evaluate(()=>{const g=__frontier.game;return{level:g.ch.level,jobLevel:g.ch.jobLevel,exp:g.ch.exp,jobExp:g.ch.jobExp,jobNodes:g.ch.jobNodes,treeRevision:g.ch.treeRevision};});
 const stableCity=await page.evaluate(()=>{const root=__frontier.view.cityRoot,g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});return{geometries:g.size,materials:m.size,objects:root.children.length};});
 for(const[name,x,z,zoom,top]of[['01-fountain',62,30,1.4],['02-east-facing-house',28.8,16.24,1.3],['03-guild',...data.world.town.trainer,1.6],['04-forge',...data.world.town.workbench,1.5],['05-waterfront',87,77,1.7],['06-shipyard',126,102,2.1],['07-city-arpg',72,20,13],['08-city-top-down',72,20,13,true],['09-original-beach',...data.world.playerSpawn,1.4]])await shot(name,x,z,zoom,top);
 report.resourceProbe={before:stableCity,after:await page.evaluate(()=>{const root=__frontier.view.cityRoot,g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});return{geometries:g.size,materials:m.size,objects:root.children.length};})};assert.deepEqual(report.resourceProbe.before,report.resourceProbe.after);
 report.city=await page.evaluate(()=>__frontier.view.cityStats);assert.ok(report.city.waterContactSections>30,'native hulls and imported waterline geometry participate in the contact bake');
 if(process.env.HARBOR_VERIFY_NETWORK){
  await page.evaluate(()=>{document.querySelector('#hud').style.visibility='';__cityFreeze=false;__frontier.view.render=()=>{};});
  report.journalDevices=[];
  for(const[label,width,height]of[['desktop',1600,900],['ipad',1180,820],['phone',390,844],['phone-landscape',844,390]]){
   await page.setViewportSize({width,height});await verifyPassiveGestures(page,{context:ctx,engineName:engine.name(),capture:async name=>page.screenshot({path:out+label+'-'+name+'.png'})});report.journalDevices.push(label);
  }
 }
 // Verify the real creator has clear footing beside the new fountain.
 const previewCtx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const previewPage=await previewCtx.newPage();previewPage.setDefaultTimeout(90000);previewPage.on('pageerror',e=>report.errors.push(e.message));
 await previewPage.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__cityFreeze)cb(t);});});
 await previewPage.goto(base+'?quality=low&seed=9');await previewPage.waitForFunction(()=>__frontier?.modelsReady&&__frontier.menu);await enterFullscreenGate(previewPage);
 await previewPage.locator('[data-act="new"]').tap();await previewPage.waitForSelector('.create-panel');
 report.creationPreview=await previewPage.evaluate(()=>{__cityFreeze=true;const f=__frontier,p=f.view.previewHero.root.position;f.view.render(0,1,{});return{position:[p.x,p.z],free:f.world.isFree(p.x,p.z,.45),spawn:f.world.data.playerSpawn};});
 assert.ok(report.creationPreview.free);assert.deepEqual(report.creationPreview.position,data.world.town.respawn);assert.deepEqual(report.creationPreview.spawn,data.world.playerSpawn);
 await previewPage.screenshot({path:out+'10-character-creation.png',timeout:90000});await previewCtx.close();
 assert.deepEqual(report.errors,[]);report.status='passed';writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log('PASS actual city review; routes: '+report.routeChecks);
}finally{await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
