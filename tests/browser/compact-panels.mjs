// Real game menu navigation and bounded windows at four supported sizes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.UI_OUT||'work/landmark-review/compact-panels';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});page.setDefaultTimeout(180000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.UI_ORIGIN||'http://127.0.0.1:4178')+'/?fresh=1&seed=9&quality=high&stream=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&document.querySelector('#loading').classList.contains('done'));
 await page.evaluate(()=>{const f=__frontier;f.paused=true;window.__panelDraw=f.view.render.bind(f.view);f.view.render=()=>{};document.querySelector('.banner')?.remove();});
 for(const [width,height]of [[1440,900],[1180,820],[844,390],[390,844]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>__panelDraw(0,2,{}));
  await page.evaluate(()=>__frontier.panels.open('menu'));
  assert.equal(await page.locator('.hub-tile').count(),12);
  for(const id of ['menu','char','craft','shop','journal','map','growth','settings','job']){
   if(id!=='menu')await page.locator(`.hub-tile[data-go="${id}"]`).tap();
   const box=await page.locator('.overlay.on .panel').boundingBox();
   assert.ok(box&&box.x>0&&box.y>0&&box.x+box.width<width&&box.y+box.height<height,`${id} ${width} bounded`);
   assert.ok(box.width*box.height/(width*height)<.87,`${id} leaves scene visible`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
   await page.screenshot({path:`${out}/${id}-${width}x${height}.png`});
   checks.push({id,width,height,box});
   if(id==='job')await page.locator('.skill-journal [data-action="exit"]').tap();
   else if(id!=='menu')await page.locator('.panel-back').tap();
   if(id==='job')await page.evaluate(()=>__frontier.panels.open('menu'));
  }
  await page.locator('.panel-close').tap();assert.equal(await page.locator('.overlay.on').count(),0);
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/report.json',JSON.stringify({quality:'high',checks,errors},null,2));console.log('PASS',checks.length,'bounded real-game panel views');
}finally{await browser.close();}
