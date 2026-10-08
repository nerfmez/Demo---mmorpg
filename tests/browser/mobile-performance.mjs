// Matched production-scene counters and walking CPU sample, not hardware FPS.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {checkMobileQuality} from './mobile-quality-checks.mjs';
const out=process.env.PERF_OUT||'/tmp/mobile-performance';mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4198','--strictPort'],{stdio:'ignore'});
let browser;
try{
 await new Promise(r=>setTimeout(r,800));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});page.setDefaultTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4198/?fresh=1&quality=low&seed=5&dynres=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.view.region.importedState==='imported-ready'&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'));
 console.log('READY');
 const qualities=process.env.PERF_QUALITIES==='none'?[]:(process.env.PERF_QUALITIES||'low,economy').split(',');
 const result=await page.evaluate(async(qualities)=>{
  const f=__frontier,g=f.game,v=f.view;f.input.disabled=true;f.questRoute.hide();
  const stats=a=>{const s=a.slice().sort((a,b)=>a-b);return{n:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,p95:s[Math.floor((s.length-1)*.95)],max:s.at(-1)};};
  const rows={};const wrap=(o,k,label)=>{const fn=o[k];if(!fn)return;o[k]=function(...a){const t=performance.now();try{return fn.apply(this,a);}finally{(rows[label]||=[]).push(performance.now()-t);}};};
  for(const k of ['updateHero','updateCamera','updateStreaming','syncMonsters','render','portrait'])wrap(v,k,k);
  wrap(v.renderer,'render','submit');wrap(v.scene,'onBeforeRender','grass');wrap(g,'update','rules');wrap(f.hud,'update','hud');
  const gl=v.renderer.getContext();let uploads=0,links=0;
  for(const key of ['bufferSubData','linkProgram']){const fn=gl[key];gl[key]=function(...a){if(key==='bufferSubData')uploads++;else links++;return fn.apply(this,a);};}
  const samples=[];
  for(const quality of qualities){
   v.setQuality(quality);
   for(const point of [{name:'beach',x:-132,z:80},{name:'town',x:62,z:22},{name:'field',x:-60,z:0}]){
    Object.assign(g.player,{x:point.x,z:point.z});v.snapCamera();g.setMove(0,0);
    await new Promise(r=>setTimeout(r,1500));for(const a of Object.values(rows))a.length=0;
    uploads=links=0;const frames=[];let last=performance.now();
    for(let i=0;i<32;i++){
     g.setMove(i<16?1:-1,0);
     await new Promise(r=>requestAnimationFrame(t=>{frames.push(t-last);last=t;r();}));
    }
    g.setMove(0,0);
    samples.push({quality,point:point.name,position:[g.player.x,g.player.z],frames:stats(frames),cpu:Object.fromEntries(Object.entries(rows).map(([k,a])=>[k,stats(a)])),render:{...v.renderer.info.render},memory:{...v.renderer.info.memory},dpr:v.renderer.getPixelRatio(),grass:v.grassList.reduce((n,m)=>n+m.count,0),grassTested:v.grassList.reduce((n,m)=>n+(m.userData.grassCulling.lastTested??0),0),uploads,links,queue:{...v.buildQueue.stats},neighbours:[...v.neighbours].map(([id,n])=>({id,state:n.region?.importedState||n.job?.state}))});
   }
  }
  return {samples,renderer:v.renderer.getContext().getParameter(v.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};
 },qualities);
 result.errors=errors;writeFileSync(out+'/report.json',JSON.stringify(result,null,2));await page.screenshot({path:out+'/field.png'});assert.deepEqual(errors,[]);console.log(JSON.stringify(result.samples));
 if(process.env.PERF_CHECKS==='1')await checkMobileQuality(page,out);
}finally{await browser?.close();server.kill();}
