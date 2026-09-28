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
 for(const [name,x,z] of ((process.env.DREAMLOOP_NETWORK_ONLY||process.env.DREAMLOOP_SURF_ONLY)?[]:[['town',-208,17],['gate',-183,4],['meadow',-124,11],['grove',-143,27],['forest',-70,-56],['bridge',19.2,2.4],['stream',27,48],['wetland',70,39],['highlands',83,-93],['ruins',156,14],['coast',-40,176],['coast-east',131,175]])) {
  if(process.env.DREAMLOOP_STUDY_ONLY&&!['town','gate','meadow','grove'].includes(name))continue;
  await page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.snapCamera();f.view.zoom=1;},[x,z]);
  await page.waitForTimeout(800);assert.deepEqual(errors,[],'scene '+name+' has no shader/browser errors');await capture(name);
  report.scenes.push({name,...await page.evaluate(()=>{const f=window.__frontier;return {triangles:f.view.renderer.info.render.triangles,calls:f.view.renderer.info.render.calls,position:{x:f.game.player.x,z:f.game.player.z}};})});
  console.log('captured',name);
 }
 if(pass!=='before'&&!process.env.DREAMLOOP_NETWORK_ONLY&&!process.env.DREAMLOOP_STUDY_ONLY) {
  // A still image cannot demonstrate swash. Hold all game state/camera still and
  // capture the same shore at low water, maximum run-up and the next low water.
  await page.evaluate(()=>{
   const f=window.__frontier,x=-40,z=f.world.shoreZ(x);
   Object.assign(f.game.player,{x,z:z-.7,hp:f.game.player.maxHp,facing:Math.PI});
   f.view.snapCamera();f.view.camTarget.z=z+2;f.view.zoom=1.15;
   f.originalRender=f.view.render.bind(f.view);
   f.view.render=(dt,time,ui)=>f.originalRender(dt,f.surfCaptureTime??time,ui);
  });
  for(const [name,phase] of [['surf-low',0],['surf-runup',.5],['surf-return',1]]) {
   await page.evaluate(phase=>{const f=window.__frontier,period=f.world.data.sea.surf.period;f.surfCaptureTime=phase*period-f.game.player.x*.009*period/(Math.PI*2);},phase);
   await page.waitForTimeout(250);await capture(name);
  }
  await page.evaluate(()=>{const f=window.__frontier;f.view.render=f.originalRender;delete f.originalRender;delete f.surfCaptureTime;});

  // Exercise the actual touch joystick, then advance simulation with fixed steps.
  // Keeping the game paused prevents software-GL speed from changing travel distance.
  const crossing=await page.evaluate(()=>{
   const f=window.__frontier,z=45,pts=f.world.data.river.points;
   const i=pts.findIndex((p,i)=>i<pts.length-1&&z>=p[1]&&z<=pts[i+1][1]);
   const a=pts[i],b=pts[i+1],cx=a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);
   Object.assign(f.game.player,{x:cx-7,z,hp:9999});f.view.snapCamera();f.view.zoom=1;f.input.disabled=false;
   return {cx,z};
  });
  const cdp=engine===chromium?await ctx.newCDPSession(page):null;
  const joystick=async(type,x=100,y=650)=>{
   if(cdp) await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:71}]});
   else await page.evaluate(({type,x,y})=>window.__frontier.input.joyZone.dispatchEvent(new PointerEvent({touchStart:'pointerdown',touchMove:'pointermove',touchEnd:'pointerup'}[type],{bubbles:true,pointerId:71,pointerType:'touch',clientX:x,clientY:y})),{type,x,y});
  };
  report.streamCrossings=[];
  for(const direction of [1,-1]) {
   await joystick('touchStart');await joystick('touchMove',100+direction*65);
   const result=await page.evaluate(direction=>{
    const f=window.__frontier,start=f.game.player.x;
    f.input.update();const moveX=f.game.input.moveX;
    for(let i=0;i<72;i++){f.game.player.hp=9999;f.game.update(.04);}
    f.view.snapCamera();return {start,end:f.game.player.x,moveX};
   },direction);
   await joystick('touchEnd');
   assert.ok(direction*result.moveX>.9,'touch joystick drives movement');
   assert.ok(direction*(result.end-crossing.cx)>6,'touch walks out on the opposite riverbank');
   report.streamCrossings.push(result);await capture(direction>0?'stream-crossed-east':'stream-crossed-west');
  }
  await cdp?.detach();
  await page.evaluate(()=>{const f=window.__frontier;f.input.disabled=true;f.game.setMove(0,0);});
  console.log('surf phases captured; touch stream crossing passed');
 }
 if(pass!=='before'&&!process.env.DREAMLOOP_TERRAIN_ONLY) {
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
