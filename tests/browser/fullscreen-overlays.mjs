// Native dialog layering/input regression. The controller receives deterministic
// fullscreenchange events; fullscreen-review.mjs covers actual Chromium entry.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {build} from 'vite';
import {journalJump} from './passive-checks.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const engineName=process.env.BROWSER||'chromium',engine=engineName==='webkit'?webkit:chromium;
const out=process.env.FULLSCREEN_OUT||new URL(`./out/fullscreen-overlays-${engineName}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
async function bundle(entry,name){const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL(entry,import.meta.url).pathname,name,formats:['iife']}}});return b[0].output.find(x=>x.type==='chunk').code;}
const harness=await bundle('./workspace-harness.js','Harness'),gate=await bundle('../../src/ui/fullscreen.js','Gate');
const css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','wheel','fullscreen'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox']:[]}),report=[];
try{
 for(const [label,width,height] of [['tablet',1180,820],['clip',776,540]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:harness});await page.addScriptTag({content:gate});
  await page.evaluate(()=>{
   let active=null;Object.defineProperty(document,'fullscreenElement',{get:()=>active,configurable:true});Object.defineProperty(document,'fullscreenEnabled',{value:true,configurable:true});
   document.documentElement.requestFullscreen=async()=>{active=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));};
   window.exitFixture=()=>{active=null;document.dispatchEvent(new Event('fullscreenchange'));};
   __frontier.fullscreen=Gate.createFullscreen();
   const f=__frontier;Object.assign(f.game.player,{x:f.game.world.data.town.centre[0],z:f.game.world.data.town.centre[1]});Object.assign(f.game.ch,{jobNodes:['origin','in.center.c1'],jobLevel:20,jobPoints:18,gold:1000});
  });
  await page.locator('.fullscreen-enter').tap();await page.evaluate(()=>__frontier.panels.open('job'));
  // the wheel tree's pinned note holds the buttons that spend (buy, buy along the road, respec)
  const idle=()=>page.waitForFunction(()=>{const s=__frontier.panels.jobJournal?.snapshot();return s&&!s.turning&&!s.animating&&!s.pending.length;},null,{timeout:60000});
  await idle();
  const BUTTON={buy:'[data-f="buy"]',route:'[data-f="route"]',respec:'[data-f="respec-yes"]'};
  for(const action of ['buy','route','respec']){
   if(action==='buy')await journalJump(page,'in.center.c2');
   if(action==='route')await journalJump(page,'in.center.c4');
   if(action==='respec'){await page.locator('.wheel-tree [data-f="respec"]').tap();await idle();}
   const button=`.wheel-tree [data-note]:not([hidden]) ${BUTTON[action]}`;
   assert.equal(await page.locator(button).isEnabled(),true,'exercise an actionable '+action);
   const state=()=>page.evaluate(()=>({owned:[...__frontier.game.ch.jobNodes],gold:__frontier.game.ch.gold,points:__frontier.game.ch.jobPoints,selected:__frontier.panels.jobJournal.snapshot().selected}));
   const before=await state();
   await page.evaluate(()=>exitFixture());
   assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.open),true);
   const hits=await page.locator('.fullscreen-enter').evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert.equal(hits,true,'gate is the topmost input target');
   await page.locator(button).evaluate(el=>el.focus());
   assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.contains(document.activeElement)||document.activeElement===document.body),true,'the note under the gate cannot take focus');
   await page.keyboard.press('Escape');assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.open),true,'Esc cannot dismiss the pause gate');
   // tap the note's button where it lies, at a point outside the gate's own buttons
   const target=await page.locator(button).evaluate(el=>{const r=el.getBoundingClientRect();for(const x of [r.left+2,r.right-2,r.x+r.width/2])for(const y of [r.top+2,r.bottom-2,r.y+r.height/2]){const hit=document.elementFromPoint(x,y);if(!hit?.closest('button,a,input,select'))return {x,y};}return null;});
   assert.ok(target,'a coordinate of the paused note outside gate actions');await page.touchscreen.tap(target.x,target.y);
   assert.deepEqual(await state(),before,'paused input cannot buy, buy a road or respec');
   await page.screenshot({path:out+`${label}-${action}-paused.png`});
   await page.locator('.fullscreen-enter').tap();
   assert.equal(await page.locator(button).isVisible(),true,'the note is still pinned after reentry');
   await page.locator('.wheel-tree [data-note]:not([hidden]) .fm-close').tap();await idle();
   report.push({label,action,gateOnTop:true,pausedInputBlocked:true,notePreserved:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log('PASS fullscreen modal layering/input '+engineName);
}finally{await browser.close()}
