// Walk Azure -> Frontier -> back in the unified scene, through the same keyboard
// input path as the joystick. Check actor/scene identity, native-coordinate saves,
// map-qualified discovery and a genuine saved-slot Continue reload.
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
let loads=0;page.on('load',()=>loads++);
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await context.addInitScript(character=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character}));localStorage.setItem('frontier.lastSlot','1');}},character);
const ready=()=>page.waitForFunction(()=>window.__frontier?.game?.time>.3&&__frontier.view.worldPrepared&&document.getElementById('loading').classList.contains('done'),null,{timeout:420000});
const travelFrom=async(name,to,key)=>{
  // Stand on the border road just inside the seam, then walk on across it.
  await page.evaluate(to=>{const F=__frontier,g=F.game,s=g.regionWorld.seams.find(s=>s.to===to);
    const [x,z]=g.scenePoint(g.data.world.id,s.gate[0]-s.outward*2,s.gate[1]);g.player.x=x;g.player.z=z;
    window.__travelIdentity={game:g,player:g.player,world:g.world,view:F.view,roots:[...F.view.regions.values()].map(r=>r.root)};F.view.snapCamera();
  },to);
  await page.waitForTimeout(600);await page.screenshot({path:out+name+'-border.png'});
  const beforeLoads=loads;await page.keyboard.down(key);
  try{await page.waitForFunction(to=>window.__frontier.game.data.world.id===to&&__frontier.world.data.id===to,to);}
  finally{await page.keyboard.up(key);}
  const kept=await page.evaluate(()=>{const F=__frontier,s=window.__travelIdentity;F.input.reset();F.save();return {
    identity:F.game===s.game&&F.game.player===s.player&&F.game.world===s.world&&F.view===s.view,
    roots:[...F.view.regions.values()].every((r,i)=>r.root===s.roots[i]),prepared:F.view.worldPrepared,regions:F.view.regions.size};});
  assert.equal(loads,beforeLoads,'walking never reloads the page');assert.ok(kept.identity&&kept.roots,'walking retains actors and every resident scene');
  assert.ok(kept.prepared);assert.equal(kept.regions,Object.keys(data.maps).length);
};
try{
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  await page.locator('[data-act="continue"]').click();await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),AZURE);
  await travelFrom('azure',FRONTIER,'ArrowLeft');
  const there=await page.evaluate(({A,F})=>{const g=__frontier.game,[x,z]=g.localPoint(F,g.player.x,g.player.z);return {
    map:__frontier.world.data.id,x,z,worldPosition:g.worldPoint(g.player.x,g.player.z),city:!!__frontier.view.region.cityRoot,
    azureCity:!!__frontier.view.regions.get(A).cityRoot,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character};},{A:AZURE,F:FRONTIER});
  assert.equal(there.map,FRONTIER);assert.equal(there.city,false,'the active Frontier region has no Azure city');assert.ok(there.azureCity,'Azure remains resident in the same world');
  const seam=data.maps[FRONTIER].atlas.seams[0];assert.ok(Math.abs(there.z-seam.gate[1])<1.5&&Math.abs(there.x-data.maps[FRONTIER].bounds.maxX)<2,'arrives at the border road on the far side');
  assert.equal(there.slot.worldId,FRONTIER);assert.equal(there.slot.gold,777);assert.equal(there.slot.level,6);
  assert.deepEqual(there.slot.pos,[Math.round(there.x*10)/10,Math.round(there.z*10)/10],'save coordinates remain native to the selected region');
  assert.ok(there.slot.progress.maps[AZURE],'Azure discovery is stored');
  await page.evaluate(()=>{__frontier.view.zoom=1.5;});await page.waitForTimeout(1500);await page.screenshot({path:out+'frontier-arrival.png'});
  // Continue from the title also reopens the Frontier.
  await page.goto(url);await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);
  // The slot card counts exploration over the whole world and names the save's map.
  const card=await page.evaluate(()=>{__frontier.menu.showSlots('load');const t=document.querySelector('.slot-card').textContent;__frontier.menu.showTitle();return t;});
  assert.match(card,new RegExp(`/${Object.values(data.maps).reduce((n,m)=>n+m.zones.length,0)} พื้นที่`));assert.ok(card.includes(data.maps[FRONTIER].nameTh));
  await Promise.all([page.waitForEvent('load'),page.locator('[data-act="continue"]').click()]);
  await page.waitForFunction(()=>window.__frontier?.fullscreen);await enterFullscreenGate(page);await ready();
  assert.equal(await page.evaluate(()=>__frontier.world.data.id),FRONTIER,'Continue returns to the saved map');
  const reloaded=await page.evaluate(()=>{const g=__frontier.game;return {pos:g.localPoint(g.data.world.id,g.player.x,g.player.z),world:g.worldPoint(g.player.x,g.player.z)};});
  assert.ok(Math.hypot(reloaded.pos[0]-there.slot.pos[0],reloaded.pos[1]-there.slot.pos[1])<.2,'Continue restores the actual saved local position');
  assert.ok(Math.hypot(reloaded.world[0]-there.worldPosition[0],reloaded.world[1]-there.worldPosition[1])<.2,'a different scene origin preserves the absolute atlas position');
  await travelFrom('frontier',AZURE,'ArrowRight');
  const home=await page.evaluate(()=>({map:__frontier.world.data.id,slot:JSON.parse(localStorage.getItem('frontier.slot.1')).character}));
  assert.equal(home.map,AZURE);assert.equal(home.slot.worldId,AZURE);assert.equal(home.slot.gold,777);assert.equal(home.slot.level,6);
  assert.ok(home.slot.progress.maps[FRONTIER].zones.includes('settlement'),'Frontier settlement discovery survives the return crossing');
  await page.screenshot({path:out+'azure-return.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS map travel',engine.name());
}finally{await browser.close();if(server)process.kill(-server.pid);}
