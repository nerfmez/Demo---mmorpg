// Focused capture: rank-based mod sockets in the real loadout workspace (rank 1, 3 and 5 skills).
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import {loadoutCharacter} from './loadout-fixture.mjs';
import {loadData} from '../../src/core/data-node.js';
import {socketMod} from '../../src/core/skills.js';
const engineName=process.env.BROWSER||'chromium',engine=engineName==='webkit'?webkit:chromium;
const origin=process.env.UI_ORIGIN||'http://127.0.0.1:4186',out=process.env.UI_OUT||'tests/browser/out/mod-slots';
await fs.mkdir(out,{recursive:true});
const data=loadData(),character=loadoutCharacter();
Object.assign(character.stats,{STR:20,DEX:20,INT:20,VIT:20});
character.skills.firebolt=5;character.skills.ward=3;
for(const id of ['terminal_burst','returning_shot'])assert.ok(socketMod(character,data,2,character.mods.find(m=>m.id===id).uid).ok,id);
for(const id of ['breaking_ward','cast_on_guard'])assert.ok(socketMod(character,data,1,character.mods.find(m=>m.id===id).uid).ok,id);
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE||'/opt/pw-browsers/chromium':undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const errors=[];
try{
 for(const [name,viewport] of [['tablet',{width:1180,height:820}],['portrait',{width:820,height:1180}],['phone',{width:844,height:390}]]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(character=>{Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true});localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,character}));localStorage.setItem('frontier.lastSlot','1');},character);
  const page=await context.newPage();page.setDefaultTimeout(180000);
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  await page.goto(origin+'/?quality=low&seed=701&dynres=0&stream=0');
  await page.waitForFunction(()=>window.__frontier?.menu);
  if(await page.locator('.fullscreen-gate').isVisible())await page.locator(await page.locator('.fullscreen-fallback').isVisible()?'.fullscreen-fallback':'.fullscreen-enter').tap();
  await page.locator('[data-act="continue"]').tap();
  await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier?.game);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('loading')).opacity==='0');
  await page.evaluate(()=>__frontier.panels.open('mods'));
  await page.waitForSelector('#atelier .skill-card');await page.waitForTimeout(600);
  const cards=await page.locator('#atelier .skill-card').evaluateAll(cs=>cs.map(c=>{const r=c.getBoundingClientRect();return {name:c.querySelector('b')?.textContent,sockets:[...c.querySelectorAll('.socket')].map(s=>{const q=s.getBoundingClientRect();return {inside:q.top>=r.top-1&&q.bottom<=r.bottom+1&&q.left>=r.left-1&&q.right<=r.right+1,h:Math.round(q.height),w:Math.round(q.width)}}),foot:c.querySelector('.card-foot span')?.textContent}}));
  console.log(name,JSON.stringify(cards));
  assert.deepEqual(cards.map(c=>c.sockets.length),[2,3,4,2],name+' socket counts follow rank');
  for(const c of cards)assert.ok(c.sockets.every(s=>s.inside),name+' sockets inside card '+c.name);
  for(const c of cards)assert.ok(c.sockets.every(s=>s.h>=24&&s.w>=24),name+' sockets stay tappable '+c.name);
  await page.screenshot({path:`${out}/${engineName}-${name}.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS mod slot capture',engineName);
}finally{await browser.close();}
