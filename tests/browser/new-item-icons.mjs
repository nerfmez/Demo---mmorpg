// Focused real-game PNG review. Build first; no workflow or deployment changes.
// CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/new-item-icons.mjs
// BROWSER=webkit node tests/browser/new-item-icons.mjs (when WebKit is installed)
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=new URL(`./out/new-item-icons/${engine.name()}/`,import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const port=4227,base=`http://localhost:${port}/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
const materials=['mantis_scythe','viper_scale','ram_horn','dusk_pelt','rune_core'];
const errors=[],badResponses=[],report={engine:engine.name(),views:[],errors,badResponses};
let browser;
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>80)throw Error('preview server');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 for(const [size,width,height]of [['ipad',1180,820],['phone-landscape',844,390]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/assets/icons/')&&r.status()!==200)badResponses.push({url:r.url(),status:r.status()});});
  await page.goto(base+'?fresh=1&seed=9&quality=low&stream=0');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.3&&document.getElementById('loading').classList.contains('done'));
  await page.evaluate(ids=>{
   const f=__frontier,g=f.game;document.querySelector('.banner')?.remove();g.monsters=[];g.ch.gold=100000;
   g.ch.materials=Object.fromEntries([...ids,'boar_hide'].map(id=>[id,30]));
   for(const id of Object.keys(g.data.items.consumables.types))g.ch.consumables[id]=10;
   Object.assign(g.player,g.freeSpotNear(...g.data.world.town.shop));g.refresh();f.view.snapCamera();
  },materials);
  await freezeScene(page);
  const view={size,width,height,bag:[],craft:[],potions:[],artifacts:[],inspectedAt:new Date().toISOString()};report.views.push(view);
  const capture=async label=>{
   await page.locator('.art>img').evaluateAll(nodes=>Promise.all(nodes.filter(n=>n.getClientRects().length).map(n=>n.decode())));
   const filename=`${size}-${label}.png`;await page.screenshot({path:out+filename});view.artifacts.push(filename);
  };
  const decode=async(selector,key)=>{
   const images=await page.locator(selector).evaluateAll(async nodes=>{await Promise.all(nodes.map(n=>n.decode()));return nodes.map(n=>({key:n.parentElement.dataset.art,width:n.naturalWidth,height:n.naturalHeight,rendered:n.getBoundingClientRect().width}));});
   assert.ok(images.some(i=>i.key===key),'missing '+key);
   for(const i of images){assert.deepEqual([i.width,i.height],[512,512]);assert.ok(i.rendered>=20,'undersized '+i.key);}
   return images;
  };
  await page.evaluate(()=>__frontier.panels.open('bag'));
  await page.locator('#atelier [data-action="bag-category"][data-id="material"]').tap();
  for(const id of materials){await decode(`#atelier [data-art="material/${id}"]>img`,'material/'+id);view.bag.push(id);}
  await capture('bag');
  for(const id of materials){
   const recipe=await page.evaluate(id=>{const p=__frontier.panels,r=Object.entries(__frontier.game.data.recipes.recipes).find(([,r])=>r.cost[id]);if(!r)throw Error('no recipe for '+id);p.sel.craftRecipe=r[0];p.open('craft');return r[0];},id);
   await decode(`.pbody[data-panel=craft] [data-art="material/${id}"]>img`,'material/'+id);view.craft.push({id,recipe});
  }
  await page.locator('.pbody[data-panel=craft] [data-art="material/rune_core"]').first().scrollIntoViewIfNeeded();
  await capture('craft');
  await page.evaluate(()=>__frontier.panels.open('shop'));
  const potionIds=await page.evaluate(()=>Object.keys(__frontier.game.data.items.consumables.types));
  for(const id of potionIds)await decode(`.shop-item [data-art="consumable/${id}"]>img`,'consumable/'+id);
  await page.locator('.shop-item [data-art="consumable/hp_potion_s"]').scrollIntoViewIfNeeded();
  await capture('shop');
  await page.locator('.shop-item [data-art="consumable/mp_potion_s"]').scrollIntoViewIfNeeded();
  await capture('shop-mana');
  for(const id of potionIds){
   await page.evaluate(()=>__frontier.panels.open('shop'));
   await page.locator('[data-act=quick-select][data-slot="3"]').tap();
   const assign=page.locator(`[data-act=quick-assign][data-id="${id}"]`);
   await assign.scrollIntoViewIfNeeded();await assign.tap();
   const slot=await decode('.quick-slot[data-slot="3"] .potion-art>img','consumable/'+id);
   assert.equal(slot[0].rendered,44);
   await page.locator('.panel-close').tap();
   await decode('#hud .qbtn:nth-child(4) .potion-art>img','consumable/'+id);
   await page.evaluate(()=>{const p=__frontier.game.player;p.hp=1;p.mp=1;p.itemCooldowns.hp=0;p.itemCooldowns.mp=0;});
   await page.locator('#hud .quickbar .qbtn').nth(3).tap();
   await page.waitForFunction(id=>__frontier.game.ch.consumables[id]===9,id);
   const use=await page.evaluate(id=>{const g=__frontier.game,group=g.data.items.consumables.types[id].group;return {id,count:g.ch.consumables[id],restored:g.player[group],cooldown:g.player.itemCooldowns[group]};},id);
   assert.ok(use.restored>1);assert.ok(use.cooldown>0);view.potions.push(use);
  }
  await page.evaluate(()=>{const f=__frontier;f.game.ch.quickItems=['hp_potion_s','hp_potion_m','hp_potion_l','mp_potion_l'];f.game.player.itemCooldowns.hp=0;f.game.player.itemCooldowns.mp=0;f.input.refreshButtons();});
  await page.waitForTimeout(350); // release the final touch button's active scale before measuring
  await page.locator('#hud .qbtn .potion-art>img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
  const hud=await page.evaluate(()=>{
   const hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
   const bar=document.querySelector('#hud .quickbar').getBoundingClientRect();
   const overlaps=[...document.querySelectorAll('#hud .combat .sbtn,#hud .quest-widget,#hud .prompt')].filter(e=>e.getClientRects().length&&hit(bar,e.getBoundingClientRect())).map(e=>e.className);
   const icons=[...document.querySelectorAll('#hud .qbtn .potion-art>img')].map(img=>{const r=img.getBoundingClientRect(),b=img.closest('.qbtn').getBoundingClientRect();return {key:img.parentElement.dataset.art,width:r.width,height:r.height,inside:r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom};});
   return {overlaps,icons,overflow:document.documentElement.scrollWidth>innerWidth+2};
  });
  assert.deepEqual(hud.overlaps,[]);assert.equal(hud.overflow,false);assert.ok(hud.icons.every(i=>i.inside&&i.width>=20));view.hud=hud;
  await capture('quickslots');await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);report.ok=true;
 console.log(JSON.stringify(report,null,2));
}finally{
 writeFileSync(out+'report.json',JSON.stringify(report,null,2));
 await browser?.close();process.kill(-server.pid);
}
