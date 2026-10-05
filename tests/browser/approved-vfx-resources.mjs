// Bounded ownership probe for the new effects, including actor afterimages.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const results=[];
try{for(const skill of ['dash','blink','healing_spring','spirit_wolf','stone_burst','frost_nova','chain_spark','war_cry']){
 const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto(`http://localhost:4192/lab.html?skill=${skill}`);await page.waitForFunction(()=>window.__lab);await page.waitForLoadState('networkidle');await page.evaluate(()=>{__lab.state.paused=true;});
 const batch=async n=>{for(let c=0;c<n;c++){
  await page.evaluate(()=>__lab.cast());
  for(let i=0;i<12;i++){await page.evaluate(()=>__lab.step(.1));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
  await page.evaluate(()=>{for(let i=0;i<60;i++)__lab.step(.1);});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 }return page.evaluate(()=>({geometries:__lab.stats().geometries,active:__lab.vfx.active.length,areas:__lab.vfx.areas.size}));};
 const warm=await batch(2),repeat=await batch(3);assert.equal(repeat.geometries,warm.geometries,skill+' geometry growth');assert.equal(repeat.active,0);assert.equal(repeat.areas,0);results.push({skill,warm,repeat});console.log(JSON.stringify(results.at(-1)));await page.close();
}}finally{await browser.close();mkdirSync(new URL('./out/',import.meta.url),{recursive:true});writeFileSync(new URL('./out/approved-resources.json',import.meta.url),JSON.stringify(results,null,2));}
