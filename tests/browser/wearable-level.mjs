// Real rendered game: craft under level, inspect/equip at threshold, preserve save ownership.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=new URL(`./out/wearable-level-${engine.name()}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
const port=4228,url=`http://localhost:${port}/?fresh=1&quality=low&seed=5&stream=0`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;
try{
 for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const report=[];
 for(const [name,width,height,touch]of [['desktop',1440,900,false],['ipad',1180,820,true],['phone',390,844,true]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>__frontier?.game?.time>.3&&document.getElementById('loading').classList.contains('done'),null,{timeout:90000});await freezeScene(page);
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  const tap=async s=>{const l=page.locator(s).first();await(touch?l.tap():l.click());};
  const shot=async n=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+name+'-'+n+'.png'});};
  const open=async recipe=>page.evaluate(recipe=>{const f=__frontier,g=f.game;g.ch.gold=100000;for(const k in g.data.items.materials)g.ch.materials[k]=500;g.ch.level=1;const p=g.data.world.town.workbench;g.player.x=p[0];g.player.z=p[1];g.refresh();f.panels.sel.craft='armor';f.panels.sel.craftRecipe=recipe;f.panels.open('craft');},recipe);
  await open('tide_boots');assert.match(await page.locator('.craft-controls [data-required-level]').innerText(),/ต้อง Lv.1 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('[data-act="craft"]').isEnabled());
  await tap('[data-act="craft"]');assert.ok(await page.locator('[data-act="equip-gear"]').isEnabled());await shot('tide-walkers');
  await open('sporeweave_vest');assert.match(await page.locator('.craft-controls [data-required-level]').innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('[data-act="craft"]').isEnabled());await tap('[data-act="craft"]');assert.ok(await page.locator('[data-act="equip-gear"]').isDisabled());
  await shot('underlevel-craft');if(name==='phone')await page.setViewportSize({width:844,height:390});await tap('[data-act="inspect-crafted"]');
  assert.match(await page.locator('.selection-shelf [data-required-level]').innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('.selection-shelf [data-action="equip"]').isDisabled());await shot('underlevel-bag');
  await tap('.selection-shelf [data-action="details"]');assert.match(await page.locator('.atelier-dialog [data-required-level]').first().innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);
  await page.evaluate(()=>{const f=__frontier;f.panels.close();f.game.ch.level=6;f.game.refresh();f.panels.open('bag');});assert.ok(await page.locator('.selection-shelf [data-action="equip"]').isEnabled());await tap('.selection-shelf [data-action="equip"]');
  assert.equal(await page.evaluate(()=>__frontier.game.ch.equipped.armor),await page.evaluate(()=>__frontier.game.ch.gear.find(i=>i.base==='sporeweave_vest').uid));await shot('exact-level-equipped');await tap('.selection-shelf [data-action="details"]');await tap('.atelier-dialog [data-act="forge-open"][data-mode="grade"]');assert.equal(await page.locator('.ws-warning').count(),0);assert.match(await page.locator('[data-forge-detail]').innerText(),/เลเวลที่ต้องการคงเดิม/);await shot('fixed-level-upgrades');
  await page.evaluate(()=>{const f=__frontier;f.panels.close();f.game.ch.progress.equipmentNotice='เงื่อนไขสวมใส่ไม่ถึง: เก็บอุปกรณ์ไว้ในกระเป๋าครบ · เสื้อกลสปอร์';f.panels.lastResult=null;f.panels.open('bag');});assert.match(await page.locator('.atelier-notice').innerText(),/กระเป๋าครบ/);await shot('returned-items-notice');
  assert.deepEqual(errors,[]);report.push({name,width,height,ok:true,pageErrors:errors,bagViewport:name==='phone'?[844,390]:[width,height]});writeFileSync(out+'report.json',JSON.stringify(report,null,2));await ctx.close();console.log('PASS wearable level',name);
 }
}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
