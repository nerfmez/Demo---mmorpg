// Matched High-quality scene: compare the original full grass scan and full pooled
// particle uploads against production, without changing scene state or quality.
// Software GPU timings are diagnostic only, never physical-phone/iPad FPS.
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rolldown} from 'rolldown';
import assert from 'node:assert/strict';
const baseline='036e6bca897eb2c0318b96dc239f1bd60fcaa7fa';
const out=process.env.PERF_OUT||'/tmp/high-performance';mkdirSync(out,{recursive:true});
const reference=execFileSync('git',['show',`${baseline}:src/render/grass-culling.js`],{encoding:'utf8'});
const bundle=await rolldown({input:'reference-grass',plugins:[{
 name:'reference',resolveId(id){if(id==='reference-grass')return '\0reference-grass';},
 load(id){if(id==='\0reference-grass')return reference.replace("'three'",JSON.stringify(process.cwd()+'/node_modules/three/build/three.module.js'));}
}]});
const built=await bundle.generate({format:'es'});await bundle.close();
const referenceJS=built.output.find(o=>o.type==='chunk').code;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4198','--strictPort'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:4198/')).ok)break;}catch{}if(i>80)throw Error('preview');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});page.setDefaultTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/perf-reference.js',route=>route.fulfill({contentType:'application/javascript',body:referenceJS}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__freeze)cb(t)});});
 await page.goto('http://127.0.0.1:4198/?fresh=1&quality=high&seed=5&dynres=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.view.region.importedState==='imported-ready'&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'));
 await page.waitForFunction(()=>__frontier.hud.portrait.style.backgroundImage.includes('data:image'));
 await page.evaluate(async()=>{window.__freeze=true;const f=__frontier;f.paused=true;f.input.disabled=true;f.questRoute.hide();window.refGrass=(await import('/perf-reference.js')).updateGrassVisibility;window.finalGrassHook=f.view.scene.onBeforeRender;});
 console.log('READY High');
 const report={baseline,sourceFiles:Object.fromEntries(['src/render/view.js','src/render/grass-culling.js','src/render/particles.js','src/render/ribbon.js','src/main.js','data/rendering.json'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),samples:[]};
 for(const point of [{name:'beach',x:-132,z:80},{name:'town',x:62,z:22},{name:'field',x:-60,z:0}]){
  const result=await page.evaluate(async point=>{
   const f=__frontier,g=f.game,v=f.view,r=v.renderer,gl=r.getContext();
   Object.assign(g.player,{x:point.x,z:point.z});g.setMove(0,0);v.snapCamera();v.render(0,12,{});
   const finalHook=window.finalGrassHook,referenceHook=()=>{for(const m of v.grassList)window.refGrass(m,v.camera);};
   const invalidate=()=>{for(const m of v.grassList)m.userData.grassCulling.matrix.fill(NaN);};
   const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return {n:s.length,median:s[Math.floor(s.length/2)],p95:s[Math.floor((s.length-1)*.95)]};};
   const cpu=hook=>{const samples=[];for(let i=0;i<64;i++){v.camera.position.x+=.01;v.camera.updateMatrixWorld(true);const t=performance.now();hook.call(v.scene,r,v.scene,v.camera,null);samples.push(performance.now()-t);}return stats(samples);};
   const pixels=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
   const systems=[v.vfx.fx,v.vfx.dust].filter(Boolean);
   // Same deterministic visible particle state; counts, shape, blending and lifetime stay intact.
   for(const p of systems){p.add(point.x,1.3,point.z,0,0,0,{life:2,color:0xffdd88});p.update(0);}
   const rawUpload=gl.bufferSubData;let bytes=0;
   gl.bufferSubData=function(target,offset,src,srcOffset=0,length){bytes+=(length??src.length-srcOffset)*src.BYTES_PER_ELEMENT;return rawUpload.apply(this,arguments);};
   const draw=before=>{
    v.scene.onBeforeRender=before?referenceHook:finalHook;invalidate();
    for(const p of systems){p.update(0);if(before)for(const a of Object.values(p.points.geometry.attributes)){a.clearUpdateRanges();a.needsUpdate=true;}}
    bytes=0;v.draw();return{bytes,pixels:pixels(),counts:v.grassList.map(m=>m.count)};
   };
   const a=draw(true),b=draw(false);let different=0,maxDifference=0;
   for(let i=0;i<a.pixels.length;i++){const d=Math.abs(a.pixels[i]-b.pixels[i]);if(d)different++;maxDifference=Math.max(maxDifference,d);}
   // Alternate variants to avoid assigning every cold/first sample to one side.
   const referenceTimes=[],finalTimes=[];
   for(let i=0;i<4;i++){for(const [hook,list]of(i%2?[[finalHook,finalTimes],[referenceHook,referenceTimes]]:[[referenceHook,referenceTimes],[finalHook,finalTimes]])){invalidate();list.push(cpu(hook));}}
   v.snapCamera();v.scene.onBeforeRender=finalHook;v.render(0,12,{});
   return {point:point.name,quality:v.quality,dpr:r.getPixelRatio(),shadowMap:v.sun.shadow.mapSize.toArray(),postSamples:v.post.scene.samples,grassCountsEqual:JSON.stringify(a.counts)===JSON.stringify(b.counts),pixelDifference:{channels:different,maxDifference,total:a.pixels.length},uploads:{referenceBytes:a.bytes,finalBytes:b.bytes},grassCPU:{reference:referenceTimes,final:finalTimes},grassTested:v.grassList.reduce((n,m)=>n+(m.userData.grassCulling.lastTested??0),0),grassTotal:v.grassList.reduce((n,m)=>n+m.userData.grassCulling.count,0),particles:systems.map(p=>({live:p.count,capacity:p.cap})),memory:{...r.info.memory}};
  },point);
  assert.equal(result.quality,'high');assert.equal(result.dpr,2);assert.deepEqual(result.shadowMap,[2048,2048]);assert.equal(result.postSamples,4);
  assert.equal(result.grassCountsEqual,true);assert.equal(result.pixelDifference.channels,0);assert.ok(result.uploads.finalBytes<result.uploads.referenceBytes);
  report.samples.push(result);console.log(point.name,JSON.stringify(result));
 }
 // Freezing game rAF must not suppress the fullscreen controller's resize rAF.
 await page.evaluate(()=>{window.__freeze=false;});
 report.viewports=[];
 for(const [name,width,height]of [['phone',844,390],['ipad',1180,820],['desktop',1280,720]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await page.waitForFunction(([w,h])=>{const c=__frontier.view.renderer.domElement.getBoundingClientRect();return Math.abs(c.width-w)<1&&Math.abs(c.height-h)<1;},[width,height]);
  const size=await page.evaluate(()=>{const v=__frontier.view;v.resize();v.render(0,12,{});return {css:[v.renderer.domElement.clientWidth,v.renderer.domElement.clientHeight],buffer:[v.renderer.domElement.width,v.renderer.domElement.height],dpr:v.renderer.getPixelRatio()};});
  assert.deepEqual(size.css,[width,height]);assert.deepEqual(size.buffer,[width*2,height*2]);report.viewports.push({name,...size});
  await page.screenshot({path:out+`/${name}-high.png`});
 }
 // The frozen production loop has no pending callback. Let UI rAF run while
 // portrait readbacks await the GPU, then confirm owned buffers stabilise.
 report.portrait=await page.evaluate(async()=>{
  window.__freeze=false;const f=__frontier,v=f.view;let frames=0,run=true;
  function tick(){if(run){frames++;requestAnimationFrame(tick);}}requestAnimationFrame(tick);
  const memory=[];
  for(let i=0;i<2;i++){
   const target=v.renderer.getRenderTarget(),url=await v.portrait(f.game.ch.appearance,f.game.gearLook());
   if(!url.startsWith('data:image/png')||v.renderer.getRenderTarget()!==target)throw Error('portrait/state');
   memory.push({...v.renderer.info.memory});
  }
  run=false;return{frames,memory,glError:v.renderer.getContext().getError()};
 });
 assert.ok(report.portrait.frames>0);assert.equal(report.portrait.glError,0);
 assert.deepEqual(report.portrait.memory[0],report.portrait.memory[1]);
 // Check actual touch at High after unfreezing the production loop.
 await page.setViewportSize({width:844,height:390});
 await page.reload();await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'));
 await page.evaluate(()=>{__frontier.questRoute.hide();Object.assign(__frontier.game.player,{x:-132,z:80});__frontier.view.snapCamera();});
 const start=await page.evaluate(()=>[__frontier.game.player.x,__frontier.game.player.z]);
 const joy=await page.locator('.joyzone').boundingBox(),x=joy.x+joy.width*.4,y=joy.y+joy.height*.6;
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+38,y}]});
 await page.waitForFunction(([x,z])=>Math.hypot(__frontier.game.player.x-x,__frontier.game.player.z-z)>.1,start);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>__frontier.input.joy.id===null&&__frontier.game.input.moveX===0&&__frontier.game.input.moveZ===0);
 report.touch=true;report.errors=errors;assert.deepEqual(errors,[]);
 report.renderer=await page.evaluate(()=>{const gl=__frontier.view.renderer.getContext();return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);});
 writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('PASS identical High pixels, reduced work and touch');
}finally{await browser?.close();server.kill();}
