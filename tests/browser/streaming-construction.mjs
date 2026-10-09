// Isolated real WebGL proof for the production grass bake, not an FPS benchmark.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4201','--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:4201/')).ok)break;}catch{}if(i>60)throw Error('dev server');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:4201/',r=>r.fulfill({contentType:'text/html',body:'<canvas id="proof"></canvas>'}));await page.route('**/src/render/environment.js',async route=>{
 const response=await route.fetch();const lines=(await response.text()).split('\n');
 const first=lines.findIndex(x=>x.includes('export function* environmentSteps')),last=lines.findIndex(x=>x.includes('// A timber road gate'));
 for(let i=first;i<last;i++)if(lines[i].includes('root.add(')||lines[i].includes('yield* townSteps')||lines[i].includes('yield* createHarborSteps'))lines[i]='globalThis.__envLine='+String(i+1)+';'+lines[i];
 await route.fulfill({response,body:lines.join('\n')});
 });await page.route('**/src/render/region.js',async route=>{
 const response=await route.fetch();let source=await response.text();
 source=source.replace('return region;','globalThis.__constructionRegions ||= {};globalThis.__constructionRegions[world.data.id]=region;return region;');
 for(const [text,stage] of [['region.terrain =','terrain'],['const env =','environment'],['if (!world.data.city?.enabled) root.add','water'],['yield* inRegion(shift, bakeGrassSteps','grass-bake'],['region.staticBatch =','static-batch'],['// Town NPCs','npcs']])source=source.replace(text,'region.stats.stage='+JSON.stringify(stage)+';'+text);
 await route.fulfill({response,body:source});
 });await page.goto('http://127.0.0.1:4201/');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{
  const {data}=await import('/src/data.js'),{createWorld}=await import('/src/core/world.js');
  const {View}=await import('/src/render/view.js'),{regionSteps,disposeRegion}=await import('/src/render/region.js');
  const worlds=Object.fromEntries(Object.entries(data.maps).map(([k,v])=>[k,createWorld(v)]));
  const v=new View(document.querySelector('canvas'),worlds[data.world.id],{quality:'high',worlds});v.renderer.setSize(64,64);
  const slow=[];const observe=job=>{const onStep=job.onStep;job.onStep=ms=>{onStep?.(ms);if(ms>20)slow.push({label:job.label,stage:globalThis.__constructionRegions?.[job.label.replace('region.','')]?.stats.stage,envLine:globalThis.__envLine,ms});};};
  for(const job of v.buildQueue.jobs)observe(job);const enqueue=v.buildQueue.enqueue.bind(v.buildQueue);v.buildQueue.enqueue=(steps,opts)=>{const job=enqueue(steps,opts);observe(job);return job;};
  await v.region.ready;
  const rows=[{map:v.world.data.id,stats:{...v.buildQueue.stats}}];
  const id=Object.keys(worlds).find(k=>k!==v.world.data.id);
  const job=v.buildQueue.enqueue(regionSteps(v,worlds[id]),{label:'region.'+id});const region=await job.promise;await region.importsReady;
  rows.push({map:id,stats:job.stats});disposeRegion(region);
  v.coreWorld=k=>worlds[k];const resources=[];
  const nativeRead=v.renderer.readRenderTargetPixelsAsync.bind(v.renderer);let cancelRead=false;
  v.renderer.readRenderTargetPixelsAsync=(...args)=>{const pending=nativeRead(...args);if(cancelRead){cancelRead=false;v.updateStreaming(10000,10000);}return pending;};
  for(let cycle=0;cycle<2;cycle++){
   const before={...v.renderer.info.memory};cancelRead=true;v.updateStreaming(...v.world.data.playerSpawn);const n=v.neighbours.get(id);
   if(!n)throw Error('expected streaming neighbour');
   let error;try{await n.job.promise;}catch(e){error=e.name;}
   if(error!=='AbortError'||cancelRead||v.neighbours.size)throw Error('GPU cancellation did not complete');
   const after={...v.renderer.info.memory};resources.push({cycle,before,after,state:n.job.state});
   if(after.geometries!==before.geometries||after.textures!==before.textures)throw Error('cancelled region GPU growth');
  }
  return {rows,slow,resources,memory:{...v.renderer.info.memory}};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
 for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),k=n.callFrame.functionName+' '+n.callFrame.url;self.set(k,(self.get(k)||0)+profile.timeDeltas[i]/1000);}
 console.log(JSON.stringify({result,errors,top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,50)}));assert.deepEqual(errors,[]);

}finally{await browser?.close();server.kill();}
