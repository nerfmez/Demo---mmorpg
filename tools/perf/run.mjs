#!/usr/bin/env node
// Controlled, sequential paired runs on ONE host. Never a production or physical-iPad benchmark.
// Usage: node tools/perf/run.mjs <BASELINE_PROFILE_DIR> <CANDIDATE_PROFILE_DIR> <NEW_OUTPUT_DIR>
// Dependencies: the repository's installed playwright and Vite; build profile copies first.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import os from 'node:os';
const [baseArg,candidateArg,outArg] = process.argv.slice(2);
if(!baseArg||!candidateArg||!outArg)throw Error('Supply baseline profile directory, candidate profile directory and NEW output directory.');
const dirs={baseline:resolve(baseArg),candidate:resolve(candidateArg)},out=resolve(outArg);
if(existsSync(out))throw Error('Refusing to overwrite an earlier measurement directory.');
mkdirSync(out,{recursive:true});
const require=createRequire(join(dirs.candidate,'package.json'));
const {chromium,webkit}=require('playwright');
const engineName=process.env.BROWSER||'chromium';
if(!['chromium','webkit'].includes(engineName))throw Error('Unsupported browser');
const engine=engineName==='webkit'?webkit:chromium;
const software=process.env.PERF_SOFTWARE_GPU==='1';
const settings={quality:process.env.PERF_QUALITY||'medium',seed:4,streamBudget:6,dynres:0,
  viewport:{width:1180,height:820},deviceScaleFactor:1,engine:engineName,softwareRequested:software,
  coldDefinition:'Fresh browser process/context per run; operating-system and CDN caches are NOT purged.',
  routeDefinition:'Fixed freeSpotNear setup positions, keyboard movement across seams; not a continuous walk between setup points.'};
const manifests=Object.fromEntries(Object.entries(dirs).map(([k,d])=>[k,JSON.parse(readFileSync(join(d,'profile-source.json')))]));
assert.equal(manifests.baseline.overlaySha256,manifests.candidate.overlaySha256);
assert.equal(manifests.baseline.recorderSha256,manifests.candidate.recorderSha256);
assert.equal(readFileSync(join(dirs.baseline,'package-lock.json'),'utf8'),readFileSync(join(dirs.candidate,'package-lock.json'),'utf8'),'A/B dependency locks differ');
const experiment={schema:1,settings,manifests,host:{platform:os.platform(),release:os.release(),arch:os.arch(),
  cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem()},runs:[],complete:false};
const saveExperiment=()=>writeFileSync(join(out,'experiment.json'),JSON.stringify(experiment,null,2));
saveExperiment();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const expectedBaseline='1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c';
const expectedCandidate='08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24';
assert.equal(manifests.baseline.source,expectedBaseline,'Re-baselining requires explicit protocol review');
assert.equal(manifests.candidate.source,expectedCandidate,'Candidate changed; review the pair before measuring');

async function run(variant,rep){
 const directory=dirs[variant],dest=join(out,`${rep}-${variant}`);mkdirSync(dest);
 const diagnostic={requests:[],responses:[],requestFinished:[],requestFailures:[],console:[],errors:[],events:[],server:[],dropped:0};
 const push=(key,value)=>{if(diagnostic[key].length<10000)diagnostic[key].push(value);else diagnostic.dropped++;};
 const result={variant,rep,source:manifests[variant].source,settings,complete:false,checkpoints:[],fault:null};
 let browser,page,context,profile,server,cdp;
 const pendingRequests=new Set();result.maxPendingRequests=0;
 const dump=()=>{writeFileSync(join(dest,'diagnostic.json'),JSON.stringify(diagnostic,null,2));writeFileSync(join(dest,'result.json'),JSON.stringify(result,null,2));};
 const port=4317,url=`http://localhost:${port}/`;
 try{
  server=spawn(process.execPath,[join(directory,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:directory,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',s=>push('server',String(s)));
  for(let i=0;;i++){
   if(server.exitCode!==null)throw Error('Preview server exited: '+server.exitCode);
   try{const response=await fetch(url+'profile-source.json',{signal:AbortSignal.timeout(1000)});if(response.ok){assert.equal((await response.json()).source,result.source);break;}}catch(error){if(i===30)throw error;}
   if(i>=30)throw Error('Preview readiness failed');await sleep(250);
  }
  const args=software&&engineName==='chromium'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[];
  browser=await engine.launch({args});result.browserVersion=browser.version();
  context=await browser.newContext({viewport:settings.viewport,deviceScaleFactor:1,hasTouch:true,isMobile:true});
  // Diagnostics are enabled for BOTH variants. Trace overhead must not be removed from only one.
  await context.tracing.start({screenshots:false,snapshots:false,sources:false});
  page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(30000);
  if(engineName==='chromium')cdp=await context.newCDPSession(page);
  const stamp=()=>new Date().toISOString();
  page.on('request',r=>{pendingRequests.add(r);result.maxPendingRequests=Math.max(result.maxPendingRequests,pendingRequests.size);push('requests',{at:stamp(),url:r.url(),type:r.resourceType(),pending:pendingRequests.size});});
  page.on('requestfinished',r=>{pendingRequests.delete(r);push('requestFinished',{at:stamp(),url:r.url(),pending:pendingRequests.size});});
  page.on('response',r=>push('responses',{at:stamp(),url:r.url(),status:r.status()}));
  page.on('requestfailed',r=>{pendingRequests.delete(r);push('requestFailures',{at:stamp(),url:r.url(),failure:r.failure(),pending:pendingRequests.size});});
  page.on('console',m=>push('console',{at:stamp(),type:m.type(),message:m.text()}));
  page.on('pageerror',e=>push('errors',{at:stamp(),message:String(e)}));
  for(const name of ['crash','domcontentloaded','load','close'])page.on(name,()=>push('events',{at:stamp(),name}));
  // Keep the existing 30s total navigation deadline. Log commit separately, do not waive load failure.
  const navigationStart=Date.now();
  await page.goto(url+`?fresh=1&profile=1&seed=4&quality=${encodeURIComponent(settings.quality)}&dynres=0&streamBudget=6`,{waitUntil:'commit',timeout:30000});
  push('events',{at:stamp(),name:'navigation-committed'});
  const left=30000-(Date.now()-navigationStart);if(left<=0)throw Error('Navigation deadline before load');
  await page.waitForLoadState('load',{timeout:left});
  await page.waitForFunction(()=>window.__streamProfile&&window.__frontier?.modelsReady&&window.__frontier?.game?.time>.3&&document.getElementById('loading').classList.contains('done'));
  result.environment=await page.evaluate(()=>{
   const f=window.__frontier,r=f.view.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {userAgent:navigator.userAgent,webdriver:navigator.webdriver,actualQuality:f.view.quality,
    pixelRatio:r.getPixelRatio(),streamBudget:f.view.streamBudgetMs,post:!!f.view.post,
    gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
  });
  assert.equal(result.environment.actualQuality,settings.quality);assert.equal(result.environment.streamBudget,6);
  const map=await page.evaluate(()=>({id:window.__frontier.world.data.id,seam:window.__frontier.world.seams[0]}));
  if(map.id!=='azure-harbor-v1'||map.seam.edge!=='minX')throw Error('Authored route changed; do not invent a substitute');
  const AZURE=map.id,FRONTIER=map.seam.to,gate=map.seam.gate;
  assert.ok(gate?.length===2);
  await page.evaluate(()=>{window.__profileDocumentToken='same-document';});
  const phase=name=>page.evaluate(name=>window.__streamProfile.phase(name),name);
  const sample=async label=>{
   const value=await page.evaluate(label=>window.__streamProfile.sample(window.__frontier.view,label),label);
   value.cdpHeap=null;
   if(cdp)try{value.cdpHeap=await cdp.send('Runtime.getHeapUsage');}catch(error){value.heapMeasurementError=String(error);}
   return value;
  };
  const place=(x,z)=>page.evaluate(([x,z])=>{const f=window.__frontier,g=f.game;
   if(g.inCombat())throw Error('Route is in combat; result is invalid, do not delete monsters');
   Object.assign(g.player,g.freeSpotNear(x,z));f.view.snapCamera();},[x,z]);
  const settled=async()=>{
   await page.waitForFunction(()=>{const f=window.__frontier,p=window.__streamProfile;
    return p.activeLoads===0 && [...f.view.neighbours.values()].every(n=>!n.steps) &&
     p.status().pendingImports===0;});
   await sleep(1000);
  };
  const quiet=async name=>{await settled();await phase('quiet-'+name);for(let i=0;i<5;i++){result.checkpoints.push(await sample(name+'-'+i));await sleep(1000);}};
  await quiet('boot');await page.screenshot({path:join(dest,'01-open.png'),timeout:10000});
  await phase('first-neighbour-load');await place(gate[0]+100,gate[1]);
  await page.waitForFunction(id=>window.__frontier.view.neighbourReady(id),FRONTIER);
  await settled();
  await page.screenshot({path:join(dest,'02-neighbour-ready.png'),timeout:10000});
  async function cross(target,key,x,z){
   await place(x,z);await page.keyboard.down(key);
   try{await page.waitForFunction(id=>window.__frontier.world.data.id===id,target);}
   finally{await page.keyboard.up(key);}
   assert.equal(await page.evaluate(()=>window.__profileDocumentToken),'same-document','Crossing reloaded the document');
   const state=await page.evaluate(()=>{const f=window.__frontier;return {view:f.world.data.id,core:f.game.world.data.id,
     monsters:f.game.monsters.length,free:f.world.isFree(f.game.player.x,f.game.player.z,f.game.player.r)};});
   assert.equal(state.view,target);assert.equal(state.core,target);assert.ok(state.monsters>0);assert.ok(state.free);
  }
  for(let i=1;i<=6;i++){
   await phase('roundtrip-'+i);await cross(FRONTIER,'ArrowLeft',gate[0]+1.2,gate[1]);
   const back=await page.evaluate(()=>{const w=window.__frontier.world,s=w.seams[0];return [w.bounds.maxX-1.2,s.gate[1]];});
   await cross(AZURE,'ArrowRight',...back);
  }
  await quiet('six-roundtrips');await page.screenshot({path:join(dest,'03-return.png'),timeout:10000});
  await phase('evict-return');await place(60,20);
  await page.waitForFunction(id=>!window.__frontier.view.neighbours.has(id),FRONTIER);
  await quiet('evicted');await phase('evict-return-reload');await place(gate[0]+100,gate[1]);
  await page.waitForFunction(id=>window.__frontier.view.neighbourReady(id),FRONTIER);await quiet('rebuilt');
  await phase('cancel-preparation');await place(60,20);
  await page.waitForFunction(id=>!window.__frontier.view.neighbours.has(id),FRONTIER);
  const before=await page.evaluate(()=>window.__streamProfile.snapshot().regions.length);
  await place(gate[0]+100,gate[1]);
  await page.waitForFunction(id=>!!window.__frontier.view.neighbours.get(id)?.steps,FRONTIER);
  await place(60,20);await page.waitForFunction(id=>!window.__frontier.view.neighbours.has(id),FRONTIER);
  const cancelled=await page.evaluate(n=>window.__streamProfile.snapshot().regions.slice(n).some(r=>r.status==='cancelled'),before);
  assert.ok(cancelled,'Cancellation was not observed; cannot call this scenario complete');
  await quiet('cancelled');await phase('post-cancel-reload');await place(gate[0]+100,gate[1]);
  await page.waitForFunction(id=>window.__frontier.view.neighbourReady(id),FRONTIER);await quiet('post-cancel-rebuilt');
  await page.screenshot({path:join(dest,'04-after-cancel.png'),timeout:10000});
  profile=await page.evaluate(()=>window.__streamProfile.snapshot());
  assert.equal(profile.dropped,0,'Profiler truncated samples');assert.equal(profile.resource.dropped,0);
  assert.equal(profile.unfinishedSpans.length,0,'Unfinished preparation spans');
  assert.equal(profile.activeLoads,0);assert.equal(diagnostic.dropped,0,'Diagnostics truncated');
  assert.deepEqual(profile.errors,[]);assert.deepEqual(diagnostic.errors,[]);
  assert.deepEqual(diagnostic.requestFailures,[]);
  assert.deepEqual(diagnostic.console.filter(e=>e.type==='error'),[]);
  assert.ok(profile.frames.length>100,'Insufficient frame samples');
  assert.ok(profile.frames.every(f=>!f.hidden),'Backgrounded page invalidates this run');
  profile.measurementComplete=true;result.complete=true;
 }catch(error){
  result.fault={message:String(error),stack:error.stack,policyBlocked:String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR')};
  // Diagnostic reads have a short deadline and never turn a timeout into a pass.
  if(page&&!result.fault.policyBlocked)try{profile=await Promise.race([page.evaluate(()=>window.__streamProfile?.snapshot()),sleep(1500).then(()=>null)]);}catch{}
  throw error;
 }finally{
  if(profile)writeFileSync(join(dest,'profile.json'),JSON.stringify(profile,null,2));
  dump();experiment.runs.push(result);saveExperiment();
  if(context)try{await context.tracing.stop({path:join(dest,'trace.zip')});}catch(error){push('errors',{message:'trace export: '+error});dump();}
  await browser?.close();
  if(server){server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),sleep(2000)]);if(server.exitCode===null)server.kill('SIGKILL');}
 }
}
// No variant retry after failure, especially not after an administrator block.
for(let rep=1;rep<=3;rep++)for(const variant of (rep===2?['candidate','baseline']:['baseline','candidate']))await run(variant,rep);
experiment.complete=true;saveExperiment();console.log('Completed 3 paired repetitions; inspect raw profiles, screenshots, diagnostics and limits.');
