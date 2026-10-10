// Fixed Medium scene submission and culling-equivalence probe. Run from the repo root.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview',...(process.env.PROBE_DIST?['--outDir',process.env.PROBE_DIST]:[]),'--host','127.0.0.1','--port','4188','--strictPort'],{stdio:'inherit'});
for(let i=0;;i++){try{const r=await fetch('http://127.0.0.1:4188/');if(r.ok)break;if(i===10)console.log('response',r.status,await r.text());}catch(e){if(i===10)console.log('error',e,e.cause);}if(i>80){server.kill();throw Error('server');}await new Promise(r=>setTimeout(r,100));}
const out=process.env.PROBE_OUT||new URL('../tests/browser/out/camp-medium/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1180,height:740},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4188/?fresh=1&map=frontier-wilds-v1&quality=medium&seed=5&dynres=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.view.worldPrepared&&document.querySelector('#loading').classList.contains('done'),null,{timeout:120000});
 console.log('Ready');
 await page.evaluate(()=>{const f=__frontier;f.paused=true;f.input.disabled=true;f.questRoute.hide();f.game.ch.opening.stage='done';f.view.heroDown=f.view.heroDownTarget=0;f.game.player.x=204;f.game.player.z=0;f.view.heroY=f.game.world.groundY(204,0);f.view.snapCamera();f.reviewRender=f.view.render.bind(f.view);f.view.render=()=>{};document.querySelector('.banner')?.remove();f.reviewRender(0,12,{});});
 await page.screenshot({path:out+'/camp-medium.png'});
 const report=await page.evaluate(async()=>{
  const {view:v}=__frontier,r=v.renderer,gl=r.getContext();
  const samples=[],raw={};let passes={};
  const records=[...v.regions.values()].flatMap(s=>s.spatial.originals);
  const methods=records.map(s=>s.object.intersectsFrustum), pixels=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  for(const record of records)record.object.intersectsFrustum=record.intersectsFrustum||record.object.intersectsFrustum;
  v.draw();const oldPixels=pixels();
  records.forEach((s,i)=>s.object.intersectsFrustum=methods[i]);v.draw();const newPixels=pixels();
  let channels=0,maxDifference=0,nonzero=0;
  for(let i=0;i<newPixels.length;i++){const d=Math.abs(newPixels[i]-oldPixels[i]);if(d)channels++;maxDifference=Math.max(maxDifference,d);if(newPixels[i])nonzero++;}
  const boxPixels={channels,maxDifference,nonzero,total:newPixels.length};
  const render=__frontier.reviewRender;
  for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){raw[name]=gl[name];gl[name]=function(...args){const target=r.getRenderTarget(),key=target&&target===v.sun.shadow.map?'shadow':target&&target===v.post?.scene?'scene':target&&target===v.post?.glow?'glow':'canvas';passes[key]??={calls:0,triangles:0};passes[key].calls++;if(args[0]===gl.TRIANGLES)passes[key].triangles+=args[name.includes('Elements')?1:2]/3*(name.endsWith('Instanced')?args[name==='drawElementsInstanced'?4:3]:1);return raw[name].apply(this,args);};}
  for(const variant of ['medium','medium-no-shadow','medium-no-post','low']){
   if(variant==='low')v.setQuality('low');
   r.shadowMap.enabled=variant!=='medium-no-shadow'&&variant!=='low';
   const post=v.post;if(variant==='medium-no-post')v.post=null;
   passes={};render(0,12,{});gl.finish();passes={};const cpu=[],gpu=[];
   for(let i=0;i<4;i++){const t=performance.now();render(0,12,{});const s=performance.now();gl.finish();cpu.push(s-t);gpu.push(performance.now()-t);}
   samples.push({variant,dpr:r.getPixelRatio(),passes,cpu,gpu,spatial:[...v.regions].map(([id,s])=>({id,...s.spatial.stats})),grass:v.grassList.filter(m=>m.userData.residentCell?.attached).reduce((n,m)=>n+m.count,0)});
   if(variant==='medium-no-post')v.post=post;
  }
  for(const name of Object.keys(raw))gl[name]=raw[name];
  return {samples,boxPixels,glError:gl.getError(),memory:{...r.info.memory}};
 });
 report.views=[];
 await page.evaluate(()=>__frontier.view.setQuality('medium'));
 for(const [name,id,x,z] of [['grove-camp','moonroot-grove-v1',-111,-2],['azure-fountain','azure-harbor-v1',62,22],['azure-shore','azure-harbor-v1',-132,80],['frontier-camp','frontier-wilds-v1',204,0]]){
  const comparison=await page.evaluate(({id,x,z})=>{
   const f=__frontier,g=f.game,v=f.view,r=v.renderer,gl=r.getContext();
   [g.player.x,g.player.z]=g.scenePoint(id,x,z);g.activateRegion(id);v.switchRegion(id);v.heroY=g.world.groundY(g.player.x,g.player.z);v.snapCamera();f.reviewRender(0,12,{});
   const records=[...v.regions.values()].flatMap(s=>s.spatial.originals),methods=records.map(s=>s.object.intersectsFrustum);
   const pixels=()=>{const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
   records.forEach(s=>s.object.intersectsFrustum=s.intersectsFrustum||s.object.intersectsFrustum);v.draw();const before=pixels();
   records.forEach((s,i)=>s.object.intersectsFrustum=methods[i]);v.draw();const after=pixels();
   let channels=0,maxDifference=0,nonzero=0;for(let i=0;i<after.length;i++){const d=Math.abs(before[i]-after[i]);if(d)channels++;maxDifference=Math.max(maxDifference,d);if(after[i])nonzero++;}
   return {channels,maxDifference,nonzero,total:after.length,quality:v.quality,glError:gl.getError()};
  },{id,x,z});
  await page.screenshot({path:out+'/'+name+'.png'});report.views.push({name,id,at:[x,z],...comparison});
  if(comparison.channels||comparison.glError||!comparison.nonzero)throw Error('culling pixels changed: '+name+' '+JSON.stringify(comparison));
 }
 report.runtime=await page.evaluate(()=>({scripts:[...document.scripts].map(s=>s.getAttribute('src')).filter(Boolean),userAgent:navigator.userAgent}));
 report.errors=errors;writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({boxPixels:report.boxPixels,views:report.views,samples:report.samples.map(({variant,passes,dpr})=>({variant,passes,dpr})),errors:report.errors,runtime:report.runtime}));
}finally{await browser.close();server.kill();}
