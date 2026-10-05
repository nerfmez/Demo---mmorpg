// Focused real-game proof: production hero/bow, camera, monsters, input and rules.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const cases=[['heavy_draw',1],['arrow_rain',2],['pinning_arrow',3]].filter(([id])=>!process.env.SKILL||process.env.SKILL.split(',').includes(id));
const out = new URL(`./out/bow-skills-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, {recursive:true});
const port=4232, url=`http://localhost:${port}/?fresh=1&seed=5&quality=low&stream=0`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;
try {
  for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('preview startup');await new Promise(r=>setTimeout(r,250));}
  browser=await engine.launch(engine===chromium?{channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier?.game?.time>.3&&document.getElementById('loading').classList.contains('done')).catch(async error=>{console.log('load diagnostic',await page.evaluate(()=>({models:window.__frontier?.modelsReady,time:window.__frontier?.game?.time,loading:document.getElementById('loading')?.className})),errors);throw error;});
  console.log('real game ready',engine.name());
  await page.evaluate(()=>{
    const f=window.__frontier,g=f.game,ch=g.ch;
    f.paused=true;f.input.reset();f.input.disabled=true;g.spawnPoints=[];document.querySelector('.banner')?.remove();
    for(const k in ch.stats)ch.stats[k]=12;
    const bow={uid:ch.nextUid++,base:'old_bow',itemLevel:1,grade:'C',upgrade:0,options:[]};ch.gear.push(bow);if(!f.equip(ch,g.data,bow.uid).ok)throw Error('bow fixture equip');
    ch.arrows.stock={feather_arrow:150};
    for(const id of ['heavy_draw','arrow_rain','pinning_arrow'])ch.skills[id]=1;
    ch.slots=[{skill:'hunter_shot',mods:[]},{skill:'heavy_draw',mods:[]},{skill:'arrow_rain',mods:[]},{skill:'pinning_arrow',mods:[]}];g.refresh(true);
    const m=g.monsters.find(m=>m.type==='reef_crab')||g.monsters[0];if(!m)throw Error('no live monster');
    let spot=null;
    for(let r=0;r<10&&!spot;r++)for(let a=0;a<12&&!spot;a++){const x=m.x+Math.sin(a)*r,z=m.z+Math.cos(a)*r;
      if(!g.isSafe(x,z)&&g.world.isFree(x,z,m.r)&&g.world.isFree(x-6,z,g.player.r)&&g.world.isFree(x-3,z,.5))spot={x,z};}
    if(!spot)throw Error('no clear local combat point');
    Object.assign(m,{x:spot.x,z:spot.z,homeX:spot.x,homeZ:spot.z,hp:10000,maxHp:10000,aggro:false,state:'idle',wanderT:99,wanderTo:null});
    for(const k in m.cd)m.cd[k]=99;g.monsters=[m];f.bowTarget=m;f.bowOrigin={x:spot.x-4,z:spot.z};
    Object.assign(g.player,{...f.bowOrigin,facing:Math.PI/2});f.view.zoom=1;f.view.snapCamera();
    f.bowDraw=f.view.render.bind(f.view);f.view.render=()=>{};
    f.bowStep=dt=>{for(let t=0;t<dt-1e-8;t+=1/60){g.update(1/60);for(const e of g.drainEvents()){f.bowEvents.push(e);f.view.handleEvent(e);}}f.bowDraw(dt,g.time,{});f.view.renderer.getContext().finish();};
    f.bowEvents=[];f.bowStep(1/60);
  });
  await page.waitForTimeout(500);
  const results={};
  for(const [id,slot] of cases){
    const dir=out+id+'/';mkdirSync(dir,{recursive:true});
    await page.evaluate(slot=>{
      const f=window.__frontier,g=f.game,m=f.bowTarget;
      g.projectiles=[];g.areas=[];g.pending=[];g.player.cast=null;g.player.queued=null;g.player.cooldowns.fill(0);g.player.mp=g.player.maxMp;
      Object.assign(g.player,{...f.bowOrigin,facing:Math.PI/2,targetId:m.id});
      Object.assign(m,{x:f.bowOrigin.x+4,z:f.bowOrigin.z,hp:10000,dead:false,state:'idle',stateT:0,aggro:false,staggerT:0,statuses:{},wanderT:99,wanderTo:null});
      for(const k in m.cd)m.cd[k]=99;
      f.bowEvents=[];g.setAimPoint(m.x,m.z);const before=g.ch.arrows.stock.feather_arrow;assertCast(g.castSlot(slot));
      f.bowAmmo=before-g.ch.arrows.stock.feather_arrow;
      function assertCast(ok){if(!ok)throw Error('cast failed');}
      f.bowStep(1/60);
    },slot);
    for(let frame=0;frame<30;frame++){
      if(frame)await page.evaluate(()=>{window.__frontier.bowStep(1/12);});
      if(process.env.CAPTURE_FRAMES!=='0')await page.screenshot({path:dir+String(frame).padStart(3,'0')+'.png'});
    }
    const state=await page.evaluate(()=>{const f=window.__frontier;return {ammo:f.bowAmmo,hits:f.bowEvents.filter(e=>e.type==='hit').length,roots:f.bowEvents.filter(e=>e.type==='root').length,bursts:f.bowEvents.filter(e=>e.type==='burst').length,rootGone:!f.bowTarget.statuses.root,weapon:f.game.derived.weaponType,geometry:f.view.renderer.info.memory.geometries};});
    assert.equal(state.weapon,'bow');assert.equal(state.ammo,id==='arrow_rain'?3:1);assert.equal(state.hits,id==='arrow_rain'?3:1);if(id==='pinning_arrow'){assert.equal(state.roots,1);assert(state.rootGone);}results[id]=state;
    if(engine===chromium&&process.env.CAPTURE_VIDEO!=='0'&&process.env.CAPTURE_FRAMES!=='0')execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','12','-i',dir+'%03d.png','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',out+id+'.mp4']);
    console.log(id,JSON.stringify(state));
  }
  // All three captures warm shared arrow/contact geometry before the ownership probe.
  const warmGeometry=await page.evaluate(()=>window.__frontier.view.renderer.info.memory.geometries);
  for(const [id,slot] of cases){
    const cleanup=await page.evaluate(slot=>{
      const f=window.__frontier,g=f.game,m=f.bowTarget;
      g.player.cast=null;g.player.cooldowns.fill(0);g.player.mp=g.player.maxMp;g.projectiles=[];g.areas=[];g.pending=[];
      Object.assign(g.player,{...f.bowOrigin,targetId:m.id});Object.assign(m,{x:f.bowOrigin.x+4,z:f.bowOrigin.z,hp:10000,statuses:{}});
      g.setAimPoint(m.x,m.z);if(!g.castSlot(slot))throw Error('repeat cast failed');
      let sawRoot=false, rootFlat=true;
      for(let i=0;i<30;i++){f.bowStep(1/12);sawRoot ||= f.view.vfx.rootVisuals.size>0;
        for(const root of f.view.vfx.rootVisuals.values()){
          const pos=root.geometry.attributes.position;
          for(let n=0;n<pos.count;n++)rootFlat &&= Math.abs(pos.getY(n))<1e-6;
          rootFlat &&= root.rotation.x===0;
        }}
      return {geometry:f.view.renderer.info.memory.geometries,areas:f.view.vfx.areas.size,roots:f.view.vfx.rootVisuals.size,projectiles:f.view.vfx.projectiles.size,sawRoot,rootFlat};
    },slot);
    assert.equal(cleanup.areas,0);assert.equal(cleanup.roots,0);assert.equal(cleanup.projectiles,0);
    assert.equal(cleanup.geometry,warmGeometry,'geometries stabilize across warm/repeated casts');
    if(id==='pinning_arrow'){assert(cleanup.sawRoot,'real root cue appears before expiry');assert(cleanup.rootFlat,'root cue lies on the ground plane');}
    results[id].repeated=cleanup;
  }
  // Real touch gestures through product controls: area drag + projectile drag, no hold-charge path.
  await page.evaluate(()=>{const f=window.__frontier;f.input.disabled=false;f.game.player.cooldowns.fill(0);f.game.player.mp=f.game.player.maxMp;f.game.player.cast=null;f.game.input.manualAim=false;f.game.input.aimFromPointer=false;});
  const drag=async slot=>{
    const b=page.locator('.sbtn').nth(slot),box=await b.boundingBox();assert(box);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await b.dispatchEvent('pointerdown',{pointerId:77,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,buttons:1});
    await b.dispatchEvent('pointermove',{pointerId:77,pointerType:'touch',isPrimary:true,clientX:x-65,clientY:y-55,buttons:1});
    await b.dispatchEvent('pointerup',{pointerId:77,pointerType:'touch',isPrimary:true,clientX:x-65,clientY:y-55,buttons:0});
    return page.evaluate(()=>{const g=window.__frontier.game;return {skill:g.player.cast?.skill.id,aim:g.player.cast?.aim,player:{x:g.player.x,z:g.player.z}};});
  };
  const rain=await drag(2);assert.equal(rain.skill,'arrow_rain');assert(Math.hypot(rain.aim.x-rain.player.x,rain.aim.z-rain.player.z)>0);
  await page.evaluate(()=>{const g=window.__frontier.game;g.player.cast=null;g.player.cooldowns.fill(0);});
  const heavy=await drag(1);assert.equal(heavy.skill,'heavy_draw');
  results.touch={rain,heavy};writeFileSync(out+'results.json',JSON.stringify(results,null,2));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('real-game bow proof and touch aim passed',out);
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
