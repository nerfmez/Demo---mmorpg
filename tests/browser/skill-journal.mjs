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
if(!live){const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'JournalIntegration',formats:['iife']}}});code=b[0].output.find(f=>f.type==='chunk').code;css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');for(const w of [400,600]){const f=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${w}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${f});font-weight:${w}}`;}}
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?(live?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--no-sandbox']):[]});
const cases=process.env.QUICK?[['ipad',1180,820,true,false]]:[['desktop',1440,900,false,false],['ipad',1180,820,true,false],['phone',390,844,true,false],['phone-reduced',390,844,true,true]];const reports=[];
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
 assert.equal(await page.locator('#plane > [data-node]').count(),8);assert.equal(await page.locator('.seeker-constellation').count(),0);await page.screenshot({path:out+label+'-start.png'});
 const points=(await snapshot()).points;await stage(2);assert.equal((await snapshot()).tier,2);assert.equal((await snapshot()).points,points);assert.ok(await page.locator('#locked-region').isVisible());
 if(reduced)assert.equal(await page.locator('.paper-turn-layer').count(),0);else{assert.equal((await snapshot()).pageTurn.direction,1);assert.ok(await page.locator('.paper-turn-layer').count()<=1);}
 let signal=0;for(let i=0;i<12;i++){signal=Math.max(signal,(await snapshot()).audio.peak);await page.waitForTimeout(25);}
 const audioAvailable=await page.evaluate(()=>Boolean(window.AudioContext||window.webkitAudioContext));if(audioAvailable)assert.ok(signal>.002,'real browser audio destination produces signal after gesture');
 await stage(1);assert.equal((await snapshot()).pageTurn.direction,-1);
 await tap('#sound-control summary');await tap('#sound-mute');assert.equal((await snapshot()).audio.muted,true);const plays=(await snapshot()).audio.plays;
 await stage(2);await page.waitForTimeout(700);assert.equal((await snapshot()).audio.plays,plays);assert.equal((await snapshot()).audio.peak,0);
 await tap('#sound-control summary');await tap('#sound-mute');await page.locator('#sound-volume').fill('15');assert.equal((await snapshot()).audio.volume,.15);
 for(let i=0;i<6;i++){await stage(i%2?2:1);assert.ok((await snapshot()).pageTurn.layers<=1);assert.equal((await snapshot()).points,points);assert.equal(await page.locator('.paper-turn-layer [data-action],.paper-turn-layer [data-node]').count(),0);}
 await page.waitForFunction(()=>__frontier.panels.jobJournal.snapshot().pageTurn.layers===0,null,{timeout:5000});await page.waitForTimeout(550);assert.equal((await snapshot()).audio.activeVoice,false);
 await stage(1);await journalJump(page,'v2');assert.ok(await page.locator('[data-action="learn"]').isDisabled(),'predecessor is required');
 for(const id of ['v1','a1','r1']){await journalJump(page,id);await tap('[data-action="learn"]');}
 assert.equal((await snapshot()).points,points-3);assert.equal((await snapshot()).progress.current.tier,2);await tap('[data-action="close-detail"]');await stage(2);assert.ok(await page.locator('#map').isVisible());assert.equal(await page.locator('[data-discipline]').count(),0);await page.waitForFunction(()=>!document.querySelector('.paper-turn-layer')&&[...document.querySelectorAll('#plane > [data-node]')].every(n=>+getComputedStyle(n).opacity>.99));await page.screenshot({path:out+label+'-ordinary.png'});
 const old=(await snapshot()).travelPage;await tap('[data-travel-page="1"]');await tap('[data-travel-page="-1"]');assert.equal((await snapshot()).travelPage,old);assert.equal((await snapshot()).points,points-3);
 await tap('[data-action="exit"]');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);assert.equal(await page.evaluate(()=>__frontier.panels.jobJournal),null);
 for(let i=0;i<4;i++){await page.evaluate(()=>__frontier.panels.open('job'));assert.equal((await snapshot()).audio.contextState,'not-created');assert.equal((await snapshot()).audio.volume,.15);await stage(1);await tap('[data-action="exit"]');}
 await page.evaluate(()=>__frontier.panels.open('bag'));assert.equal(await page.locator('.skill-journal').count(),0);await page.screenshot({path:out+label+'-bag.png'});
 if(label==='ipad')await verifyPassiveGestures(page,{context,engineName,capture:async name=>{await page.screenshot({path:out+label+'-'+name+'.png'});}});
 assert.deepEqual(errors,[]);reports.push({label,width,height,touch,reduced,source:live?'full game':'real Game+Panels without renderer',ok:true,peak:signal,pointsAfterThree:points-3,checks:['no-autoplay','forward-back','immediate-navigation','mute-volume','one-inert-leaf','rapid-cancellation','core-predecessors','mixable-early-purchases','page-memory','repeated-close-open','other-workspace-intact'],pageErrors:errors});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS integrated journal '+engineName+' '+label);await context.close();
}}finally{await browser.close();}
