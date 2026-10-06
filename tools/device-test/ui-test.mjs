// UI-only regression: the game document is intercepted with an explicit fixture.
// No game, WebGL, SwiftShader, map traversal, or performance benchmark is executed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const [bundle,dependencies,output]=process.argv.slice(2).map(x=>resolve(x));
const {chromium,webkit}=createRequire(join(dependencies,'package.json'))('playwright');
mkdirSync(output,{recursive:true});const url='http://127.0.0.1:8765/';
const server=spawn('python3',[join(bundle,'serve.py')],{cwd:bundle,stdio:['ignore','pipe','pipe']});
const serverLogs=[];for(const s of [server.stdout,server.stderr])s.on('data',d=>serverLogs.push(String(d)));
const report={kind:'UI-only synthetic fixture; NOT gameplay or hardware measurement',engines:[],ok:false};
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#263648;color:white;font:20px system-ui"><h1>UI TEST FIXTURE — NOT A GAME SCREENSHOT</h1><canvas id="c" width="320" height="240"></canvas><script>
let complete;const ready=new Promise(r=>complete=r),canvas=document.getElementById('c');canvas.getContext('2d').fillRect(0,0,320,240);
window.resolveImports=()=>complete();
const profile={startedAt:0,frames:Array.from({length:160},(_,i)=>({at:i*16,intervalMs:16,hidden:false,phase:'fixture'})),events:[],regions:[],memory:[],errors:[],dropped:0,unfinishedSpans:[],resource:{dropped:0}};
window.__streamProfile={activeLoads:0,phase(n){this.lastPhase=n},snapshot(){return profile},sample(){return{geometries:1,textures:0,jsHeapBytesApprox:null,gpuBytes:null}}};
window.__frontier={modelsReady:true,fps:60,game:{player:{x:0,z:0}},world:{data:{id:'fixture'}},view:{region:{world:{data:{id:'fixture'}},ready},neighbours:new Map(),quality:'medium',streamBudgetMs:6,zoom:1,post:false,render(){},renderer:{domElement:canvas,getPixelRatio(){return 1},getContext(){return{getExtension(){return null}}}}}};
setInterval(()=>__frontier.view.render(),100);</script><script type="module" src="../ui.mjs"></script></body></html>`;
try{
 for(let i=0;;i++){try{if((await fetch(url)).ok)break}catch{}if(i>40)throw Error('UI server unavailable');await new Promise(r=>setTimeout(r,100));}
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.route('**/*',route=>{const r=route.request(),p=new URL(r.url()).pathname;if(r.resourceType()==='document'&&['/baseline/','/candidate/'].includes(p))return route.fulfill({contentType:'text/html',body:fixture});return route.continue();});
   await page.goto(url);await page.waitForFunction(()=>document.querySelectorAll('#runs button').length===6);
   await page.locator('[name=device]').fill('UI fixture — not hardware');await page.locator('[name=group]').fill('ui-only');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:join(output,engine.name()+'-launcher.png'),fullPage:true});
   await page.locator('#runs button').nth(1).click();await page.waitForURL('**/candidate/?**');
   await page.locator('#open').click();assert.equal(await page.locator('#capture').isDisabled(),true);
   await page.evaluate(()=>resolveImports());await page.waitForFunction(()=>!document.querySelector('aside').shadowRoot.getElementById('capture').disabled);
   await page.locator('#phase').selectOption('evict-return');await page.locator('#mark').click();assert.equal(await page.evaluate(()=>__streamProfile.lastPhase),'evict-return');
   await page.locator('#open').click();await page.locator('#capture').click();await page.locator('#preview').waitFor({state:'visible'});
   await page.locator('#finish').click();assert.equal(await page.locator('#finish').isDisabled(),true);
   const downloadWait=page.waitForEvent('download');await page.locator('#download').click();const dl=await downloadWait;
   const data=JSON.parse(readFileSync(await dl.path(),'utf8'));assert.equal(data.variant,'candidate');assert.equal(data.source.source,'08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24');assert.equal(data.summary.samples,160);assert.equal(data.validation.protocolComplete,false);
   assert.ok(data.annotations.some(x=>x.type==='canvas-capture'&&x.readiness.ready));assert.deepEqual(errors,[]);
   await page.goto(url);await page.locator('#results').setInputFiles({name:'fixture-result.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(()=>document.querySelector('#comparison td')?.textContent==='B / 2');
   report.engines.push({engine:engine.name(),passed:true,checks:['launcher','relative B link','pending-ready blocks capture','resolved imports allow capture','manual phase','PNG control','JSON download','source and non-certification','JSON import'],gameplayRun:false});
  }finally{await browser.close();}
 }
 report.ok=true;
}finally{writeFileSync(join(output,'ui-tests.json'),JSON.stringify(report,null,2));writeFileSync(join(output,'server.log'),serverLogs.join(''));server.kill();}
console.log('PASS UI-only controls in Chromium and WebKit; no hardware benchmark.');
