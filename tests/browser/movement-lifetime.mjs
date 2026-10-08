// Focused Skill Lab ownership/reset check for retained movement resources.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync,writeFileSync } from 'node:fs';
const out=process.env.MOVEMENT_LAB_OUT||'/tmp/movement-lab';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
try{for(const skill of (process.argv.length>2?process.argv.slice(2):['dash','roll','blink','leap'])){
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.MOVEMENT_LAB_URL||'http://localhost:4192/lab.html')+'?skill='+skill);await page.waitForFunction(()=>window.__lab);await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{const L=__lab;L.state.paused=true;window.sourceFreed=0;window.watchedGeometry=new WeakSet();});
 const samples=[];
 for(let use=0;use<3;use++){
  await page.evaluate(()=>{__lab.view.hero.traverse(o=>{if(o.geometry&&!watchedGeometry.has(o.geometry)){watchedGeometry.add(o.geometry);o.geometry.addEventListener('dispose',()=>sourceFreed++);}});__lab.cast();for(let f=0;f<7;f++)__lab.step(1/60);});
  if(use===0){await page.screenshot({path:out+'/'+skill+'-start.png'});await page.evaluate(()=>{for(let f=0;f<24;f++)__lab.step(1/60);});await page.screenshot({path:out+'/'+skill+'-transition.png'});}
  const sample=await page.evaluate(()=>{const L=__lab;const hadActive=L.vfx.active.length,before=sourceFreed;L.clear();return {hadActive,sourceFreed:sourceFreed-before,active:L.vfx.active.length,echoLive:L.vfx.echoPool?.live.size||0,poolLive:[...L.vfx.movementPools.values()].reduce((n,p)=>n+p.live.size,0)};});
  assert.equal(sample.sourceFreed,0,skill+' clear must not dispose borrowed hero geometry');assert.equal(sample.active,0);assert.equal(sample.echoLive,0);assert.equal(sample.poolLive,0);samples.push(sample);
 }
 if(skill==='dash'||skill==='blink'){
  const rebuild=await page.evaluate(()=>{const L=__lab;L.cast();for(let f=0;f<7;f++)L.step(1/60);const old=L.vfx.echoPool;L.setWeapon('sword');return {oldLive:old.live.size,oldIdle:old.idle.length,retired:L.vfx.echoPool===null};});
  assert.deepEqual(rebuild,{oldLive:0,oldIdle:0,retired:true});
 }
 assert.deepEqual(errors,[]);results.push({skill,samples,errors});console.log('PASS movement ownership',skill);await page.close();
}}finally{await browser.close();writeFileSync(out+'/report.json',JSON.stringify(results,null,2));}
