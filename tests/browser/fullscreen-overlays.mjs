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
const css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal','fullscreen'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
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
   const f=__frontier;Object.assign(f.game.player,{x:f.game.world.data.town.centre[0],z:f.game.world.data.town.centre[1]});Object.assign(f.game.ch,{jobNodes:['origin','v1'],jobLevel:20,jobPoints:18,gold:1000});
  });
  await page.locator('.fullscreen-enter').tap();await page.evaluate(()=>__frontier.panels.open('job'));
  for(const action of ['search','respec','node-details']){
   if(action==='node-details')await journalJump(page,'advanced.power');
   await page.locator(`[data-action="${action}"]`).tap();
   if(action==='search')await page.locator('#node-search').fill('v1');
   else if(action==='respec')assert.equal(await page.locator('[data-action="confirm-respec"]').isEnabled(),true,'exercise an actionable respec');
   const before=await page.evaluate(()=>({owned:[...__frontier.game.ch.jobNodes],gold:__frontier.game.ch.gold,points:__frontier.game.ch.jobPoints,selected:__frontier.panels.jobJournal.snapshot().selected}));
   await page.evaluate(()=>exitFixture());
   assert.equal(await page.locator('#dialog').evaluate(d=>d.open&&d.inert),true);
   assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.open),true);
   const hits=await page.locator('.fullscreen-enter').evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});assert.equal(hits,true,'gate is the topmost input target');
   // DOM fill is programmatic; use real keyboard and hit-tested touch here.
   await page.evaluate(action=>document.querySelector(action==='search'?'#node-search':action==='respec'?'[data-action="confirm-respec"]':'[data-action="back-to-node"]').focus(),action);
   assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.contains(document.activeElement)),true,'underlying dialog cannot steal focus');
   await page.keyboard.type('paused');await page.keyboard.press('Escape');assert.equal(await page.locator('.fullscreen-gate').evaluate(d=>d.open),true,'Esc cannot dismiss the pause gate');
   // Modal positions change with content. Do not accidentally press a visible
   // gate resume/fallback button while trying to touch the suspended dialog.
   const target=await page.locator(action==='search'?'#node-search':action==='respec'?'[data-action="confirm-respec"]':'[data-action="back-to-node"]').evaluate(el=>{const r=el.getBoundingClientRect();for(const x of [r.left+2,r.right-2,r.x+r.width/2])for(const y of [r.top+2,r.bottom-2,r.y+r.height/2])if(!document.elementFromPoint(x,y)?.closest('.fullscreen-gate button'))return {x,y};return null;});
   assert.ok(target,'a suspended-dialog coordinate outside gate actions');await page.touchscreen.tap(target.x,target.y);
   assert.deepEqual(await page.evaluate(()=>({owned:[...__frontier.game.ch.jobNodes],gold:__frontier.game.ch.gold,points:__frontier.game.ch.jobPoints,selected:__frontier.panels.jobJournal.snapshot().selected})),before,'paused input cannot search, purchase or respec');
   if(action==='search')assert.equal(await page.locator('#node-search').inputValue(),'v1');
   await page.screenshot({path:out+`${label}-${action}-paused.png`});
   await page.locator('.fullscreen-enter').tap();assert.equal(await page.locator('#dialog').evaluate(d=>d.open&&!d.inert),true,'open dialog restored after reentry');
   if(action==='search'){assert.equal(await page.locator('#node-search').inputValue(),'v1');await page.locator('#node-search').fill('v2');}
   await page.locator('[data-action="close-dialog"]').tap();
   report.push({label,action,gateOnTop:true,pausedInputBlocked:true,dialogPreserved:true});
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log('PASS fullscreen modal layering/input '+engineName);
}finally{await browser.close()}
