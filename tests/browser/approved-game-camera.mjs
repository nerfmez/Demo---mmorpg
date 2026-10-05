// Actual Game casts and View event routing, rendered at selected simulation times.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const out=new URL('./out/approved-game/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.reviewRAF=raf;window.requestAnimationFrame=cb=>raf(t=>{if(!window.__captureFreeze)cb(t);});});
 await page.goto('http://localhost:4192/?fresh=1&kit=staff&seed=9&quality=low&dynres=0');await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.game?.time>.2,null,{timeout:90000});
 await page.evaluate(()=>{const f=__frontier,g=f.game,p=g.player;f.paused=true;f.input.reset();window.__captureFreeze=true;
 p.x=-103;p.z=44;p.facing=Math.PI/2;g.spawnPoints=[];g.monsters=[];for(const k in g.ch.stats)g.ch.stats[k]=20;
 const render=f.view.renderer.render.bind(f.view.renderer);f.reviewDraw=()=>render(f.view.scene,f.view.camera);f.view.renderer.render=()=>{};f.view.zoom=1;f.view.snapCamera();
 f.reviewStep=()=>{g.update(1/60);for(const e of g.drainEvents())f.view.handleEvent(e);f.view.render(1/60,g.time,{});f.hud.update(1/60,{});};});
 const results=[];
 for(const skill of ['frost_nova','stone_burst','war_cry','healing_spring','spirit_wolf']){
  const result=await page.evaluate(skill=>{const f=__frontier,g=f.game;g.ch.skills[skill]=1;g.ch.slots[0]={skill,mods:[]};g.refresh(true);g.player.cooldowns={};g.setAimPoint(g.player.x+2,g.player.z);const ok=g.castSlot(0,{x:g.player.x+2,z:g.player.z});for(let i=0;i<(skill==='stone_burst'?65:skill==='healing_spring'?45:skill==='spirit_wolf'?55:24);i++)f.reviewStep();f.reviewDraw();return {skill,cast:ok,areas:g.areas.length,allies:g.allies.length};},skill);
  assert(result.cast,skill+' real cast failed');if(skill==='spirit_wolf')assert.equal(result.allies,1,'wolf did not spawn');await page.screenshot({path:`${out}/${skill}-desktop.png`});
  await page.setViewportSize({width:768,height:1024});await page.evaluate(async()=>{for(const el of document.querySelectorAll('[style*="--viewport-"]')){el.style.setProperty("--viewport-w",innerWidth+"px");el.style.setProperty("--viewport-h",innerHeight+"px");}await new Promise(r=>window.reviewRAF(()=>window.reviewRAF(r)));__frontier.view.resize();__frontier.view.updateCamera(0,__frontier.view.camTarget);__frontier.reviewDraw();});await page.screenshot({path:`${out}/${skill}-portrait.png`});
  await page.setViewportSize({width:1100,height:760});await page.evaluate(async()=>{for(const el of document.querySelectorAll('[style*="--viewport-"]')){el.style.setProperty("--viewport-w",innerWidth+"px");el.style.setProperty("--viewport-h",innerHeight+"px");}await new Promise(r=>window.reviewRAF(()=>window.reviewRAF(r)));__frontier.view.resize();for(let i=0;i<400;i++)__frontier.reviewStep();});results.push(result);
 }
 assert.equal(errors.length,0,errors.join('\n'));writeFileSync(`${out}/report.json`,JSON.stringify({results,errors,method:'Actual Game casts, fixed 60Hz simulation, selected renders; no hardware performance claim'},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
