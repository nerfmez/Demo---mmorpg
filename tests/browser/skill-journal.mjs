// Focused integration: actual Panels/Game and real browser input, with optional live renderer.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {build} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {journalJump,verifyPassiveGestures} from './passive-checks.mjs';
import {freezeScene} from './freeze-scene.mjs';
const out=process.env.JOURNAL_OUT||new URL('./out/skill-journal/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const live=process.env.JOURNAL_URL,engineName=process.env.BROWSER||'chromium',engine=engineName==='webkit'?webkit:chromium;
let code='',css='';
if(!live){const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'JournalIntegration',formats:['iife']}}});code=b[0].output.find(f=>f.type==='chunk').code;css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal','loadout-workspace'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');for(const w of [400,600]){const f=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${w}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${f});font-weight:${w}}`;}}
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?(live?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--no-sandbox']):[]});
const cases=process.env.QUICK?[['ipad',1180,820,true,false]]:[['desktop',1440,900,false,false],['ipad',1180,820,true,false],['phone',390,844,true,false],['phone-landscape',844,390,true,false],['phone-reduced',390,844,true,true]];const reports=[];
try{for(const [label,width,height,touch,reduced] of cases){
 if(process.env.JOURNAL_CASES&&!process.env.JOURNAL_CASES.split(',').includes(label))continue;
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 if(live){await page.goto(live);await page.waitForFunction(()=>__frontier.game?.time>.2);await freezeScene(page);}
 else{await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:code});}
 await page.evaluate(()=>{const f=__frontier;f.panels.close();f.panels.journalState=null;Object.assign(f.game.ch,{jobLevel:20,jobPoints:19,gold:2400});f.panels.open('job');});await page.evaluate(()=>document.fonts.ready);
 const snapshot=()=>page.evaluate(()=>__frontier.panels.jobJournal.snapshot()),tap=async s=>{const l=page.locator(s).first();if(touch)await l.tap();else await l.click();};
 const stages=width<=760?'#mobile-stages':'#chapter-tabs';
 const stage=async tier=>{if(await page.locator('#sound-control').getAttribute('open')!==null)await tap('#sound-control summary');await tap(stages+` [data-stage="${tier}"]`);};
 assert.equal((await snapshot()).audio.contextState,'not-created');assert.equal((await snapshot()).audio.plays,0);assert.equal(await page.locator('.journal-toast').evaluate(el=>getComputedStyle(el).opacity),'0','journal toast never inherits the live HUD toast animation');
 assert.equal(await page.locator('#plane > [data-node]').count(),6);assert.equal(await page.locator('.seeker-constellation').count(),0);
 await page.waitForFunction(()=>[...document.querySelectorAll('#plane > button')].every(n=>+getComputedStyle(n).opacity>.99));await page.screenshot({path:out+label+'-start.png'});
 const points=(await snapshot()).points;await stage(2);assert.equal((await snapshot()).tier,2);assert.equal((await snapshot()).points,points);assert.ok(await page.locator('[data-discipline]').count()>=4);assert.equal(await page.locator('[data-discipline="impact"],[data-discipline="support"]').count(),2,'reviewed paths lead the first page; build lines follow');assert.equal(await page.locator('.stage-gated').count(),0);
 if(reduced)assert.equal(await page.locator('.paper-turn-layer').count(),0);else{assert.equal((await snapshot()).pageTurn.direction,1);assert.ok(await page.locator('.paper-turn-layer').count()<=1);}
 let signal=0;for(let i=0;i<12;i++){signal=Math.max(signal,(await snapshot()).audio.peak);await page.waitForTimeout(25);}
 const audioAvailable=await page.evaluate(()=>Boolean(window.AudioContext||window.webkitAudioContext));if(audioAvailable)assert.ok(signal>.002,'audio after gesture');
 await tap('[data-discipline="impact"]');assert.equal((await snapshot()).view,'path');assert.equal(await page.locator('#plane > [data-node]').count(),6);
 await journalJump(page,'path.impact');assert.ok(await page.locator('[data-action="learn"]').isEnabled());assert.equal((await snapshot()).preview.cost,1);
 await tap('[data-action="close-detail"]');await tap('[data-action="junction"]');assert.equal((await snapshot()).view,'junction');
 await stage(1);assert.equal((await snapshot()).pageTurn.direction,-1);
 await tap('#sound-control summary');await tap('#sound-mute');assert.equal((await snapshot()).audio.muted,true);const plays=(await snapshot()).audio.plays;
 await stage(2);await page.waitForTimeout(700);assert.equal((await snapshot()).audio.plays,plays);assert.equal((await snapshot()).audio.peak,0);
 await tap('#sound-control summary');await tap('#sound-mute');await page.locator('#sound-volume').fill('15');assert.equal((await snapshot()).audio.volume,.15);
 for(let i=0;i<6;i++){await stage(i%2?2:1);assert.ok((await snapshot()).pageTurn.layers<=1);assert.equal((await snapshot()).points,points);assert.equal(await page.locator('.paper-turn-layer [data-action],.paper-turn-layer [data-node]').count(),0);}
 await page.waitForFunction(()=>__frontier.panels.jobJournal.snapshot().pageTurn.layers===0,null,{timeout:5000});await page.waitForTimeout(550);assert.equal((await snapshot()).audio.activeVoice,false);
 await stage(1);await journalJump(page,'lesson.rhythm');assert.ok(await page.locator('[data-action="learn"]').isEnabled(),'directed prerequisite route is explicitly priced');assert.equal((await snapshot()).preview.cost,3);assert.equal((await snapshot()).points,points,'inspection never allocates');
 for(const id of ['lesson.prepare','lesson.strike','lesson.rhythm']){await journalJump(page,id);await tap('[data-action="learn"]');}
 assert.equal((await snapshot()).points,points-3);assert.equal((await snapshot()).progress.current.tier,5);
 const successful=await snapshot();assert.equal(successful.routes.events.length,3);await page.evaluate(()=>__frontier.panels.jobJournal.learn('lesson.rhythm'));assert.equal((await snapshot()).points,points-3);assert.equal((await snapshot()).routes.events.length,3,'duplicate purchase draws no route');
 await tap('[data-action="close-detail"]');await stage(2);await tap('[data-discipline="impact"]');await page.waitForFunction(()=>!document.querySelector('.paper-turn-layer')&&[...document.querySelectorAll('#plane > [data-node]')].every(n=>+getComputedStyle(n).opacity>.99));await page.waitForFunction(()=>+getComputedStyle(document.querySelector('#toast')).opacity===0);
 // The camera owns canvas movement. Native focus/scroll-into-view must not
 // scroll its clipped ancestors and leave a fitted map outside the screen.
 await page.waitForFunction(()=>!__frontier.panels.jobJournal.snapshot().camera.active);
 for(const id of ['path.impact','path.horizon'])await page.locator(`#plane > [data-node="${id}"]`).evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));
 const canvasScroll=await page.locator('.app-shell,.atlas-space,#map').evaluateAll(es=>es.map(el=>({id:el.id||el.className,left:el.scrollLeft,top:el.scrollTop})));
 assert.ok(canvasScroll.every(el=>el.left===0&&el.top===0),'native scrolling cannot offset the journal camera: '+JSON.stringify(canvasScroll));
 await page.screenshot({path:out+label+'-six-subnodes.png'});
 const targets=await page.locator('#plane > [data-node]').evaluateAll(es=>es.map(el=>{const r=el.getBoundingClientRect(),m=document.querySelector('#map').getBoundingClientRect(),c=el.querySelector('.node-caption').getBoundingClientRect();return {id:el.dataset.node,width:r.width,height:r.height,inside:r.left>=m.left-1&&r.top>=m.top-1&&r.right<=m.right+1&&c.bottom<=m.bottom+1,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));assert.ok(targets.every(t=>Math.round(t.width)>=44&&Math.round(t.height)>=44&&t.inside&&t.hit),JSON.stringify(targets));
 const captionOverlap=await page.locator('#plane > [data-node]').evaluateAll(es=>{const boxes=es.map(el=>{const range=document.createRange();range.selectNodeContents(el.querySelector('.node-caption b'));return range.getBoundingClientRect();});return boxes.some((a,i)=>boxes.some((b,j)=>j>i&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));});assert.equal(captionOverlap,false,'node names remain separate at fit zoom');
 await tap('[data-action="junction"]');await stage(3);assert.ok(await page.locator('[data-discipline]').count()>=3);
 for(const id of ['lesson.care','lesson.shelter','path.impact','path.burst','path.support']){await journalJump(page,id);await tap('[data-action="learn"]');}
 await journalJump(page,'advanced.flow');assert.ok(await page.locator('[data-action="learn"]').isEnabled(),'mixed group begins independently');
 const eventsBefore=(await snapshot()).routes.events.length;await tap('[data-action="learn"]');
 const mixed=await snapshot();assert.equal(mixed.routes.events.length,eventsBefore,'independent roots draw no external acquisition edges');assert.equal(mixed.points,points-9);
 await stage(2);assert.equal((await snapshot()).routes.active,0,'navigation interrupts route animation cleanly');await stage(1);

 await tap('[data-action="respec"]');const ownedBeforeCancel=(await snapshot()).owned;await tap('[data-action="cancel-respec"]');assert.deepEqual((await snapshot()).owned,ownedBeforeCancel);
 await tap('[data-action="search"]');await page.locator('#node-search').fill('lesson');await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(d=>d.open),false);
 await tap('[data-action="exit"]');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);assert.equal(await page.evaluate(()=>__frontier.panels.jobJournal),null);
 for(let i=0;i<4;i++){await page.evaluate(()=>__frontier.panels.open('job'));assert.equal((await snapshot()).audio.contextState,'not-created');assert.equal((await snapshot()).audio.volume,.15);await stage(1);await tap('[data-action="exit"]');}
 await page.evaluate(()=>__frontier.panels.open('bag'));assert.equal(await page.locator('.skill-journal').count(),0);await page.screenshot({path:out+label+'-bag.png'});
 if(['ipad','phone','phone-landscape'].includes(label))await verifyPassiveGestures(page,{context,engineName,capture:async name=>{await page.waitForFunction(()=>!document.querySelector('.paper-turn-layer')&&[...document.querySelectorAll('#plane > button')].every(n=>+getComputedStyle(n).opacity>.99));await page.screenshot({path:out+label+'-'+name+'.png'});}});
 assert.deepEqual(errors,[]);reports.push({label,width,height,touch,reduced,source:live?'full game':'real Game+Panels without renderer',ok:true,peak:signal,pointsAfterThree:points-3,checks:['no-autoplay','forward-back','immediate-navigation','mute-volume','one-inert-leaf','rapid-cancellation','directed-prerequisites','confirmed-routes','rejected-and-repeat-purchases','free-gateways','cancel-and-back','repeated-close-open','other-workspace-intact'],pageErrors:errors});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS integrated journal '+engineName+' '+label);await context.close();
}}finally{await browser.close();}
