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
  const render=f.view.render.bind(f.view);
  f.__reviewFrames=0;
  f.view.render=(dt,time,ui)=>{
   for(const mv of f.view.monsterViews.values())mv.spawnT=1;
   render(0,f.__reviewTime??12,ui);
   const info=f.view.renderer.info;
   f.__reviewStats={calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures};
   f.__reviewFrames++;
  };
  f.game.player.facing=2.8;
  document.querySelector('.banner')?.remove();f.hud.el.zone.style.opacity=0;
 });
 for(const [scene,x,z] of [['grove',-172,14],['forest',-116,-106],['town',-208,17]]){
  await page.evaluate(([x,z])=>{
   const f=window.__frontier;
   // Use a real walkable spot on the shaded side of an existing forest tree.
   if(z===-106){
    const trees=f.world.circles.filter(t=>['tree','birch'].includes(t.type)&&f.world.zoneAt(t.x,t.z).id==='forest')
      .sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2));
    if(trees[0]){x=trees[0].x+1.8;z=trees[0].z-1.2;}
   }
   Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.snapCamera();
   f.hud.updateTracker();f.hud.update(0,{interact(){}});f.hud.drawMinimap();
   f.__reviewFrames=0;
  },[x,z]);
  await page.waitForFunction(()=>window.__frontier.__reviewFrames>=3,null,{timeout:90000});
  const state=await page.evaluate(()=>{const f=window.__frontier,v=f.view;return {position:{x:f.game.player.x,z:f.game.player.z},...f.__reviewStats};});
  await page.screenshot({path:out+scene+'.png',timeout:60000});
  report.scenes.push({scene,...state});console.log('CAPTURE',name,baseline?'before':'after',scene,JSON.stringify(state));
  assert.deepEqual(report.errors,[],'shader/browser errors');
 }
 if(!baseline){
  const structure=await page.evaluate(()=>{
   const v=window.__frontier.view,actors=[],painted=[],wind=[];
   v.scene.traverse(o=>{
    if(o.isSkinnedMesh&&o.material?.isMeshToonMaterial)actors.push({name:o.name,parent:o.parent?.name,receive:o.receiveShadow,cast:o.castShadow});
    if(o.isMesh&&o.material?.userData.paintedShadow)painted.push({receive:o.receiveShadow,cast:o.castShadow});
    if(o.castShadow&&o.material?.userData.windPatch?.wind)wind.push({depth:!!o.customDepthMaterial,alpha:o.customDepthMaterial?.alphaTest===o.material.alphaTest,map:o.customDepthMaterial?.map===o.material.map});
   });
   return {actors,painted,wind,profile:v.lightingProfile,aa:v.renderer.getContextAttributes().antialias};
  });
  report.structure=structure;
  assert.ok(structure.actors.length>0);assert.ok(structure.actors.every(a=>a.receive),JSON.stringify(structure.actors));
  assert.ok(structure.painted.length>0);assert.ok(structure.painted.every(a=>a.receive));
  assert.ok(structure.wind.length>0);assert.ok(structure.wind.every(a=>a.depth&&a.alpha&&a.map));
  assert.equal(structure.profile,'daylight');
  const stages=[];report.quality=stages;
  for(const q of ['medium','low','high','medium','high','low','high']){
   await page.evaluate(q=>{window.__frontier.__reviewFrames=0;window.__frontier.view.setQuality(q);},q);
   await page.waitForFunction(()=>window.__frontier.__reviewFrames>=3,null,{timeout:90000});
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
