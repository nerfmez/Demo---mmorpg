// Renderer-only review: identical existing assets, fixed time/seed/camera and never-saved fixture.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const baseline=process.env.BASELINE==='1',name=process.env.BROWSER==='webkit'?'webkit':'chromium';
const out=process.env.RENDER_OUT||`tests/browser/out/render-light-${name}${baseline?'-before':''}/`;mkdirSync(out,{recursive:true});
let server,browser;const report={browser:name,baseline,scenes:[],errors:[]};
const url=process.env.RENDER_URL||'http://localhost:4193/';
try {
 if(!process.env.RENDER_URL)server=spawn('npx',['vite','preview','--port','4193','--strictPort'],{stdio:'ignore',detached:true});
 for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>80)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,250));}
 browser=await (name==='webkit'?webkit:chromium).launch({executablePath:name==='chromium'?process.env.CHROMIUM_EXECUTABLE:undefined,args:name==='chromium'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await ctx.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))report.errors.push(m.text());});
 await page.goto(url+'?fresh=1&seed=9&quality=high');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier?.game?.time>.3,null,{timeout:90000});
 await page.evaluate(async()=>{
  await document.fonts.ready;
  const f=window.__frontier;f.paused=true;f.input.reset();
  const render=f.view.render.bind(f.view);f.view.render=(dt,time,ui)=>render(0,12,ui);
  f.game.player.facing=2.8;
  document.querySelector('.banner')?.remove();f.hud.el.zone.style.opacity=0;
 });
 for(const [scene,x,z] of [['grove',-172,14],['forest',-70,-56],['town',-208,17]]){
  await page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.snapCamera();},[x,z]);
  await page.waitForTimeout(450);
  const state=await page.evaluate(()=>{const f=window.__frontier,v=f.view;return {position:{x:f.game.player.x,z:f.game.player.z},calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,geometries:v.renderer.info.memory.geometries,textures:v.renderer.info.memory.textures};});
  await page.screenshot({path:out+scene+'.png',timeout:60000});
  report.scenes.push({scene,...state});console.log('CAPTURE',name,baseline?'before':'after',scene,JSON.stringify(state));
  assert.deepEqual(report.errors,[],'shader/browser errors');
 }
 if(!baseline){
  const structure=await page.evaluate(()=>{
   const v=window.__frontier.view,actors=[],painted=[],wind=[];
   v.scene.traverse(o=>{
    if(o.isSkinnedMesh&&o.material?.isMeshToonMaterial)actors.push({receive:o.receiveShadow,cast:o.castShadow});
    if(o.isMesh&&o.material?.userData.paintedShadow)painted.push({receive:o.receiveShadow,cast:o.castShadow});
    if(o.castShadow&&o.material?.userData.windPatch?.wind)wind.push({depth:!!o.customDepthMaterial,alpha:o.customDepthMaterial?.alphaTest===o.material.alphaTest,map:o.customDepthMaterial?.map===o.material.map});
   });
   return {actors,painted,wind,profile:v.lightingProfile,aa:v.renderer.getContextAttributes().antialias};
  });
  assert.ok(structure.actors.length>0);assert.ok(structure.actors.every(a=>a.receive));
  assert.ok(structure.painted.length>0);assert.ok(structure.painted.every(a=>a.receive));
  assert.ok(structure.wind.length>0);assert.ok(structure.wind.every(a=>a.depth&&a.alpha&&a.map));
  assert.equal(structure.profile,'daylight');report.structure=structure;
  const stages=[];
  for(const q of ['medium','low','high','medium','high','low','high']){
   await page.evaluate(q=>window.__frontier.view.setQuality(q),q);await page.waitForTimeout(180);
   const s=await page.evaluate(()=>{const v=window.__frontier.view;return {quality:v.quality,enabled:v.renderer.shadowMap.enabled,mapSize:v.sun.shadow.mapSize.x,targetSize:v.sun.shadow.map?.width||0,aa:v.renderer.getContextAttributes().antialias,textures:v.renderer.info.memory.textures};});
   assert.equal(s.enabled,q!=='low');assert.equal(s.targetSize,q==='high'?2048:q==='medium'?1024:0);assert.equal(s.aa,structure.aa);stages.push(s);
  }
  report.quality=stages;
  const high=stages.filter(s=>s.quality==='high').map(s=>s.textures);
  assert.ok(Math.max(...high)-Math.min(...high)<=1,'quality switching leaked GPU textures');
  await page.waitForTimeout(100);assert.deepEqual(report.errors,[]);
 }
 report.ok=true;writeFileSync(out+'report.json',JSON.stringify(report,null,2));
 console.log('PASS RENDER REVIEW',name,baseline?'before':'after');
} finally {writeFileSync(out+'report.json',JSON.stringify(report,null,2));await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
