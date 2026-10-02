// Actual root-game Continue -> purchase -> persisted save -> reload/Continue.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadData} from '../../src/core/data-node.js';
import {createCharacter} from '../../src/core/character.js';
import {Game} from '../../src/core/game.js';
import {journalJump} from './passive-checks.mjs';
const data=loadData(),ch=createCharacter(data);Object.assign(ch,{name:'สมุดทดสอบ',jobLevel:20,jobPoints:15,gold:4567,jobNodes:['origin','v1','v2','a1','r1']});
const character=new Game(data,{seed:7,character:ch}).snapshot();
const url=process.env.JOURNAL_SAVE_URL||'http://localhost:4195/?quality=low&seed=7',out=process.env.JOURNAL_OUT||new URL('./out/journal-save/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(character=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,savedAt:Date.now(),character}));localStorage.setItem('frontier.lastSlot','1');}},character);
try{
 const continueGame=async()=>{await page.locator('[data-act="continue"]').click();await page.waitForFunction(()=>__frontier.game?.time>.2,null,{timeout:90000});};
 await page.goto(url);await continueGame();
 const before=await page.evaluate(()=>__frontier.game.snapshot());
 assert.deepEqual(before.jobNodes,character.jobNodes);assert.equal(before.gold,4567);
 await page.evaluate(()=>__frontier.panels.open('job'));const heldFrame=await page.evaluate(()=>__frontier.view.renderer.info.render.frame);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>__frontier.view.renderer.info.render.frame),heldFrame,'opaque journal holds the completed world frame');await journalJump(page,'f_hp');await page.locator('[data-action="learn"]').tap();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('frontier.slot.1')).character);assert.equal(saved.jobPoints,14);assert.ok(saved.jobNodes.includes('f_hp'));assert.deepEqual(saved.jobNodes.filter(id=>id!=='f_hp'),before.jobNodes);
 for(const key of ['gear','mods','materials','stats','skills','slots','appearance','kit'])assert.deepEqual(saved[key],before[key],key+' is retained');assert.equal(saved.gold,before.gold);assert.equal(saved.version,4);
 await page.locator('[data-action="close-detail"]').tap();await page.locator('#sound-control summary').tap();await page.locator('#sound-volume').fill('23');await page.locator('#sound-mute').tap();await page.locator('[data-action="exit"]').tap();
 await page.reload();await continueGame();const loaded=await page.evaluate(()=>__frontier.game.snapshot());for(const key of ['jobNodes','jobPoints','gear','mods','materials','gold','stats','skills','slots','appearance','kit'])assert.deepEqual(loaded[key],saved[key],key+' survives reload/Continue');
 await page.evaluate(()=>__frontier.panels.open('job'));const audio=await page.evaluate(()=>__frontier.panels.jobJournal.snapshot().audio);assert.equal(audio.muted,true);assert.equal(audio.volume,.23);assert.equal(audio.contextState,'not-created');assert.equal(audio.plays,0);
 await page.waitForFunction(()=>[...document.querySelectorAll('#plane > [data-node]')].every(n=>+getComputedStyle(n).opacity>.99));await page.screenshot({path:out+'ipad-loaded-save.png',timeout:90000});const beforeExit=await page.evaluate(()=>__frontier.view.renderer.info.render.frame);await page.locator('[data-action="exit"]').tap();await page.waitForFunction(previous=>__frontier.view.renderer.info.render.frame>previous,beforeExit);await page.screenshot({path:out+'ipad-hud-after-close.png',timeout:90000});assert.deepEqual(errors,[]);
 const report={ok:true,url,source:'actual full main game',version:4,purchase:'f_hp',jobPoints:loaded.jobPoints,legacyNodesPreserved:true,gearModsMaterialsStatsSkillsAppearanceGoldPreserved:true,reloadContinue:true,worldDrawingHeldAndResumed:true,prefs:{muted:audio.muted,volume:audio.volume,noAutoplay:true},pageErrors:errors};writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
