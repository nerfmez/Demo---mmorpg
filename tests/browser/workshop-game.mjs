// Focused built-game integration proof: real renderer, Game, Panels and workshop input.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { initialUiReady } from './startup-ready.mjs';
import { freezeScene } from './freeze-scene.mjs';
const out=process.env.EVIDENCE_DIR||new URL('./out/workshop-game/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const port=4235,base=`http://localhost:${port}/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});let browser;
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const reports=[];
 for(const [label,width,height,reduced]of[['ipad',1180,820,false],['phone-landscape',844,390,false],['ipad-reduced',1180,820,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:reduced?'reduce':'no-preference',recordVideo:{dir:out,size:{width,height}}});
  const videoEpoch=Date.now(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?fresh=1&quality=low&seed=7&stream=0',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(initialUiReady,null,{timeout:60000});
  await page.screenshot({path:`${out}/${label}-game-world.png`});
  await freezeScene(page);
  await page.evaluate(()=>{const {game:g,panels:p}=__frontier;g.ch.gold=100000;g.ch.level=30;for(const k in g.ch.stats)g.ch.stats[k]=100;for(const k in g.data.items.materials)g.ch.materials[k]=500;[g.player.x,g.player.z]=g.data.world.town.workbench;g.refresh();p.sel.forgeUid=g.ch.gear[0].uid;p.open('forge');});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  await page.locator('[data-workshop-stage]').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${label}-game-before.png`});
  const strikeStart=(Date.now()-videoEpoch)/1000;
  const paid=await page.evaluate(()=>{const p=__frontier.panels,g=__frontier.game;const before=JSON.stringify(g.ch);p.onClick({target:document.querySelector('[data-act="gear-up"]')});const paid=JSON.stringify(g.ch);p.onClick({target:document.querySelector('[data-act="gear-up"]')});return {before,paid,repeat:JSON.stringify(g.ch),busy:p.workshop.busy,paused:p.isOpen,time:g.time};});
  assert.notEqual(paid.before,paid.paid);assert.equal(paid.paid,paid.repeat);assert.equal(paid.busy,true);assert.equal(paid.paused,true);
  await page.waitForTimeout(reduced?100:445);await page.screenshot({path:`${out}/${label}-game-impact.png`});
  await page.waitForFunction(()=>!__frontier.panels.workshop.busy);assert.equal(await page.evaluate(()=>JSON.stringify(__frontier.game.ch)),paid.paid);assert.equal(await page.evaluate(()=>__frontier.game.time),paid.time,'open panel pauses simulation');
  await page.screenshot({path:`${out}/${label}-game-result.png`});
  await page.evaluate(()=>{const p=__frontier.panels;p.close();p.open('forge');});assert.equal(await page.evaluate(()=>JSON.stringify(__frontier.game.ch)),paid.paid);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);
  reports.push({label,width,height,reduced,strikeStart,context:'built game in Chromium SwiftShader; world renderer initialized and captured, then completed world frame held by freezeScene for UI review; touch viewport emulation',checks:['initial UI and imported region ready','world screenshot','workshop pauses simulation','repeat atomic transaction','finish/close/reopen preserves state','no horizontal overflow','no page errors']});
  await page.waitForTimeout(150);await context.close();await page.video().saveAs(`${out}/${label}-game.webm`);
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
