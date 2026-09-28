// Dreamloop: capture identical live game locations, exercise the network with real inputs,
// inspect PNGs, fix, rerun. UI/game screenshots are separate so a full-page compositor
// failure can fall back to the WebGL canvas without hiding render failures.
import assert from 'node:assert/strict';
import {verifyPassiveGestures} from './passive-checks.mjs';
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
 const page=await ctx.newPage(),errors=[],report={pass,browser:engine.name(),technicalStatus:"pending",artStatus:"requires visual review",scenes:[]};
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+'?fresh=1&seed=9&quality=high'+(process.env.DREAMLOOP_ART?'&art='+encodeURIComponent(process.env.DREAMLOOP_ART):'')+'&dreamloop='+encodeURIComponent(process.env.GITHUB_SHA||pass));
 await page.waitForFunction(()=>window.__frontier?.game?.time>.3,null,{timeout:60000});
 await page.waitForFunction(()=>window.__frontier.modelsReady,null,{timeout:60000});
 await page.evaluate(()=>{const f=window.__frontier;f.paused=true;f.input.disabled=true;f.game.player.hp=9999;document.querySelector('.banner')?.remove();f.hud.el.zone.style.opacity=0;});
 if(process.env.DREAMLOOP_ART_REVIEW)await page.evaluate(()=>{
   const f=window.__frontier,render=f.view.render.bind(f.view);
   f.view.render=(dt,t,ui)=>render(0,12,ui);
   // A controlled still-life using the same in-game models in both comparison passes.
   const m=f.game.monsters.find(m=>m.type==='thornboar')||f.game.monsters.find(m=>!m.boss);
   Object.assign(m,{x:-184.5,z:25.5,homeX:-184.5,homeZ:25.5,facing:-1.4,state:'idle',stateT:0,aggro:false});
   f.game.player.facing=2.8;f.game.player.hp=f.game.player.maxHp;
 });
 const capture=async name=>{
  try{await page.screenshot({path:OUT+name+'.png',timeout:45000});}
  catch(e){console.log('Full-page capture failed; rendering canvas fallback',name);await page.locator('canvas').first().screenshot({path:OUT+name+'-canvas.png',timeout:60000});}
 };
 for(const [name,x,z] of ((process.env.DREAMLOOP_NETWORK_ONLY||process.env.DREAMLOOP_SURF_ONLY||process.env.DREAMLOOP_STUDY_DETAIL==='only')?[]:process.env.DREAMLOOP_ART_REVIEW?[['study-overview',-189,23],['study-grove',-172,14]]:[['town',-208,17],['gate',-183,4],['meadow',-124,11],['grove',-143,27],['forest',-70,-56],['bridge',19.2,2.4],['stream',27,48],['wetland',70,39],['highlands',83,-93],['ruins',156,14],['coast',-40,176],['coast-east',131,175]])) {
  if(process.env.DREAMLOOP_STUDY_ONLY&&!['town','gate','meadow','grove','study-overview','study-grove'].includes(name))continue;
  await page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.snapCamera();f.view.zoom=1;},[x,z]);
  await page.waitForTimeout(800);assert.deepEqual(errors,[],'scene '+name+' has no shader/browser errors');await capture(name);
  report.scenes.push({name,...await page.evaluate(()=>{const f=window.__frontier;return {triangles:f.view.renderer.info.render.triangles,calls:f.view.renderer.info.render.calls,position:{x:f.game.player.x,z:f.game.player.z}};})});
  console.log('captured',name);
 }
 if(process.env.DREAMLOOP_STUDY_DETAIL) {
  await page.evaluate(()=>{
   const f=window.__frontier;
   const review=['anime','baseline'].includes(new URLSearchParams(location.search).get('art'));
   if(review){
    Object.assign(f.game.player,{x:-187.5,z:21.5});f.view.snapCamera();f.view.zoom=.68;return;
   }
   const anime=false;
   const shrub=f.world.decor.bushes.filter(b=>b.x>(anime?-180:-170)&&b.x<(anime?-165:-110)&&b.z>5&&b.z<(anime?22:45))
    .sort((a,b)=>Math.hypot(a.x+(anime?173:143),a.z-(anime?18:27))-Math.hypot(b.x+(anime?173:143),b.z-(anime?18:27)))[0];
   if(!shrub)throw Error('study shrub not found');
   Object.assign(f.game.player,f.game.freeSpotNear(shrub.x+2.0,shrub.z+1.3));
   f.view.snapCamera();f.view.zoom=.55;
  });
  await page.waitForTimeout(800);assert.deepEqual(errors,[]);await capture('shrub-detail');
  if(process.env.DREAMLOOP_ART_ORBIT) {
   await page.evaluate(()=>{
    const v=window.__frontier.view,update=v.updateCamera.bind(v);
    v.updateCamera=(dt,focus)=>{update(dt,focus);const dx=v.camera.position.x-v.camTarget.x,dz=v.camera.position.z-v.camTarget.z;
     v.camera.position.x=v.camTarget.x+dz;v.camera.position.z=v.camTarget.z-dx;
     v.camera.lookAt(v.camTarget.x,v.camTarget.y+.8,v.camTarget.z);};
   });
   await page.waitForTimeout(800);assert.deepEqual(errors,[]);await capture('foliage-side');
  }

 }
 if(process.env.DREAMLOOP_TRUNK_REVIEW) {
  await page.evaluate(()=>{
   const f=window.__frontier,v=f.view,x=-185.5,z=18.5,y=f.world.groundY(x,z);
   v.updateCamera=()=>{v.camTarget.set(x,y+1.8,z);v.camera.position.set(x+5,y+5.4,z+7);v.camera.lookAt(v.camTarget);};
  });
  await page.waitForTimeout(800);assert.deepEqual(errors,[]);
  await page.locator('canvas').first().screenshot({path:OUT+'trunk-detail.png',timeout:60000});
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
   await verifyPassiveGestures(page,{context:ctx,engineName:engine.name(),capture:name=>capture(device+'-'+name)});
   console.log('network workflow passed',device);
  }
 }
 assert.deepEqual(errors,[],'no browser/shader errors');report.errors=errors;
 report.technicalStatus='passed';
 writeFileSync(OUT+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
