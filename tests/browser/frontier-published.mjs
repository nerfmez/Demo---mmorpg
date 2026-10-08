// Opt-in publication verification. A new browser context owns all test saves.
// Ingredient/stat seeding is test-only; skill/mod ownership must come from crafting.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
import {completeOpeningUi} from './opening-helper.mjs';
import {freezeScene} from './freeze-scene.mjs';
const base=process.env.FRONTIER_URL,sha=process.env.FRONTIER_RELEASE_SHA;
assert(base&&/^https?:\/\//.test(base),'FRONTIER_URL is required');
assert(/^[a-f0-9]{40}$/.test(sha||''),'Exact FRONTIER_RELEASE_SHA is required');
const out=process.env.FRONTIER_OUT||'tests/browser/out/frontier-published';mkdirSync(out,{recursive:true});
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const proxyServer=base.startsWith('https:')&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);
const browser=await engine.launch({proxy:proxyServer?{server:proxyServer}:undefined,executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});
const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const activate=selector=>page.locator(selector).first().tap();
const ready=()=>page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game&&document.querySelector('#loading')?.classList.contains('done'));
try{
 const response=await ctx.request.get(new URL('ci-release.json?verify='+sha,base).href);assert(response.ok(),'release receipt');
 const receipt=await response.json();assert.equal(receipt.releaseTarget.sha,sha,'published target');
 const source=await ctx.request.get(new URL('ci-source.txt?verify='+sha,base).href);assert(source.ok());assert.equal((await source.text()).trim(),receipt.buildOrigin.sha,'build origin marker');
 const url=new URL(base);url.searchParams.set('quality','low');url.searchParams.set('stream','0');url.searchParams.set('release',sha);
 await page.goto(url.href);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
 await activate('[data-act="new"]');await page.locator('#heroName').fill('PR102 isolated release check');await activate('[data-act="start"]');await ready();
 await completeOpeningUi(page,activate,{kit:'bow'});await page.evaluate(()=>{__frontier.paused=true;__frontier.input.reset();});await freezeScene(page);
 assert.deepEqual(await page.evaluate(()=>__frontier.game.ch.skills),{hunter_shot:1});assert.equal(await page.locator('.skill-sandbox').count(),0);
 assert.deepEqual(await page.evaluate(()=>__frontier.game.ch.mods),[]);
 const crafted=[];
 for(const id of ['learn_charged_shot','learn_roll','mod_short_stride','mod_returning_shot']){
  await page.evaluate(id=>{const f=__frontier,g=f.game,r=g.data.recipes.recipes[id],w=g.data.world.town.workbench;g.player.x=w[0];g.player.z=w[1];g.monsters=[];g.ch.gold=0;g.ch.materials={};f.panels.lastResult=null;f.panels.sel.craft=r.type;f.panels.sel.craftRecipe=id;f.panels.open('craft');},id);
  assert(await page.locator('[data-act="craft"]').isDisabled(),'insufficient materials');
  await page.evaluate(id=>{const f=__frontier,g=f.game,r=g.data.recipes.recipes[id];for(const[k,n]of Object.entries(r.cost))if(k==='gold')g.ch.gold=n;else g.ch.materials[k]=n;f.panels.render();},id);
  await activate('[data-act="craft"]');
  const result=await page.evaluate(id=>{const g=__frontier.game,r=g.data.recipes.recipes[id];return {gold:g.ch.gold,materials:g.ch.materials,owned:r.type==='skill'?!!g.ch.skills[r.result]:r.type==='movement'?g.ch.movementSkills.includes(r.result):g.ch.mods.some(m=>m.id===r.result)};},id);
  assert(result.owned,id);assert.equal(result.gold,0,id);assert(Object.values(result.materials).every(n=>n===0),id);assert(await page.locator('[data-act="craft"]').isDisabled());crafted.push(id);
 }
 console.log('PASS normal crafting and exact payment');
 await page.screenshot({path:out+'/ipad-crafted.png'});
 await page.evaluate(()=>{const f=__frontier;f.game.ch.stats={STR:30,DEX:30,INT:30,VIT:30,AGI:30};f.game.refresh();f.panels.close();f.panels.open('skills');});
 for(let n=0;!await page.locator('[data-action="skill"][data-id="charged_shot"]').count();n++){assert(n<3,'charged-shot library page');await activate('#atelier [data-action="next"]');}
 await activate('[data-action="skill"][data-id="charged_shot"]');await activate('[data-action="apply"]');await activate('[data-action="confirm"]');
 await activate('[data-action="category"][data-id="mod"]');
 const returning=await page.evaluate(()=>__frontier.game.ch.mods.find(m=>m.id==='returning_shot').uid);
 await activate(`[data-action="mod"][data-id="${returning}"]`);await activate('[data-action="apply"]');
 await activate('[data-action="category"][data-id="movement"]');await activate('[data-action="skill"][data-id="roll"]');await activate('[data-action="apply"]');await activate('[data-action="movement-mod"]');
 const state=await page.evaluate(()=>{const f=__frontier,g=f.game;f.panels.close();f.save();return {skills:g.ch.skills,mods:g.ch.mods,slots:g.ch.slots,movement:g.ch.movement,movementMods:g.ch.movementMods,nextUid:g.ch.nextUid,autoPotions:g.ch.autoPotions,jobNodes:g.ch.jobNodes,jobPoints:g.ch.jobPoints,treeRevision:g.ch.treeRevision,version:g.ch.version};});
 assert.equal(state.movement,'roll');assert.equal(state.movementMods.length,1);assert(state.slots.some(s=>s.skill==='charged_shot'&&s.mods.includes(returning)));
 console.log('PASS loadout and movement sockets; reloading isolated save');
 await page.reload();await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);await activate('[data-act="continue"]');await ready();
 await page.evaluate(()=>{__frontier.paused=true;__frontier.input.reset();});
 const loaded=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,__frontier.game.ch[k]])),Object.keys(state));assert.deepEqual(loaded,state,'save/reload preserves crafted loadout and tree');
 assert(await page.locator('.sbtn.attack [data-art="skill/charged_shot"] svg').count(),'charged icon');
 const charge=await page.evaluate(()=>{
  const g=__frontier.game,s=g.skills[0],p=g.player;g.monsters=[];g.derived.mpRegen=0;
  const arrows=()=>Object.values(g.ch.arrows.stock).reduce((a,b)=>a+b,0),before={mp:p.mp,arrows:arrows()};
  const began=g.castSlot(0);for(let i=0;i<60;i++)g.update(.02);
  const held={mp:p.mp,arrows:arrows()},released=g.releaseCharge(0),after={mp:p.mp,arrows:arrows()},again=g.releaseCharge(0);
  return {began,released,again,before,held,after,cost:s.cost};
 });
 assert(charge.began&&charge.released&&!charge.again);assert.deepEqual(charge.held,charge.before);assert.equal(charge.after.mp,charge.before.mp-charge.cost);assert.equal(charge.after.arrows,charge.before.arrows-1);
 await page.screenshot({path:out+'/ipad-reloaded.png'});assert.deepEqual(errors,[]);
 const report={url:url.href,receipt,engine:engine.name(),isolatedContext:true,normalStart:true,crafted,insufficientResources:true,exactPayment:true,loadout:state,reload:true,charge,pageErrors:errors};writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await ctx.close();await browser.close();}
