// Production High and production 6 ms queue; separates main-thread loading work
// from software-GPU frame time. Not a hardware FPS benchmark.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.STREAM_OUT||'/tmp/streaming-stutter';mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4199','--strictPort'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:4199/')).ok)break;}catch{}if(i>80)throw Error('preview');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:Number(process.env.STREAM_DPR||1)});page.setDefaultTimeout(240000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  window.streamProbe={phase:'startup',rows:[],steps:[],frames:[],long:[],jobs:[]};let frontier;
  const q=streamProbe;
  new PerformanceObserver(list=>{for(const e of list.getEntries())q.long.push({phase:q.phase,start:e.startTime,ms:e.duration});}).observe({type:'longtask',buffered:false});
  Object.defineProperty(window,'__frontier',{configurable:true,get:()=>frontier,set:f=>{
   frontier=f;const v=f.view;
   const wrap=(o,k,label)=>{const fn=o[k];if(!fn)return;o[k]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{q.rows.push({phase:q.phase,key:label,start:t,ms:performance.now()-t});}};};
   for(const k of ['readRenderTargetPixels','readRenderTargetPixelsAsync','compile','compileAsync','render','initTexture'])wrap(v.renderer,k,'renderer.'+k);
   for(const k of ['updateStreaming','switchRegion','takeRig','refreshModelRigs','warmup','setHeroLook','render'])wrap(v,k,'view.'+k);
   wrap(v.buildQueue,'drain','queue.slice');
   const observe=job=>{const onStep=job.onStep;job.onStep=ms=>{onStep?.(ms);if(ms>=.5)q.steps.push({phase:q.phase,label:job.label,ms});};q.jobs.push(job);};
   for(const job of v.buildQueue.jobs)observe(job);
   const enqueue=v.buildQueue.enqueue.bind(v.buildQueue);v.buildQueue.enqueue=(steps,options)=>{const j=enqueue(steps,options);observe(j);return j;};
   let last=performance.now();function frame(t){q.frames.push({phase:q.phase,ms:t-last,x:f.game?.player.x,z:f.game?.player.z});last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  }});
 });
 await page.goto('http://127.0.0.1:4199/?fresh=1&seed=5&quality=high&dynres=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game.time>.3&&document.querySelector('#loading').classList.contains('done'));
 console.log('READY');
 const partial=async()=>{const p=await page.evaluate(()=>{const q=streamProbe,v=__frontier.view;return {...q,jobs:q.jobs.map(j=>({label:j.label,state:j.state,stats:j.stats})),quality:v.quality,dpr:v.renderer.getPixelRatio(),queue:{budgetMs:v.buildQueue.budgetMs,...v.buildQueue.stats},memory:{...v.renderer.info.memory},regions:[{id:v.world.data.id,state:v.region.importedState},...[...v.neighbours].map(([id,n])=>({id,state:n.region?.importedState,job:n.job?.state,stats:n.region?.stats}))]};});p.errors=errors;writeFileSync(out+'/report.json',JSON.stringify(p,null,2));};
 await page.evaluate(()=>{const f=__frontier;streamProbe.phase='walking-load';f.questRoute.hide();f.input.disabled=true;f.game.player.hp=1e9;f.game.setMove(1,0);});
 for(let i=0;i<Number(process.env.STREAM_WALK_FRAMES||4);i++){await page.evaluate(()=>new Promise(requestAnimationFrame));if(i%4===0)await partial();}
 await page.evaluate(()=>{__frontier.game.setMove(0,0);});
 await partial();console.log('WALKED');
 await page.evaluate(()=>{streamProbe.phase="queue-only";const v=__frontier.view;v.savedRender=v.render;v.render=()=>{};});
 await page.waitForFunction(()=>[...__frontier.view.neighbours.values()].every(n=>n.region?.importedState==='imported-ready'||n.error),null,{timeout:480000});
 await partial();console.log('STREAM READY');
 await page.evaluate(()=>{__frontier.view.render=__frontier.view.savedRender;streamProbe.phase='warm-walk';__frontier.game.setMove(-1,0);});
 for(let i=0;i<4;i++)await page.evaluate(()=>new Promise(requestAnimationFrame));
 await page.evaluate(()=>__frontier.game.setMove(0,0));
 await partial();await page.screenshot({path:out+'/high-walking.png'});assert.deepEqual(errors,[]);
 for(const [name,viewport] of [['ipad',{width:1194,height:834}],['large',{width:1600,height:900}]]){
  await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(requestAnimationFrame));await page.screenshot({path:out+'/high-'+name+'.png'});
 }
 assert.deepEqual(errors,[]);console.log('PASS High streaming probe');
}finally{await browser?.close();server.kill();}
