// Isolated real WebGL proof for the production grass bake, not an FPS benchmark.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4201','--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:4201/')).ok)break;}catch{}if(i>60)throw Error('dev server');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:4201/',r=>r.fulfill({contentType:'text/html',body:'<canvas id="proof"></canvas>'}));await page.goto('http://127.0.0.1:4201/');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
 const result=await page.evaluate(async()=>{
  const {data}=await import('/src/data.js'),{createWorld}=await import('/src/core/world.js');
  const {View}=await import('/src/render/view.js'),{regionSteps,disposeRegion}=await import('/src/render/region.js');
  const worlds=Object.fromEntries(Object.entries(data.maps).map(([k,v])=>[k,createWorld(v)]));
  const v=new View(document.querySelector('canvas'),worlds[data.world.id],{quality:'high',worlds});v.renderer.setSize(64,64);
  await v.region.ready;
  const rows=[{map:v.world.data.id,stats:v.buildQueue.stats}];
  const id=Object.keys(worlds).find(k=>k!==v.world.data.id);
  const job=v.buildQueue.enqueue(regionSteps(v,worlds[id]),{label:'profile-neighbour'});const region=await job.promise;await region.importsReady;
  rows.push({map:id,stats:job.stats});disposeRegion(region);
  return {rows,memory:{...v.renderer.info.memory}};
 });
 const {profile}=await cdp.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
 for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),k=n.callFrame.functionName+' '+n.callFrame.url;self.set(k,(self.get(k)||0)+profile.timeDeltas[i]/1000);}
 console.log(JSON.stringify({result,errors,top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,50)}));assert.deepEqual(errors,[]);

}finally{await browser?.close();server.kill();}
