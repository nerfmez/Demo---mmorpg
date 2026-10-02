// Focused local review: visible paper geometry and real fullscreen transitions.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
const out=process.env.FULLSCREEN_OUT||new URL('./out/fullscreen-review/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const styles=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal','fullscreen'];
let css=styles.map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const weight of [400,600]){const font=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${font});font-weight:${weight}}`;}
async function bundle(entry,name){const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry,name,formats:['iife']}}});return b[0].output.find(x=>x.type==='chunk').code;}
const harness=await bundle(new URL('./workspace-harness.js',import.meta.url).pathname,'JournalReview');
const fsCode=await bundle(new URL('../../src/ui/fullscreen.js',import.meta.url).pathname,'FullscreenReview');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
try {
 if(!process.env.REVIEW_LIVE_ONLY) for(const [label,width,height] of [['clip',776,540],['landscape',844,390],['tablet',1180,820],['portrait',390,844]]) {
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.setContent('<html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>');await p.addStyleTag({content:css});await p.addScriptTag({content:harness});
  await p.evaluate(()=>{__frontier.panels.open('job')});await p.waitForTimeout(350);
  const metrics=await p.evaluate(()=>{const m=document.querySelector('#map').getBoundingClientRect();return {map:{width:m.width,height:m.height,top:m.top,bottom:m.bottom},nodes:[...document.querySelectorAll('#plane > [data-node]')].map(n=>{const r=n.getBoundingClientRect(),c=n.querySelector('.node-caption').getBoundingClientRect();return{id:n.dataset.node,width:r.width,inside:r.left>=m.left-1&&r.right<=m.right+1&&r.top>=m.top-1&&r.bottom<=m.bottom+1&&c.bottom<=m.bottom+1,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}),points:__frontier.game.ch.jobPoints,camera:__frontier.panels.jobJournal.snapshot().camera}});
  assert.equal(metrics.nodes.length,8);assert.ok(metrics.nodes.every(n=>n.inside&&n.hit&&Math.round(n.width)>=44),JSON.stringify(metrics));
  await p.screenshot({path:out+label+'-book.png'});
  const points=metrics.points;await p.locator('[data-action="zoom-in"]').tap();await p.locator('[data-action="fit"]').tap();await p.waitForTimeout(100);
  if(label==='clip'){await p.locator('#plane > [data-node="v1"]').tap();await p.waitForTimeout(100);assert.ok(await p.locator('.detail-scroll').evaluate(n=>n.clientHeight>=100),'compact inspector reserves readable scrolling space');await p.screenshot({path:out+'clip-book-detail.png'});await p.locator('[data-action="close-detail"]').tap();}
  await p.evaluate(()=>{const map=document.querySelector('#map');map.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,clientX:350,clientY:250,bubbles:true}));map.dispatchEvent(new PointerEvent('pointercancel',{pointerId:7,bubbles:true}));});
  assert.equal(await p.evaluate(()=>__frontier.game.ch.jobPoints),points);assert.deepEqual(errors,[]);reports.push({label,...metrics,pageErrors:errors});await ctx.close();
 }
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
 await enterFullscreenGate(p);await p.waitForFunction(t=>__frontier.game.time>t,time);await p.setViewportSize({width:640,height:1024});await p.waitForTimeout(250);await p.evaluate(()=>{const v=__frontier.view;Object.getPrototypeOf(v).render.call(v,0,performance.now()/1000,{});});await p.screenshot({path:out+'live-portrait.png'});
 await p.reload({waitUntil:'commit'});await p.waitForFunction(()=>window.__frontier?.menu);await freezeScene(p);await enterFullscreenGate(p);await p.locator('[data-act="continue"]').tap();await p.waitForFunction(()=>__frontier.game?.time>.1);assert.equal(await p.evaluate(()=>__frontier.game.ch.name),'นักเดินทาง');
 assert.deepEqual(errors,[]);reports.push({actualGame:true,overlap,exitPauses:true,reentryResumes:true,reloadContinuePreserved:true,pageErrors:errors});await ctx.close();
 writeFileSync(out+'live-report.json',JSON.stringify(reports,null,2));console.log('PASS fullscreen, HUD budget and book geometry review');}
} finally {await browser.close();}
