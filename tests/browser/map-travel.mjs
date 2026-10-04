// Azure north-road gate -> Greenhollow Frontier -> back, through the real HUD prompt
// and page reload. Checks the saved slot, per-map discovery and that only one map is built.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {loadData} from '../../src/core/data-node.js';
import {createCharacter} from '../../src/core/character.js';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const data=loadData(),AZURE='azure-harbor-v1',FRONTIER='frontier-wilds-v1';
const character=createCharacter(data,{name:'นักเดินทาง'});Object.assign(character,{gold:777,level:6});
const url=process.env.TRAVEL_URL||'http://localhost:4196/?quality=low&seed=3',out=new URL(`./out/map-travel-${process.env.BROWSER||'chromium'}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=process.env.TRAVEL_URL?null:spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4196','--strictPort'],{stdio:'ignore',detached:true});
if(server)for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('travel server startup');await new Promise(r=>setTimeout(r,250));}
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await context.addInitScript(character=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character}));localStorage.setItem('frontier.lastSlot','1');}},character);
const ready=()=>page.waitForFunction(()=>window.__frontier?.game?.time>.3&&document.getElementById('loading').classList.contains('done'),null,{timeout:120000});
const travelFrom=async(name)=>{
  // Walk onto the gate, then use the HUD button (the touch path).
  await page.evaluate(()=>{const g=__frontier.game,e=g.world.exits[0];g.player.x=e.x;g.player.z=e.z+1;__frontier.view.snapCamera();});
  const button=page.locator('#hud .pbtn',{hasText:'เดินทางไป'});await button.waitFor();
  await page.screenshot({path:out+name+'-gate.png'});
  await Promise.all([page.waitForEvent('load'),button.tap()]);
  await page.waitForFunction(()=>window.__frontier?.fullscreen);await enterFullscreenGate(page);
  await ready();
};
try{
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  await page.locator('[data-act="continue"]').click();await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),AZURE);
  await travelFrom('azure');
  const there=await page.evaluate(()=>({map:__frontier.world.data.id,x:__frontier.game.player.x,z:__frontier.game.player.z,city:!!__frontier.view.cityRoot,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character}));
  assert.equal(there.map,FRONTIER);assert.equal(there.city,false,'the Azure city is not built on the Frontier');
  assert.deepEqual([there.x,there.z],data.maps[AZURE].exits[0].arrive);
  assert.equal(there.slot.worldId,FRONTIER);assert.equal(there.slot.gold,777);assert.equal(there.slot.level,6);
  assert.ok(there.slot.progress.maps[AZURE],'Azure discovery is stored');
  await page.evaluate(()=>{__frontier.view.zoom=1.5;});await page.waitForTimeout(1500);await page.screenshot({path:out+'frontier-arrival.png'});
  // Continue from the title also reopens the Frontier.
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  await Promise.all([page.waitForEvent('load'),page.locator('[data-act="continue"]').click()]);
  await page.waitForFunction(()=>window.__frontier?.fullscreen);await enterFullscreenGate(page);await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),FRONTIER,'Continue returns to the saved map');
  await travelFrom('frontier');
  const home=await page.evaluate(()=>({map:__frontier.world.data.id,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character}));
  assert.equal(home.map,AZURE);assert.equal(home.slot.worldId,AZURE);assert.ok(home.slot.progress.maps[FRONTIER].zones.includes('settlement'));
  await page.screenshot({path:out+'azure-return.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS map travel',engine.name());
}finally{await browser.close();if(server)process.kill(-server.pid);}
