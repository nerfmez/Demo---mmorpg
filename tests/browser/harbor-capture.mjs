// Current local harbor art review: actual rendered world, starter monsters, surf
// phases, and a real touch joystick walk from the beach to the town checkpoint.
import assert from 'node:assert/strict';
import { verifyPassiveGestures } from './passive-checks.mjs';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const OUT=new URL('./out/harbor/',import.meta.url).pathname;mkdirSync(OUT,{recursive:true});
const PORT=4180,base=process.env.DREAMLOOP_URL||`http://localhost:${PORT}/`;
const server=process.env.DREAMLOOP_URL?null:spawn('npx',['vite','preview','--port',String(PORT),'--strictPort'],{stdio:'ignore',detached:true});
let browser;
const report={browser:engine.name(),scenes:[],errors:[]};
try {
  for(let i=0;server;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('server');await new Promise(r=>setTimeout(r,300));}
  browser=await engine.launch({args:engine===chromium?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`);});
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))report.errors.push(m.text());});
  await page.goto(base+'?fresh=1&seed=9&quality=medium');
  await page.waitForFunction(()=>window.__frontier?.game?.time>.3&&window.__frontier.modelsReady,null,{timeout:60000});
  await page.evaluate(()=>{const f=window.__frontier;f.paused=true;f.input.disabled=true;f.hud.el.zone.style.opacity=0;document.querySelector('.banner')?.remove();});
  const capture=async(name)=>{
    await page.evaluate(()=>{const f=window.__frontier;f.hud.update(.6,f.panels);});
    await page.waitForTimeout(500);
    await page.screenshot({path:OUT+name+'.png',timeout:90000});
    report.scenes.push({name,...await page.evaluate(()=>{const f=window.__frontier;return {position:[f.game.player.x,f.game.player.z],triangles:f.view.renderer.info.render.triangles,calls:f.view.renderer.info.render.calls,geometries:f.view.renderer.info.memory.geometries};})});
    console.log('captured',name);
  };
  const stage=async(x,z,zoom=1)=>page.evaluate(([x,z,zoom])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.zoom=zoom;f.view.snapCamera();},[x,z,zoom]);
  await stage(...await page.evaluate(()=>window.__frontier.game.data.world.playerSpawn));
  await capture('01-arrival-beach-ipad');
  // Native Chromium touch reaches the production joystick handler; WebKit uses
  // its pointer handler, matching the existing engine test fallback.
  await page.evaluate(()=>{window.__frontier.input.disabled=false;});
  const cdp=engine===chromium?await ctx.newCDPSession(page):null;
  const joy=async(type,x=100,y=650)=>{
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:71}]});
    else await page.evaluate(({type,x,y})=>window.__frontier.input.joyZone.dispatchEvent(new PointerEvent({touchStart:'pointerdown',touchMove:'pointermove',touchEnd:'pointerup'}[type],{bubbles:true,pointerId:71,pointerType:'touch',clientX:x,clientY:y})),{type,x,y});
  };
  await joy('touchStart');await joy('touchMove',165,650);
  const moveX=await page.evaluate(()=>{const f=window.__frontier;f.input.update();return f.game.input.moveX;});
  assert.ok(moveX>.9,'native touch joystick drives walking');await joy('touchEnd');await cdp?.detach();
  const walk=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game;f.input.disabled=true;
    let ticks=0;
    for(const [x,z] of g.data.world.roads.find(r=>r.id==='arrival').points.slice(1)) {
      for(let i=0;i<3000&&Math.hypot(x-g.player.x,z-g.player.z)>.25;i++) {
        g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);ticks++;
        if(!g.isSafe(g.player.x,g.player.z)||g.player.dead)throw Error('arrival route unsafe');
      }
      if(Math.hypot(x-g.player.x,z-g.player.z)>.4)throw Error('arrival route blocked');
    }
    g.setMove(0,0);
    const wp=g.world.waypoints.find(w=>w.id==='town');
    for(let i=0;i<300&&Math.hypot(wp.x+1.5-g.player.x,wp.z-g.player.z)>.3;i++){g.setMove(wp.x+1.5-g.player.x,wp.z-g.player.z);g.update(1/60);}
    g.setMove(0,0);for(let i=0;i<30;i++)g.update(1/60);
    f.view.snapCamera();return {seconds:ticks/60,townUnlocked:g.isWaypointUnlocked('town'),quest:g.ch.progress.quests.h_arrival?.status};
  });
  assert.ok(walk.townUnlocked&&walk.quest==='done','walk reaches town and advances actual onboarding');report.walk=walk;
  await capture('02-town-arrival');
  for(const [name,x,z,zoom] of [['03-harbor-square',62,27,1.35],['04-working-pier',62,76,1.25],['05-lighthouse',126,44,1.35],['06-inland-fields',60,-32,1.25]]){await stage(x,z,zoom);await capture(name);}
  // All four coast creatures have independent live rigs and readable wind-up poses.
  await stage(-60,55,.9);
  await page.addStyleTag({content:'#hud {visibility:hidden}'});
  await page.evaluate(()=>{
    const f=window.__frontier;
    ['reef_crab','salt_slime','shore_gull','hermit_crab'].forEach((type,i)=>{
      const m=f.game.monsters.find(m=>m.type===type);
      Object.assign(m,{x:-66+i*4,z:51,facing:0,state:'windup',stateT:.6,aggro:true});
      m.windup={name:m.def.primaryAttack,total:m.def.attacks[m.def.primaryAttack].windup,angle:0};
    });
    f.view.render(.016,f.game.time,{});
  });
  await capture('07-coastal-monsters');
  await stage(62,42,3);
  // Review-only wide camera: move fog beyond the overview; gameplay retains its normal fog.
  await page.evaluate(()=>{const f=window.__frontier;f.view.scene.fog.near=100;f.view.scene.fog.far=180;});
  await capture('13-harbor-overview');
  await page.evaluate(()=>{const f=window.__frontier;f.view.scene.fog.near=44;f.view.scene.fog.far=84;});
  await page.addStyleTag({content:'#hud {visibility:visible}'});
  await stage(62,27,1);
  await page.evaluate(()=>{const f=window.__frontier;f.game.ch.progress.zones=f.world.zones.map(z=>z.id);f.panels.open('map');});
  await capture('08-local-map');await page.evaluate(()=>window.__frontier.panels.close());
  await page.evaluate(()=>{
    const f=window.__frontier,x=-40,z=f.world.shoreZ(x);Object.assign(f.game.player,{x,z:z-5});f.view.snapCamera();f.view.zoom=1.15;
    f.originalRender=f.view.render.bind(f.view);f.view.render=(dt,time,ui)=>f.originalRender(dt,f.surfCaptureTime??time,ui);
  });
  for(const [name,phase] of [['09-surf-low',0],['10-surf-runup',.5],['11-surf-return',1]]){
    await page.evaluate(phase=>{const f=window.__frontier,period=f.world.data.sea.surf.period;f.surfCaptureTime=phase*period-f.game.player.x*.009*period/(Math.PI*2);},phase);await capture(name);
  }
  await page.setViewportSize({width:1600,height:900});
  await stage(...await page.evaluate(()=>window.__frontier.game.data.world.playerSpawn));await capture('12-arrival-desktop');
  if(process.env.HARBOR_VERIFY_NETWORK) for(const [device,width,height] of [['desktop',1600,900],['ipad',1180,820],['phone',390,844],['phone-landscape',844,390]]) {
    await page.setViewportSize({width,height});
    await verifyPassiveGestures(page,{context:ctx,engineName:engine.name(),capture:name=>capture(device+'-'+name)});
  }
  assert.deepEqual(report.errors,[],'no browser or shader errors');report.technicalStatus='passed';report.artStatus='requires owner review';
  writeFileSync(OUT+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
