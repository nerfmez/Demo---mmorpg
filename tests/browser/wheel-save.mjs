// The save gate for the wheel Job Tree (phase C, 2026-11-03), on the actual root game:
// an earlier-tree save -> Continue (every old node refunded once) -> a route bought on the wheel journal
// -> persisted save -> reload/Continue -> the same ink, then a cancelled and a confirmed town respec.
// node tests/browser/wheel-save.mjs   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadData} from '../../src/core/data-node.js';
import {createCharacter,CHARACTER_VERSION} from '../../src/core/character.js';
import {Game} from '../../src/core/game.js';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const data=loadData(),ch=createCharacter(data);
// an earlier tree's character: four old nodes and 15 unspent points, Job Lv 20
Object.assign(ch,{name:'สมุดทดสอบ',jobLevel:20,jobPoints:15,gold:4567,jobNodes:['origin','v1','v2','a1','r1']});
const character=new Game(data,{seed:7,character:ch}).snapshot();character.treeRevision=3;
const url=process.env.JOURNAL_SAVE_URL||'http://localhost:4195/?quality=low&seed=7',out=process.env.JOURNAL_OUT||new URL('./out/wheel-save/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const server=process.env.JOURNAL_SAVE_URL?null:spawn('npx',['vite','preview','--port','4195','--strictPort'],{stdio:'ignore',detached:true});
if(server)for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>50)throw Error('save-review server startup');await new Promise(r=>setTimeout(r,250));}
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(90000);
await context.addInitScript(character=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character}));localStorage.setItem('frontier.lastSlot','1');}},character);
const idle=()=>page.waitForFunction(()=>{const s=__frontier.panels.jobJournal?.snapshot();return s&&!s.turning&&!s.animating&&!s.pending.length;},null,{timeout:60000});
const tap=async sel=>{const box=await page.evaluate(sel=>{const e=document.querySelector(sel);e.scrollIntoView({block:'nearest',inline:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];},sel);await page.touchscreen.tap(box[0],box[1]);await page.waitForTimeout(400);};
const KEYS=['gear','mods','materials','stats','skills','slots','appearance','kit'];
try{
 const continueGame=async()=>{await page.waitForFunction(()=>window.__frontier?.menu);await enterFullscreenGate(page);await page.locator('[data-act="continue"]').click();await page.waitForFunction(()=>__frontier.game?.time>.2,null,{timeout:90000});};
 await page.goto(url);await continueGame();
 const before=await page.evaluate(()=>__frontier.game.snapshot());
 assert.deepEqual(before.jobNodes,['origin'],'the earlier tree has no node on the wheel');
 assert.equal(before.jobPoints,15+4,'every old node refunded once on Continue');assert.equal(before.treeRevision,data.jobtree.revision);assert.equal(before.gold,4567);
 assert.match(await page.evaluate(()=>__frontier.game.ch.progress.balanceMigration),/วงล้อ/);
 // the opaque journal holds the completed world frame (count only world-scene draws, as menu-hub.mjs does)
 await page.evaluate(()=>{const v=__frontier.view,render=v.renderer.render.bind(v.renderer);window.worldDraws=0;v.renderer.render=(scene,...rest)=>{if(scene===v.scene)window.worldDraws++;return render(scene,...rest);};});
 await page.evaluate(()=>__frontier.panels.open('job'));await idle();
 const heldDraws=await page.evaluate(()=>worldDraws);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>worldDraws),heldDraws,'opaque journal holds the world frame');
 // a route along the STR map, bought in one go with real taps
 await page.locator('.wheel-tree [data-tab="sector.str"]').tap();await idle();
 await tap('.wheel-tree [data-node="in.str.s3"]');await page.locator('.wheel-tree [data-f="route"]').tap();await idle();
 const route=['in.center.c1','in.str.s1','in.str.s2','in.str.s3'];
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('frontier.slot.1')).character);
 assert.deepEqual(saved.jobNodes,['origin',...route],'the route is saved in buying order');assert.equal(saved.jobPoints,19-4);
 for(const key of KEYS)assert.deepEqual(saved[key],before[key],key+' is retained');assert.equal(saved.gold,before.gold);assert.equal(saved.version,CHARACTER_VERSION);
 await page.screenshot({path:out+'ipad-route.png',timeout:90000});
 await page.locator('.wheel-tree [data-f="exit"]').tap();await page.waitForFunction(()=>!__frontier.panels.isOpen);
 // reload and Continue: the same ink, nothing replayed
 await page.reload();await continueGame();const loaded=await page.evaluate(()=>__frontier.game.snapshot());
 for(const key of ['jobNodes','jobPoints','gold',...KEYS])assert.deepEqual(loaded[key],saved[key],key+' survives reload/Continue');
 await page.evaluate(()=>__frontier.panels.open('job'));await idle();
 // respec in town: cancel keeps the ink, confirm returns every point for gold
 await page.evaluate(()=>{const f=__frontier,t=f.game.world.data.town.centre;f.game.player.x=t[0];f.game.player.z=t[1];});
 await page.locator('.wheel-tree [data-f="respec"]').tap();await page.locator('.wheel-tree [data-note] [data-f="close"]').first().tap();
 assert.deepEqual(await page.evaluate(()=>__frontier.game.ch.jobNodes),loaded.jobNodes,'a cancelled respec changes nothing');
 const gold=await page.evaluate(()=>__frontier.game.ch.gold);
 await page.locator('.wheel-tree [data-f="respec"]').tap();await page.locator('.wheel-tree [data-f="respec-yes"]').tap();await idle();
 const after=await page.evaluate(()=>__frontier.game.ch);assert.deepEqual(after.jobNodes,['origin']);assert.equal(after.jobPoints,19);assert.ok(after.gold<gold,'a respec costs gold');
 await page.screenshot({path:out+'ipad-respec.png',timeout:90000});
 assert.deepEqual(errors,[]);
 const report={ok:true,url,source:'actual full main game, wheel tree save gate',version:CHARACTER_VERSION,earlierTreeRefundedOnce:true,route,persisted:true,reloadContinue:true,cancelledAndConfirmedRespec:true,worldDrawingHeld:true,errors};
 writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();if(server)try{process.kill(-server.pid);}catch{}}
