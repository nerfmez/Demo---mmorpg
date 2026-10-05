// Focused actual renderer sequence; fixed simulation cadence is not device FPS.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const skills=process.argv.slice(2);if(!skills.length)skills.push('frost_nova');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const skill of skills){
 const out=new URL(`./out/approved-${skill}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
 const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`HTTP ${r.status()} ${r.url()}`);});
 await page.goto(`http://localhost:4192/lab.html?skill=${skill}`);await page.waitForFunction(()=>window.__lab);await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{const L=__lab;L.state.paused=true;L.state.speed=1;L.state.zoom=.65;L.cast();});
 const samples=[];
 for(let f=0;f<(skill==='healing_spring'?150:72);f++){
  await page.evaluate(()=>{__lab.step(1/30);});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:`${out}/frame-${String(f).padStart(3,'0')}.png`});
  samples.push(await page.evaluate(()=>({active:__lab.vfx.active.length+__lab.vfx.areas.size+__lab.vfx.projectiles.size,cast:!!__lab.vfx.castFrost,geometries:__lab.stats().geometries})));
 }
 assert(samples.some(s=>s.active),'effect never appeared');assert.equal(samples.at(-1).active,0,'effect did not expire');assert.equal(samples.at(-1).cast,false);
 await page.setViewportSize({width:768,height:1024});await page.evaluate(()=>{__lab.cast();for(let i=0;i<24;i++)__lab.step(1/60);});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:`${out}/portrait.png`});
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(`${out}/report.json`,JSON.stringify({skill,errors,samples,viewports:[[960,640],[768,1024]],review:'sequential frames; 30 Hz simulation'},null,2));
 console.log(JSON.stringify({skill,ok:true,errors}));await page.close();
}}finally{await browser.close();}
