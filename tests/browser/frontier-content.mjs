// Focused prototype review: real rules in Lab + hold/release and movement socket in game.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {freezeScene} from './freeze-scene.mjs';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='tests/browser/out/frontier-content';mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4187','--strictPort'],{stdio:'ignore'});
let browser;
try{
 for(let n=0;;n++){try{if((await fetch('http://127.0.0.1:4187/lab.html')).ok)break;}catch{}if(n>40)throw Error('server unavailable');await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results=[];
 for(const [name,width,height,touch]of [['desktop',1440,900,false],['ipad',1180,820,true],['phone',844,390,true]].filter(v=>!process.env.UI_DEVICE||v[0]===process.env.UI_DEVICE)){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4187/lab.html?skill=charged_shot');await page.waitForFunction(()=>window.__lab);await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{__lab.state.paused=true;__lab.cast();for(let i=0;i<72;i++)__lab.step(1/60);});
  assert(await page.evaluate(()=>!!__lab.rulesGame.player.charging));await page.screenshot({path:`${out}/${name}-charge.png`});
  await page.evaluate(()=>{__lab.release();for(let i=0;i<24;i++)__lab.step(1/60);});assert(await page.evaluate(()=>!__lab.rulesGame.player.charging));
  const skills=['charged_shot','riposte','weakpoint','armor_cleave','interrupt_slam','frontline_split','shield_bash','arrow_rain','arcane_shot','flame_stream','crystal_wall','cleanse','battle_aura','stone_guardian'];
  for(const id of skills){
   await page.evaluate(id=>{__lab.selectSkill(id);__lab.state.paused=true;__lab.cast();for(let i=0;i<36;i++)__lab.step(1/60);if(id==='charged_shot'){__lab.release();for(let i=0;i<30;i++)__lab.step(1/60);}},id);
   assert.equal(await page.evaluate(()=>__lab.state.skill),id);assert(await page.evaluate(()=>__lab.rulesGame.skills[0].requirementsMet),id+' requires active gear');
   if(name==='desktop'||['flame_stream','crystal_wall','stone_guardian'].includes(id))await page.screenshot({path:`${out}/${name}-${id}.png`});
   await page.evaluate(()=>__lab.release());
  }
  console.log('PASS Lab 14 prototypes',name);
  // Resource ownership probe: same content sequence, GPU allocations should stabilize.
  const geometries=await page.evaluate(async()=>{const counts=[];for(let round=0;round<3;round++){for(const id of ['crystal_wall','flame_stream','battle_aura']){__lab.selectSkill(id);__lab.cast();for(let i=0;i<36;i++)__lab.step(1/60);await new Promise(requestAnimationFrame);__lab.clear();}__lab.step(1/60);await new Promise(requestAnimationFrame);counts.push(__lab.stats().geometries);}return counts;});
  assert(geometries.at(-1)<=geometries[0]+2,`geometry growth ${geometries}`);
  await page.goto('http://127.0.0.1:4187/?fresh=1&skillSandbox=1&quality=low&stream=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__frontier?.game?.time>=.3&&document.getElementById('loading').classList.contains('done'),null,{timeout:90000});
  await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('loading')).opacity)<.01);
  await page.evaluate(()=>{__frontier.paused=true;__frontier.game.monsters=[];});
  assert.equal(await page.locator('.skill-sandbox select option').count(),14);
  const b=page.locator('.sbtn.attack'),box=await b.boundingBox();
  // Real control handlers with touch pointer identity; a mouse press in desktop.
  if(touch)await b.dispatchEvent('pointerdown',{pointerId:31,pointerType:'touch',clientX:box.x+box.width/2,clientY:box.y+box.height/2,button:0,bubbles:true});
  else{await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();}
  assert(await page.evaluate(()=>!!__frontier.game.player.charging));
  await page.evaluate(()=>{const g=__frontier.game;for(let i=0;i<72;i++)g.update(.016666);__frontier.input.update(0);});
  await page.screenshot({path:`${out}/${name}-game-charge.png`});
  if(touch)await b.dispatchEvent('pointerup',{pointerId:31,pointerType:'touch',clientX:box.x+box.width/2,clientY:box.y+box.height/2,button:0,bubbles:true});else await page.mouse.up();
  assert(await page.evaluate(()=>!__frontier.game.player.charging&&!!__frontier.game.player.cast));
  await freezeScene(page);await page.evaluate(()=>{__frontier.panels.open('skills');});
  const movement=page.locator('[data-action="category"][data-id="movement"]').last();await(touch?movement.tap():movement.click());
  assert.equal(await page.locator('.movement-socket-panel').count(),1);
  await page.screenshot({path:`${out}/${name}-movement-socket.png`});
  if(name==='phone')assert.equal(await page.locator('.movement-mode .equipped-skills').evaluate(e=>getComputedStyle(e).display),'none','short phone movement page reserves room for the movement socket');
  const socket=page.locator('[data-action="movement-mod"]').filter({hasText:'สั้น'}).first();assert(await socket.count(),'short stride socket control');await(touch?socket.tap():socket.click());
  const movementState=await page.evaluate(()=>({distance:__frontier.game.move.distance,charges:__frontier.game.move.charges,mods:__frontier.game.ch.movementMods.length}));assert.equal(movementState.mods,1);
  await page.screenshot({path:`${out}/${name}-movement-active.png`});
  await page.evaluate(()=>__frontier.panels.close());
  for(const id of skills){await page.locator('.skill-sandbox select').selectOption(id);assert(await page.evaluate(()=>__frontier.game.skills[0].requirementsMet),id+' sandbox gear');}
  assert.deepEqual(errors,[]);results.push({name,width,height,touch,skills:skills.length,geometries,movementState,pageErrors:errors});console.log('PASS frontier',name);await context.close();
 }
 writeFileSync(`${out}/report${process.env.UI_DEVICE?'-'+process.env.UI_DEVICE:''}.json`,JSON.stringify(results,null,2));
}finally{await browser?.close();server.kill();}
