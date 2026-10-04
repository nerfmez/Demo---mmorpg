// Azure west border road -> Greenhollow Frontier -> back, by walking across the open
// seam (keyboard, the same input path as the joystick) with streaming off (?stream=0),
// so the reload fallback and the saved slot are what is tested; open-world.mjs covers
// the in-place hand-over. Checks the saved slot, per-map discovery and that only one map is built.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {loadData} from '../../src/core/data-node.js';
import {createCharacter} from '../../src/core/character.js';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const data=loadData(),AZURE='azure-harbor-v1',FRONTIER='frontier-wilds-v1';
const character=createCharacter(data,{name:'นักเดินทาง'});Object.assign(character,{gold:777,level:6});
const url=process.env.TRAVEL_URL||'http://localhost:4196/?quality=low&seed=3&stream=0',out=new URL(`./out/map-travel-${process.env.BROWSER||'chromium'}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=process.env.TRAVEL_URL?null:spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4196','--strictPort'],{stdio:'ignore',detached:true});
if(server)for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('travel server startup');await new Promise(r=>setTimeout(r,250));}
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await context.addInitScript(character=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character}));localStorage.setItem('frontier.lastSlot','1');}},character);
const ready=()=>page.waitForFunction(()=>window.__frontier?.game?.time>.3&&document.getElementById('loading').classList.contains('done'),null,{timeout:120000});
const travelFrom=async(name,key)=>{
  // Stand on the border road just inside the seam, then walk on across it.
  await page.evaluate(()=>{const g=__frontier.game,s=g.world.seams[0];g.player.x=s.gate[0]-s.outward*2;g.player.z=s.gate[1];__frontier.view.snapCamera();});
  await page.waitForTimeout(600);await page.screenshot({path:out+name+'-border.png'});
  await Promise.all([page.waitForEvent('load'),page.keyboard.down(key)]);
  await page.keyboard.up(key);
  await page.waitForFunction(()=>window.__frontier?.fullscreen);await enterFullscreenGate(page);
  await ready();
};
try{
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  await page.locator('[data-act="continue"]').click();await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),AZURE);
  await travelFrom('azure','ArrowLeft');
  const there=await page.evaluate(()=>({map:__frontier.world.data.id,x:__frontier.game.player.x,z:__frontier.game.player.z,city:!!__frontier.view.cityRoot,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character}));
  assert.equal(there.map,FRONTIER);assert.equal(there.city,false,'the Azure city is not built on the Frontier');
  const seam=data.maps[FRONTIER].atlas.seams[0];assert.ok(Math.abs(there.z-seam.gate[1])<1.5&&Math.abs(there.x-data.maps[FRONTIER].bounds.maxX)<2,'arrives at the border road on the far side');
  assert.equal(there.slot.worldId,FRONTIER);assert.equal(there.slot.gold,777);assert.equal(there.slot.level,6);
  assert.ok(there.slot.progress.maps[AZURE],'Azure discovery is stored');
  await page.evaluate(()=>{__frontier.view.zoom=1.5;});await page.waitForTimeout(1500);await page.screenshot({path:out+'frontier-arrival.png'});
  // Continue from the title also reopens the Frontier.
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  // The slot card counts exploration against the save's own map, not the title map.
  const card=await page.evaluate(()=>{__frontier.menu.showSlots('load');const t=document.querySelector('.slot-card').textContent;__frontier.menu.showTitle();return t;});
  assert.match(card,new RegExp(`/${data.maps[FRONTIER].zones.length} พื้นที่`));assert.ok(card.includes(data.maps[FRONTIER].nameTh));
  await Promise.all([page.waitForEvent('load'),page.locator('[data-act="continue"]').click()]);
  await page.waitForFunction(()=>window.__frontier?.fullscreen);await enterFullscreenGate(page);await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),FRONTIER,'Continue returns to the saved map');
  await travelFrom('frontier','ArrowRight');
  const home=await page.evaluate(()=>({map:__frontier.world.data.id,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character}));
  assert.equal(home.map,AZURE);assert.equal(home.slot.worldId,AZURE);assert.ok(home.slot.progress.maps[FRONTIER].zones.includes('wetland'));
  await page.screenshot({path:out+'azure-return.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS map travel',engine.name());
}finally{await browser.close();if(server)process.kill(-server.pid);}
