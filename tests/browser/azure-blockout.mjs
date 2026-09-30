// Focused owner review: U-bay overview and original gameplay camera only.
// No stress/leak/full-game capture. Hardware iPad FPS remains unmeasured.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const styleReview=!!JSON.parse(readFileSync('data/world.json','utf8')).town.styleSlice;
const out=`tests/browser/out/azure-${styleReview?'style':'blockout'}-${engine.name()}/`;mkdirSync(out,{recursive:true});
const port=4191,base=`http://localhost:${port}/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
const report={engine:engine.name(),errors:[],hardwareIPadFPS:'not measured',captures:[]};
let browser;
try {
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('preview server');await new Promise(r=>setTimeout(r,250));}
  browser=await engine.launch({...(process.env.CHROMIUM_EXECUTABLE&&engine===chromium?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__azureFreeze)cb(t)});});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))report.errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`)});
  await page.goto(base+'?fresh=1&seed=9&quality=medium');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:60000});
  await page.evaluate(()=>{window.__azureFreeze=true;const f=window.__frontier;f.paused=true;f.input.reset();f.input.disabled=false;});
  // Real touch event reaches the existing production joystick handler.
  if(engine===chromium){
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:680,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:680,id:1}]});
    report.touch=await page.evaluate(()=>{const f=window.__frontier;f.input.update();return f.game.input.moveX;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  } else {
    report.touch=await page.evaluate(()=>{const f=window.__frontier;for(const [type,x] of [['pointerdown',90],['pointermove',150]])f.input.joyZone.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch',clientX:x,clientY:680}));f.input.update();const x=f.game.input.moveX;f.input.joyZone.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'touch'}));return x;});
  }
  assert.ok(report.touch>.8,'touch joystick drives movement');
  report.walk=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game;f.input.disabled=true;
    for(const [x,z] of g.data.world.roads.find(r=>r.id==='arrival').points.slice(1)){
      let i=0;for(;i<3000&&Math.hypot(x-g.player.x,z-g.player.z)>.25;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);if(!g.isSafe(g.player.x,g.player.z)||g.player.dead)throw Error('unsafe arrival');}
      if(i===3000)throw Error('blocked arrival');
    }
    const wp=g.world.waypoints.find(w=>w.id==='town');
    for(let i=0;i<500&&Math.hypot(wp.x+1.5-g.player.x,wp.z-g.player.z)>.25;i++){g.setMove(wp.x+1.5-g.player.x,wp.z-g.player.z);g.update(1/60);}
    g.setMove(0,0);for(let i=0;i<30;i++)g.update(1/60);
    return {townUnlocked:g.isWaypointUnlocked('town'),quest:g.ch.progress.quests.h_arrival?.status};
  });
  assert.ok(report.walk.townUnlocked&&report.walk.quest==='done');
  if(styleReview){report.marketPierWalk=await page.evaluate(()=>{const f=window.__frontier,g=f.game;Object.assign(g.player,g.freeSpotNear(0,-42));for(const [x,z] of [[0,-31],[-25,-31],[-25,-22],[-25,-9]]){let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.2;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}if(i===1500)throw Error('market-to-pier route blocked');}g.setMove(0,0);return {onPier:!!g.world.dockAt(g.player.x,g.player.z),alive:!g.player.dead};});assert.ok(report.marketPierWalk.onPier&&report.marketPierWalk.alive);}
  const shot=async(name)=>{await page.screenshot({path:out+name+'.png',timeout:60000});report.captures.push(name);console.log('captured',name);};
  const stage=async(x,z)=>page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.zoom=1;f.view.camera.up.set(0,1,0);f.view.snapCamera();f.view.render(.016,f.game.time,{});f.hud.update(.6,f.panels);},[x,z]);
  await page.evaluate(()=>{const f=window.__frontier;f.game.time+=8;f.game.drainEvents();document.querySelector('.banner')?.remove();});
  await stage(styleReview?-42:-37,styleReview?-47.8:-43);await shot('02-market-gameplay');
  if(styleReview){await stage(-25,-51.5);await shot('05-craft-gameplay');await stage(45,-47.8);await shot('06-inn-gameplay');}
  await stage(-25,-20);await shot('04-market-pier-gameplay');
  await stage(114,76);await shot('03-rotated-slipway-gameplay');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{
    const f=window.__frontier,v=f.view;
    for(const element of document.body.children) if(element.tagName!=='CANVAS')element.style.visibility='hidden';
    v.scene.fog.near=600;v.scene.fog.far=900;
    v.camera.far=900;v.camera.fov=53;v.camera.up.set(0,0,-1);v.camera.position.set(0,285,8);v.camera.lookAt(0,0,8);v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();
    v.renderer.render(v.scene,v.camera);
    // Capture the WebGL pixels synchronously before browser compositing can
    // clear a non-preserved drawing buffer; labels remain a review-only overlay.
    const pixels=document.createElement('img');pixels.src=v.renderer.domElement.toDataURL('image/png');
    pixels.style.cssText='position:fixed;inset:0;width:100%;height:100%;visibility:visible';document.body.append(pixels);
    v.canvasRect=v.renderer.domElement.getBoundingClientRect();
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;pointer-events:none;visibility:visible';document.body.append(overlay);
    for(const [text,x,z] of [['บ้าน / ซอยวน',-110,-20],['ตลาด · คราฟต์ · วาร์ป',0,-49],['ทางออกสู่พื้นที่ล่า',0,-105],['โกดัง / ลานสินค้า',115,-26],['อู่เรือ / ทางลาด',128,76],['ประภาคาร / กันคลื่น',-125,82],['ปากอ่าวเปิดทางใต้',0,106]]){
      const p=v.project(x,2,z);const label=document.createElement('div');label.textContent=text;label.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);font:18px Mitr,sans-serif;padding:5px 10px;background:#163b41de;color:white;border-radius:4px`;overlay.append(label);
    }
  });
  await shot('01-u-bay-overview');
  assert.deepEqual(report.errors,[],'no runtime/asset/shader errors');
  report.passed=true;writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {if(!report.passed){writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}await browser?.close();try{process.kill(-server.pid)}catch{}}
