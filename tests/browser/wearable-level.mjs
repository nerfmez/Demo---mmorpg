// Real rendered game: craft under level, inspect/equip at threshold, preserve save ownership.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
import {loadData} from '../../src/core/data-node.js';
import {createRng} from '../../src/core/rng.js';
import {rollGear} from '../../src/core/crafting.js';
// Seed the real craft RNG while its panel pauses simulation. Do not force a grade
// or fabricate options: every grade still comes through the normal craft action.
const data=loadData(),gradeSeeds=[['C',7],['B',1],['A',4],['S',43]];
assert.deepEqual(gradeSeeds.map(([grade])=>grade),data.items.grades.order);
const expectedRolls=gradeSeeds.map(([grade,seed])=>{
 const item=rollGear(data,data.recipes.recipes.sporeweave_vest,createRng(seed));
 assert.equal(item.grade,grade,`craft seed ${seed}`);return {grade,seed,item};
});
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
  const upgradeRequirements=async()=>{
   const dialog=page.locator('.atelier-dialog'),cost=dialog.locator('.upgrade-cost');
   assert.equal(await dialog.locator('.wear-warning').count(),0);
   assert.equal(await cost.locator('[data-required-level]').getAttribute('data-required-level'),'6');
   assert.equal(await cost.locator('[data-required-level]').innerText(),'ต้อง Lv.6 · ปัจจุบัน Lv.6');
   assert.deepEqual(await cost.locator('.upgrade-track li b').allTextContents(),Array.from({length:data.items.upgrade.max},(_,i)=>`+${i+1}`));
   assert.deepEqual(await cost.locator('.upgrade-track li small').allTextContents(),Array(data.items.upgrade.max).fill('Lv.6'));
   assert.ok(await dialog.locator('[data-act="gear-up"]').isEnabled());
  };
  const snapshot=()=>page.evaluate(()=>{
   const {game:g}=__frontier,ch=g.ch;
   return {gold:ch.gold,materials:{...ch.materials},gear:structuredClone(ch.gear),nextUid:ch.nextUid,equipped:ch.equipped.armor};
  });
  const paidOnce=(before,after,cost)=>{
   assert.equal(after.gold,before.gold-(cost.gold||0));
   assert.deepEqual(after.materials,Object.fromEntries(Object.entries(before.materials).map(([id,n])=>[id,n-(cost[id]||0)])));
  };
  const open=async recipe=>page.evaluate(recipe=>{const f=__frontier,g=f.game;g.ch.gold=100000;for(const k in g.data.items.materials)g.ch.materials[k]=500;g.ch.level=1;const p=g.data.world.town.workbench;g.player.x=p[0];g.player.z=p[1];g.refresh();f.panels.sel.craft='armor';f.panels.sel.craftRecipe=recipe;f.panels.open('craft');},recipe);
  await open('tide_boots');assert.match(await page.locator('.craft-controls [data-required-level]').innerText(),/ต้อง Lv.1 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('[data-act="craft"]').isEnabled());
  await tap('[data-act="craft"]');assert.ok(await page.locator('[data-act="equip-gear"]').isEnabled());await shot('tide-walkers');
  await open('sporeweave_vest');assert.match(await page.locator('.craft-controls [data-required-level]').innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('[data-act="craft"]').isEnabled());await tap('[data-act="craft"]');assert.ok(await page.locator('[data-act="equip-gear"]').isDisabled());
  await shot('underlevel-craft');if(name==='phone')await page.setViewportSize({width:844,height:390});await tap('[data-act="inspect-crafted"]');
  assert.match(await page.locator('.selection-shelf [data-required-level]').innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);assert.ok(await page.locator('.selection-shelf [data-action="equip"]').isDisabled());await shot('underlevel-bag');
  await tap('.selection-shelf [data-action="details"]');assert.match(await page.locator('.atelier-dialog [data-required-level]').first().innerText(),/ต้อง Lv.6 · ปัจจุบัน Lv.1/);
  await page.evaluate(()=>{const f=__frontier;f.panels.close();f.game.ch.level=6;f.game.refresh();f.panels.open('bag');});assert.ok(await page.locator('.selection-shelf [data-action="equip"]').isEnabled());await tap('.selection-shelf [data-action="equip"]');
  assert.equal(await page.evaluate(()=>__frontier.game.ch.equipped.armor),await page.evaluate(()=>__frontier.game.ch.gear.find(i=>i.base==='sporeweave_vest').uid));await shot('exact-level-equipped');await tap('.selection-shelf [data-action="details"]');await upgradeRequirements();await shot('fixed-level-upgrades');
  const gradeCases=[];
  for(const {grade,seed,item:expected} of expectedRolls){
   await page.evaluate(seed=>{
    const f=__frontier,g=f.game;f.panels.close();g.ch.level=6;g.ch.gold=100000;
    for(const id in g.data.items.materials)g.ch.materials[id]=500;
    g.refresh();f.panels.sel.craft='armor';f.panels.sel.craftRecipe='sporeweave_vest';f.panels.open('craft');g.rng.state=seed;
   },seed);
   const before=await snapshot();await tap('[data-act="craft"]');const crafted=await snapshot(),uid=before.nextUid;
   paidOnce(before,crafted,data.recipes.recipes.sporeweave_vest.cost);
   assert.equal(crafted.nextUid,uid+1);assert.equal(crafted.gear.length,before.gear.length+1);
   assert.deepEqual(crafted.gear.find(i=>i.uid===uid),{uid,...expected});
   await tap('[data-act="inspect-crafted"]');assert.ok(await page.locator('.selection-shelf [data-action="equip"]').isEnabled());
   await tap('.selection-shelf [data-action="equip"]');assert.equal((await snapshot()).equipped,uid);
   await tap('.selection-shelf [data-action="details"]');await upgradeRequirements();
   const promotion=page.locator('.atelier-dialog .grade-promotion');
   if(grade==='S'){
    assert.equal(await page.locator('.atelier-dialog [data-act="gear-grade"]').count(),0);
    assert.match(await promotion.innerText(),new RegExp(`เกรดสูงสุด · ${data.items.grades.optionCount.S} ออฟชั่น`));
   }else{
    assert.match(await promotion.innerText(),/เลเวลที่ต้องการคงเดิม/);
    assert.equal(await promotion.locator('[data-required-level]').getAttribute('data-required-level'),'6');
   }
   await shot(`grade-${grade}-fixed-level`);
   for(let rank=0;rank<data.items.upgrade.max;rank++){
    await upgradeRequirements();const beforeUpgrade=await snapshot();
    assert.equal(beforeUpgrade.gear.find(i=>i.uid===uid).upgrade,rank);
    await tap('.atelier-dialog [data-act="gear-up"]');const afterUpgrade=await snapshot();
    paidOnce(beforeUpgrade,afterUpgrade,data.items.upgrade.cost[rank]);
    assert.deepEqual(afterUpgrade.gear,beforeUpgrade.gear.map(i=>i.uid===uid?{...i,upgrade:rank+1}:i));
    assert.equal(afterUpgrade.nextUid,beforeUpgrade.nextUid);assert.equal(afterUpgrade.equipped,uid);
    assert.equal(await page.locator('.atelier-dialog .wear-warning').count(),0);
   }
   assert.equal(await page.locator('.atelier-dialog [data-act="gear-up"]').count(),0);
   assert.equal(await page.locator('.atelier-dialog .upgrade-cost').count(),0);
   await shot(`grade-${grade}-max-upgrade`);gradeCases.push({grade,seed,uid,upgradedTo:data.items.upgrade.max,requiredLevel:6});
  }
  await page.evaluate(()=>{const f=__frontier;f.panels.close();f.game.ch.level=1;f.game.refresh();f.panels.lastResult=null;f.panels.open('bag');});assert.match(await page.locator('.atelier-notice').innerText(),/สถานะไม่ได้ใช้/);await shot('inactive-items-notice');
  assert.deepEqual(errors,[]);report.push({name,width,height,ok:true,pageErrors:errors,gradeCases,bagViewport:name==='phone'?[844,390]:[width,height]});writeFileSync(out+'report.json',JSON.stringify(report,null,2));await ctx.close();console.log('PASS wearable level',name);
 }
}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
