// Ordinary bow creation, real HUD shortcuts/settings, isolated save slots and touch hit testing.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const name=process.env.BROWSER==='webkit'?'webkit':'chromium',engine=name==='webkit'?webkit:chromium;
const out=`tests/browser/out/gameplay-qol/${name}/`,port=4273,base=`http://localhost:${port}/`;
mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;const reports=[];
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('preview');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:name==='chromium'?process.env.CHROMIUM_EXECUTABLE:undefined,args:name==='chromium'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 for(const [size,width,height,touch] of [['desktop',1280,800,false],['ipad',1180,820,true],['phone-landscape',844,390,true],['phone-portrait',390,844,true]].filter(c=>!process.env.QOL_VIEW||c[0].startsWith(process.env.QOL_VIEW))){
  console.log('START gameplay QoL',name,size);
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await ctx.newPage(),errors=[];
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(String(e)));
  const activate=s=>touch?page.locator(s).first().tap():page.locator(s).first().click();
  const ready=()=>page.waitForFunction(()=>__frontier.game&&__frontier.modelsReady&&document.querySelector('#loading').classList.contains('done'));
  await page.goto(base+'?quality=low&seed=5&stream=0');await enterFullscreenGate(page);
  await activate('[data-act="new"]');await page.locator('#heroName').fill('QoL bow');await activate('[data-act="start"]');await ready();
  await activate('[data-act="wake"]');await activate('[data-act="kit"][data-kit="bow"]');await activate('[data-act="finish"]');
  await page.waitForFunction(()=>__frontier.game.ch.opening.stage==='done'&&__frontier.weaponModelsReady());
  await page.evaluate(()=>{__frontier.paused=true;__frontier.input.reset();document.querySelector('.banner')?.remove();});
  if(touch)await page.evaluate(()=>{for(const [k,v] of Object.entries({'--safe-t':'12px','--safe-l':'12px','--safe-r':'12px','--safe-b':'20px'}))document.documentElement.style.setProperty(k,v);dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.querySelector('.ammo-count').textContent==='200');
  assert.equal(await page.locator('.auto-potions-hud small').innerText(),'HP ปิด · MP ปิด');
  const hitTargets=['.ammo-hud','.auto-potions-hud','.questtrack','.pframe','.sbtn.attack',...(touch?['.joy']:[])];
  const boxes=await page.evaluate(selectors=>selectors.map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {s,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,hit:(s==='.joy'?document.querySelector('.joyzone'):e).contains(hit)};}),hitTargets);
  await page.screenshot({path:out+size+'-bow-hud.png'});
  for(const b of boxes)assert.ok(b.x>=0&&b.y>=0&&b.right<=width+1&&b.bottom<=height+1&&b.hit,`${size}: ${JSON.stringify(b)}`);
  for(const b of boxes.filter(b=>b.s.includes('hud')))assert.ok(b.w>=44&&b.h>=44,'supply touch target');
  assert.ok(await page.evaluate(()=>{const a=document.querySelector('.ammo-hud').getBoundingClientRect(),f=document.querySelector('.fullscreen-control')?.getBoundingClientRect();return !f||!f.width||!f.height||a.right<=f.left||a.left>=f.right||a.bottom<=f.top||a.top>=f.bottom;}),'ammo crafting action does not overlap fullscreen control');
  assert.equal(await page.evaluate(()=>__frontier.game.castSlot(0)),true);
  await page.waitForFunction(()=>document.querySelector('.ammo-count').textContent==='199');
  await page.evaluate(()=>{const g=__frontier.game;g.player.cast=null;g.player.cooldowns[0]=0;g.ch.arrows.stock={};g.refresh();});
  await page.waitForFunction(()=>document.querySelector('.ammo-hud').classList.contains('empty'));
  assert.equal(await page.evaluate(()=>__frontier.game.castSlot(0)),false);
  await activate('.ammo-hud');
  assert.deepEqual(await page.evaluate(()=>({tab:__frontier.panels.tab,category:__frontier.panels.sel.craft,type:__frontier.game.data.recipes.recipes[__frontier.panels.sel.craftRecipe].type})),{tab:'craft',category:'arrow',type:'arrow'});
  await page.evaluate(()=>{const f=__frontier,g=f.game,r=g.data.recipes.recipes[f.panels.sel.craftRecipe];g.monsters=[];g.player.combatT=0;g.ch.gold=500;for(const [id,n] of Object.entries(r.cost))if(id!=='gold')g.ch.materials[id]=n*2;f.panels.render();});
  const before=await page.evaluate(()=>{const f=__frontier,g=f.game;return {gold:g.ch.gold,materials:{...g.ch.materials},recipe:g.data.recipes.recipes[f.panels.sel.craftRecipe]};});
  await activate('[data-act="craft-arrows"]');
  const crafted=await page.evaluate(()=>({gold:__frontier.game.ch.gold,materials:__frontier.game.ch.materials,stock:__frontier.game.ch.arrows.stock}));
  assert.equal(crafted.stock[before.recipe.result],before.recipe.qty);
  for(const [id,n] of Object.entries(before.recipe.cost))assert.equal(id==='gold'?crafted.gold:crafted.materials[id],(id==='gold'?before.gold:before.materials[id])-n);
  await page.screenshot({path:out+size+'-arrow-crafting.png'});await activate('.panel-close');
  await activate('.auto-potions-hud');
  assert.equal(await page.locator('[data-auto-field="enabled"]:checked').count(),0);
  for(const group of ['hp','mp']){
   await page.locator(`[data-auto-group="${group}"][data-auto-field="threshold"]`).fill(group==='hp'?'42':'18');
   await page.locator(`[data-auto-group="${group}"][data-auto-field="potion"]`).selectOption(group+'_potion_s');
   await activate(`[data-auto-group="${group}"][data-auto-field="enabled"]`);
  }
  await page.evaluate(()=>{const g=__frontier.game;g.player.hp=1;g.player.mp=0;g.player.itemCooldowns={};});
  const counts=await page.evaluate(()=>({...__frontier.game.ch.consumables}));await page.waitForTimeout(120);
  assert.deepEqual(await page.evaluate(()=>({...__frontier.game.ch.consumables})),counts,'open menu never consumes');
  await page.screenshot({path:out+size+'-auto-potions.png'});await activate('.panel-close');
  await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>({...__frontier.game.ch.consumables})),counts,'explicit pause never consumes');
  await page.evaluate(()=>{const g=__frontier.game;g.monsters=[];g.derived.hpRegen=g.derived.mpRegen=0;g.isSafe=()=>false;__frontier.paused=false;});
  await page.waitForFunction(()=>__frontier.game.ch.consumables.hp_potion_s===4&&__frontier.game.ch.consumables.mp_potion_s===2);
  await page.evaluate(()=>{__frontier.paused=true;__frontier.save();});
  const settings=await page.evaluate(()=>structuredClone(__frontier.game.ch.autoPotions));
  await page.reload();await enterFullscreenGate(page);await activate('[data-act="continue"]');await ready();
  await page.evaluate(()=>{__frontier.paused=true;document.querySelector('.banner')?.remove();});
  assert.deepEqual(await page.evaluate(()=>__frontier.game.ch.autoPotions),settings);
  assert.equal(await page.evaluate(()=>__frontier.game.ch.consumables.hp_potion_s),4,'reload does not duplicate a use');
  assert.deepEqual(errors,[]);reports.push({size,width,height,touch,ordinaryCreation:true,ammoConsumption:true,craftSpend:true,pause:true,settingsReload:true,boxes});
  writeFileSync(out+size+'-report.json',JSON.stringify(reports.at(-1),null,2));
  writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS gameplay QoL',name,size);await ctx.close();
 }
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
