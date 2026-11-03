// Focused local review: visible paper geometry and real fullscreen transitions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const out=process.env.FULLSCREEN_OUT||new URL('./out/fullscreen-review/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const styles=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','wheel','fullscreen'];
let css=styles.map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const weight of [400,600]){const font=readFileSync(new URL(`../../src/ui/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${font});font-weight:${weight}}`;}
async function bundle(entry,name){const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry,name,formats:['iife']}}});return b[0].output.find(x=>x.type==='chunk').code;}
const harness=await bundle(new URL('./workspace-harness.js',import.meta.url).pathname,'JournalReview');
const fsCode=await bundle(new URL('../../src/ui/fullscreen.js',import.meta.url).pathname,'FullscreenReview');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try {
 // the old skill journal's book metrics went with it at phase C; the wheel tree's own: tests/browser/wheel-tree.mjs
 if(!process.env.REVIEW_LIVE_ONLY) for(const mode of ['native','denied','unsupported','pending']) {
  const ctx=await browser.newContext({viewport:{width:1024,height:640}}),p=await ctx.newPage();await p.setContent('<html><body><canvas id="game"></canvas><div id="hud"></div></body></html>');await p.addStyleTag({content:css});await p.addScriptTag({content:fsCode});
  await p.evaluate(mode=>{window.calls=0;const original=document.documentElement.requestFullscreen;if(mode==='unsupported')Object.defineProperty(document,'fullscreenEnabled',{value:false});document.documentElement.requestFullscreen=function(){calls++;if(mode==='pending')return new Promise(()=>{});if(mode==='denied')return Promise.reject(new Error('review denial'));return original.call(this);};window.manager=FullscreenReview.createFullscreen();},mode);
  assert.equal(await p.evaluate(()=>manager.blocked),true);
  if(mode==='pending') {await p.locator('.fullscreen-enter').click();await p.evaluate(()=>document.querySelector('.fullscreen-enter').click());assert.equal(await p.evaluate(()=>calls),1);assert.equal(await p.evaluate(()=>manager.snapshot().pending),true);assert.equal(await p.locator('.fullscreen-enter').isDisabled(),true);}
  else if(mode==='native') {
   await p.locator('.fullscreen-enter').click();await p.waitForFunction(()=>!!document.fullscreenElement&&!manager.blocked);assert.equal(await p.evaluate(()=>calls),1);await p.screenshot({path:out+'fullscreen-title-harness.png'});
   await p.evaluate(()=>document.exitFullscreen());await p.waitForFunction(()=>manager.blocked);assert.equal(await p.locator('#hud').evaluate(n=>n.inert),true);await p.screenshot({path:out+'fullscreen-reentry.png'});
   await p.locator('.fullscreen-enter').click();await p.waitForFunction(()=>!!document.fullscreenElement&&!manager.blocked);assert.equal(await p.evaluate(()=>calls),2);
  } else {if(mode==='denied'){await p.locator('.fullscreen-enter').click();await p.locator('.fullscreen-fallback').waitFor({state:'visible'});}await p.screenshot({path:out+'fullscreen-'+mode+'.png'});await p.locator('.fullscreen-fallback').click();assert.equal(await p.evaluate(()=>manager.blocked),false);assert.equal(await p.locator('.fullscreen-control').isVisible(),true);}
  reports.push({fullscreenMode:mode,...await p.evaluate(()=>manager.snapshot())});await ctx.close();
 }
 // Actual boot/title/create/fullscreen/exit/pause path with the real renderer.
 if(reports.length)writeFileSync(out+'ui-report.json',JSON.stringify(reports,null,2));
 if(process.env.REVIEW_UI_ONLY){console.log('PASS focused book/fullscreen UI');process.exitCode=0;} else {
 const ctx=await browser.newContext({viewport:{width:1024,height:640},hasTouch:true,isMobile:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(60000);
 await p.goto(process.env.FULLSCREEN_URL||'http://localhost:5178/?quality=low&dynres=0',{waitUntil:'commit'});await p.waitForFunction(()=>window.__frontier?.menu);await freezeScene(p);await p.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));
 await p.screenshot({path:out+'fullscreen-entry.png'});await enterFullscreenGate(p);await p.waitForFunction(()=>!!document.fullscreenElement&&!__frontier.fullscreen.blocked);
 await p.locator('[data-act="new"]').tap();await p.locator('[data-act="start"]').tap();await p.waitForFunction(()=>__frontier.game?.time>.1);await p.evaluate(()=>{const v=__frontier.view;Object.getPrototypeOf(v).render.call(v,0,performance.now()/1000,{});});
 const overlap=await p.evaluate(()=>{const q=document.querySelector('.quest-widget').getBoundingClientRect(),c=document.querySelector('.combat').getBoundingClientRect(),canvas=document.querySelector('#game').getBoundingClientRect();return{questBottom:q.bottom,combatTop:c.top,gap:c.top-q.bottom,canvasWidth:canvas.width,canvasHeight:canvas.height,viewportWidth:visualViewport.width,viewportHeight:visualViewport.height}});assert.ok(overlap.gap>=8,JSON.stringify(overlap));assert.equal(overlap.canvasHeight,overlap.viewportHeight);await p.screenshot({path:out+'tablet-hud.png'});
 await p.evaluate(()=>document.exitFullscreen());await p.waitForFunction(()=>__frontier.fullscreen.blocked);const time=await p.evaluate(()=>__frontier.game.time);await p.keyboard.press('w');await p.keyboard.press('1');await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__frontier.game.time),time);assert.equal(await p.evaluate(()=>__frontier.input.keys.size),0);await p.screenshot({path:out+'live-paused-reentry.png'});
 await enterFullscreenGate(p);await p.waitForFunction(t=>__frontier.game.time>t,time);
 await p.evaluate(()=>__frontier.panels.open('job'));
 // the wheel journal's respec note is governed by the gate (phase C: the old search/respec dialogs are gone)
 await p.waitForFunction(()=>{const s=__frontier.panels.jobJournal?.snapshot();return s&&!s.turning&&!s.animating;});
 await p.locator('.wheel-tree [data-f="respec"]').tap();
 await p.evaluate(()=>document.exitFullscreen());await p.waitForFunction(()=>__frontier.fullscreen.blocked);
 assert.equal(await p.locator('.fullscreen-enter').evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
 {const pausedTime=await p.evaluate(()=>__frontier.game.time);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__frontier.game.time),pausedTime);assert.equal(await p.locator('.fullscreen-gate').evaluate(d=>d.open),true);}
 await p.screenshot({path:out+'live-respec-paused.png'});
 await enterFullscreenGate(p);assert.equal(await p.locator('.wheel-tree [data-note]:not([hidden]) [data-f="respec-yes"]').count(),1,'the respec note is still pinned after reentry');await p.locator('.wheel-tree [data-note]:not([hidden]) .fm-close').tap();
 await p.evaluate(()=>__frontier.panels.close());await p.setViewportSize({width:1024,height:640});await p.waitForTimeout(250);await p.evaluate(()=>{const v=__frontier.view;Object.getPrototypeOf(v).render.call(v,0,performance.now()/1000,{});});await p.screenshot({path:out+'live-portrait.png'});
 await p.reload({waitUntil:'commit'});await p.waitForFunction(()=>window.__frontier?.menu);await freezeScene(p);await enterFullscreenGate(p);await p.locator('[data-act="continue"]').tap();await p.waitForFunction(()=>__frontier.game?.time>.1);assert.equal(await p.evaluate(()=>__frontier.game.ch.name),'นักเดินทาง');
 assert.deepEqual(errors,[]);reports.push({actualGame:true,overlap,exitPauses:true,reentryResumes:true,respecGovernedByGate:true,reloadContinuePreserved:true,pageErrors:errors});await ctx.close();
 writeFileSync(out+'live-report.json',JSON.stringify(reports,null,2));console.log('PASS fullscreen, HUD budget and book geometry review');}
} finally {await browser.close();}
