// Focused full-scene movement probe; reports CPU and frame gaps separately from software GPU time.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';
const out=process.env.MOVEMENT_OUT||'/tmp/movement-profile';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const touch of (process.env.MOVEMENT_TOUCH==='1'?[true]:[false])){
 const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1024,height:700},hasTouch:touch,isMobile:touch,...((process.env.MOVEMENT_VIDEO||touch)?{recordVideo:{dir:out+'/video',size:touch?{width:844,height:390}:{width:1024,height:700}}}:{})});const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.goto((process.env.MOVEMENT_URL||'http://localhost:4192/')+'?fresh=1&quality=low&seed=5');await page.waitForFunction(()=>window.__frontier);await enterFullscreenGate(page);await page.waitForFunction(()=>__frontier.modelsReady&&__frontier.view.region.staticReady&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'));console.log('READY');
 await page.evaluate(()=>{
  const f=__frontier,g=f.game;window.probe={rows:[],frames:[],long:[],phase:'idle',input:[],clones:[]};const q=probe;
  new PerformanceObserver(l=>{for(const e of l.getEntries())q.long.push({phase:q.phase,start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:false});
  const wrap=(o,k,label=k)=>{const fn=o[k];if(!fn)return;o[k]=function(...args){const s=performance.now();try{return fn.apply(this,args);}finally{q.rows.push({phase:q.phase,key:label,start:s,ms:performance.now()-s});}};};
  for(const [o,names] of [[g,['useMovement','update','moveEntity']],[f.input,['update']],[f.hud,['update']],[f.view,['handleEvent','updateHero','updateCamera','updateStreaming','portrait','setHeroLook','render']],[f.view.vfx,['syncMovement','blink','update']],[f.questRoute,['update','advance','follow']],[f.view.renderer,['render']]])for(const k of names)wrap(o,k,(o===g?'game':o===f.input?'input':o===f.hud?'hud':o===f.questRoute?'route':o===f.view.vfx?'vfx':o===f.view.renderer?'gpuSubmit':'view')+'.'+k);
  const gl=f.view.renderer.getContext();for(const key of ['compileShader','linkProgram','bufferData','deleteProgram'])wrap(gl,key,'gl.'+key);
  let last=performance.now();function frame(t){q.frames.push({phase:q.phase,start:t,ms:t-last,x:g.player.x,z:g.player.z,dash:g.player.dash?.kind||null,geometries:f.view.renderer.info.memory.geometries,textures:f.view.renderer.info.memory.textures,programs:f.view.renderer.info.programs.length});last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  q.origin={x:g.player.x,z:g.player.z};g.ch.movementSkills=Object.keys(g.data.skills.movement);g.ch.stats.STR=20;g.ch.stats.INT=20;g.ch.stats.AGI=20;
  q.mod=Object.entries(g.data.mods.mods).find(([,m])=>m.effect?.movementDistanceMult)?.[0];g.ch.mods.push({uid:'probe-short-step',id:q.mod,level:1});g.refresh();
  q.renderer=f.view.renderer.getContext().getParameter(f.view.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
 });
 for(const route of (process.env.MOVEMENT_QUICK?[false]:[false,true]))for(const short of (process.env.MOVEMENT_SHORT_ONLY?[true]:process.env.MOVEMENT_QUICK?[false]:[false,true]))for(const skill of (process.env.MOVEMENT_SKILLS||'dash,roll,blink,leap').split(',')){
  await page.evaluate(({route,short,skill})=>{const f=__frontier,g=f.game;probe.phase='setup';f.questRoute.hide();Object.assign(g.player,probe.origin);g.player.dash=null;g.ch.movement=skill;g.ch.movementMods=short?['probe-short-step']:[];g.refresh();if(short&&(!g.move.mods[0]?.active||g.move.distance!==g.move.def.distance*.5))throw Error('Short Step inactive');(probe.cases||=[]).push({skill,short,route,distance:g.move.distance,charges:g.move.charges,duration:g.move.duration,recharge:g.move.recharge});g.player.movement.charges=g.move.charges;g.input.aimFromPointer=false;g.player.facing=Math.PI/2;f.view.snapCamera();if(route)f.questRoute.toggle();},{route,short,skill});
  if(route){await page.waitForFunction(()=>!__frontier.questRoute.work);if(!await page.evaluate(()=>__frontier.questRoute.enabled&&!!__frontier.questRoute.current))throw Error('route not installed');}
  for(let use=0;use<3;use++){
   const phase=`${skill}-${short?'short':'normal'}-route${+route}-${use}`;
   await page.evaluate(phase=>{probe.phase=phase;const g=__frontier.game;g.player.movement.charges=g.move.charges;g.player.facing=probe.origin.x<g.player.x? -Math.PI/2:Math.PI/2;},phase);
   if(touch)await page.locator('.sbtn.move').tap();else await page.keyboard.press('Space');
   await page.waitForFunction(()=>!__frontier.game.player.dash);await page.waitForTimeout(450);
   if(!await page.evaluate(phase=>probe.rows.some(r=>r.phase===phase&&r.key==='game.useMovement'),phase))throw Error('movement input not received: '+phase);
  }
  console.log('DONE',skill,short,route);writeFileSync(out+`/${touch?'touch':'desktop'}-partial.json`,JSON.stringify(await page.evaluate(()=>probe)));
 }
 if(process.env.MOVEMENT_RESOURCES){await page.waitForFunction(()=>[...__frontier.view.vfx.movementPools.values()].every(p=>p.live.size===0)&&__frontier.view.vfx.echoPool.live.size===0);}
 const report=await page.evaluate(()=>({...probe,resources:__frontier.view.renderer.info.memory,route:{enabled:__frontier.questRoute.enabled,builds:__frontier.questRoute.builds,maxSliceMs:__frontier.questRoute.maxSliceMs},pools:__frontier.view.vfx.movementPools?[...__frontier.view.vfx.movementPools].map(([key,p])=>({key,idle:p.idle.length,live:p.live.size})):null,echoPool:__frontier.view.vfx.echoPool?{idle:__frontier.view.vfx.echoPool.idle.length,live:__frontier.view.vfx.echoPool.live.size}:null}));report.errors=errors;writeFileSync(out+`/${touch?'touch':'desktop'}.json`,JSON.stringify(report));await page.screenshot({path:out+`/${touch?'touch':'desktop'}.png`});if(process.env.MOVEMENT_RESOURCES){report.cleanup=await page.evaluate(()=>{const f=__frontier,before={...f.view.renderer.info.memory};f.view.vfx.disposeMovement();f.view.render(0,f.game.time);return {before,after:{...f.view.renderer.info.memory},poolCount:f.view.vfx.movementPools.size,echoPool:f.view.vfx.echoPool,active:f.view.vfx.active.length};});writeFileSync(out+`/${touch?'touch':'desktop'}.json`,JSON.stringify(report));}
 assert.deepEqual(errors,[]);
 if(process.env.MOVEMENT_RESOURCES){assert.ok(report.pools.every(p=>p.idle<=3&&p.live===0));assert.equal(report.echoPool.live,0);assert.equal(report.cleanup.poolCount,0);assert.equal(report.cleanup.echoPool,null);assert.equal(report.cleanup.active,0);assert.equal(report.cleanup.before.geometries,report.cleanup.after.geometries,'borrowed source geometry survives pool disposal');}
 await context.close();
}}finally{await browser.close();}
