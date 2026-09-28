// Dreamloop: capture identical live game locations, exercise the network with real inputs,
// inspect PNGs, fix, rerun. UI/game screenshots are separate so a full-page compositor
// failure can fall back to the WebGL canvas without hiding render failures.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const pass=process.env.DREAMLOOP_PASS||'after';
const OUT=new URL(`./out/dreamloop-${pass}/`,import.meta.url).pathname;mkdirSync(OUT,{recursive:true});
const engine=process.env.BROWSER==='webkit'?webkit:chromium,PORT=4186;
const live=process.env.DREAMLOOP_URL;
const server=live?null:spawn('npx',['vite','preview','--port',String(PORT),'--strictPort'],{stdio:'ignore',detached:true});
const base=live||`http://localhost:${PORT}/`;
let browser;
try {
 for(let i=0;!live;i++) {try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('preview');await new Promise(r=>setTimeout(r,300));}
 browser=await engine.launch({args:engine===chromium?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await ctx.newPage(),errors=[],report={pass,browser:engine.name(),scenes:[]};
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'?fresh=1&seed=9&quality=high&dreamloop='+encodeURIComponent(process.env.GITHUB_SHA||pass));
 await page.waitForFunction(()=>window.__frontier?.game?.time>.3,null,{timeout:60000});
 await page.evaluate(()=>{const f=window.__frontier;f.paused=true;f.input.disabled=true;f.game.player.hp=9999;document.querySelector('.banner')?.remove();f.hud.el.zone.style.opacity=0;});
 const capture=async name=>{
  try{await page.screenshot({path:OUT+name+'.png',timeout:45000});}
  catch(e){console.log('Full-page capture failed; rendering canvas fallback',name);await page.locator('canvas').first().screenshot({path:OUT+name+'-canvas.png',timeout:60000});}
 };
 for(const [name,x,z] of (process.env.DREAMLOOP_NETWORK_ONLY?[]:[['gate',-102,4],['meadow',-78,7],['forest',-44,-35],['bridge',2,3],['wetland',38,34],['highlands',52,-58],['ruins',98,9]])) {
  await page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.snapCamera();f.view.zoom=1;},[x,z]);
  await page.waitForTimeout(800);await capture(name);
  report.scenes.push({name,...await page.evaluate(()=>{const f=window.__frontier;return {triangles:f.view.renderer.info.render.triangles,calls:f.view.renderer.info.render.calls,position:{x:f.game.player.x,z:f.game.player.z}};})});
  console.log('captured',name);
 }
 if(pass!=='before') {
  for(const [device,w,h] of [['desktop',1600,900],['ipad',1180,820],['phone',390,844],['phone-landscape',844,390]]){
   await page.setViewportSize({width:w,height:h});
   await page.evaluate(()=>{const f=window.__frontier;f.panels.close();Object.assign(f.game.player,{x:-120,z:3});f.game.ch.jobNodes=['origin'];f.game.ch.jobLevel=20;f.game.ch.jobPoints=19;f.game.ch.gold=1000;f.panels.jobCamera=null;f.panels.sel.node=null;f.panels.open('job');});
   assert.equal(await page.locator('.network-node').count(),61);
   const tap=async s=>{
    const target=page.locator(s);
    // Graph coordinates are transformed, so DOM scrolling cannot reveal an off-screen
    // node. Pan the actual viewport as a player does, especially in phone landscape.
    if(s.startsWith('[data-act="node"]')){
     for(let attempt=0;attempt<4;attempt++){
      const b=await target.boundingBox(),v=await page.locator('.network-viewport').boundingBox();
      const x=b.x+b.width/2,y=b.y+b.height/2,cx=v.x+v.width/2,cy=v.y+v.height/2;
      if(x>v.x+10&&x<v.x+v.width-10&&y>v.y+10&&y<v.y+v.height-10)break;
      await page.mouse.move(cx,cy);await page.mouse.down();
      await page.mouse.move(cx+Math.max(-v.width*.4,Math.min(v.width*.4,cx-x)),cy+Math.max(-v.height*.4,Math.min(v.height*.4,cy-y)),{steps:5});
      await page.mouse.up();
     }
    }
    await target.tap();
   };
   await tap('[data-act="node"][data-id="v1"]');
   assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobNodes.length),1,'inspect does not spend');
   assert.ok(await page.locator('[data-act="take-node"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'selected-node action is visible without scrolling');
   await tap('[data-act="take-node"]');
   assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),18);
   await tap('[data-job-focus="vj"]');
   await tap('[data-act="node"][data-id="v2"]');await tap('[data-act="take-node"]');
   await tap('[data-act="node"][data-id="vj"]');await tap('[data-act="take-node"]');
   assert.ok(await page.evaluate(()=>window.__frontier.game.ch.jobNodes.includes('vj')));
   await tap('[data-job-focus="aj"]');await tap('[data-act="node"][data-id="aj"]');
   assert.equal(await page.locator('[data-act="take-node"]').isDisabled(),true,'cannot choose a second Job');
   await tap('[data-job-focus="vj"]');await tap('[data-act="node"][data-id="v9"]');
   assert.ok(await page.locator('.network-link.preview').count()>0,'route preview');
   await tap('[data-job-next]');
   assert.ok(await page.locator('[data-act="take-node"]').isEnabled(),'next node on route can be taken');
   // Panning/zooming never spends points, including an interrupted touch gesture.
   const before=await page.evaluate(()=>JSON.stringify(window.__frontier.game.ch.jobNodes));
   await page.locator('.network-viewport').evaluate(el=>{
    el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,clientX:100,clientY:150}));
    el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:91}));
   });
   await tap('[data-job-zoom="-1"]');await tap('[data-job-zoom="1"]');
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__frontier.game.ch.jobNodes)),before);
   // A real drag uses the same pointer path as touch; it must not activate the node under it.
   await page.locator('.network-viewport').scrollIntoViewIfNeeded();
   const box=await page.locator('.network-viewport').boundingBox();
   const cameraBefore=await page.evaluate(()=>window.__frontier.panels.jobCamera.x);
   const selectedBefore=await page.evaluate(()=>window.__frontier.panels.sel.node);
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);await page.mouse.down();
   await page.mouse.move(box.x+box.width*.5+55,box.y+box.height*.45+15,{steps:6});await page.mouse.up();
   assert.ok(Math.abs(await page.evaluate(()=>window.__frontier.panels.jobCamera.x)-cameraBefore)>20,'drag pans graph');
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__frontier.game.ch.jobNodes)),before,'drag never spends');
   assert.equal(await page.evaluate(()=>window.__frontier.panels.sel.node),selectedBefore,'drag never selects a node');
   if(engine===chromium&&device==='ipad'){
    const cdp=await ctx.newCDPSession(page),cx=box.x+box.width/2,cy=box.y+box.height/2;
    const pinchBefore=await page.evaluate(()=>window.__frontier.panels.jobCamera.zoom);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-35,y:cy,id:1},{x:cx+35,y:cy,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-62,y:cy,id:1},{x:cx+62,y:cy,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(await page.evaluate(()=>window.__frontier.panels.jobCamera.zoom)>pinchBefore,'two-finger pinch zooms');
    assert.equal(await page.evaluate(()=>window.__frontier.panels.sel.node),selectedBefore,'pinch never selects');
    await cdp.detach();
   }
   await page.locator('.pbody').evaluate(el=>el.scrollTop=0);
   await capture(device+'-job-detail');
   await tap('[data-job-fit]');await capture(device+'-job-overview');
   await tap('.panel-close');
   assert.equal(await page.evaluate(()=>window.__frontier.panels.isOpen),false);
   console.log('network workflow passed',device);
  }
 }
 assert.deepEqual(errors,[],'no browser/shader errors');report.errors=errors;
 writeFileSync(OUT+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
