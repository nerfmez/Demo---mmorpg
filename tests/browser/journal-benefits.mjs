// Benefits-first presentation: real Game/Panel input and measured, unscrolled content.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {journalJump} from './passive-checks.mjs';
const out=process.env.JOURNAL_OUT||new URL('./out/journal-benefits/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const bundle=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'BenefitsReview',formats:['iife']}}});
const code=bundle[0].output.find(x=>x.type==='chunk').code;
let css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const weight of [400,600])css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64')});font-weight:${weight}}`;
const reviewControls='<button hidden id="review-open" style="position:fixed;top:45%;left:50%;transform:translateX(-50%);min-height:48px;padding:12px 22px;border:1px solid #8b7a58;background:#fbf3dd;color:#59644f;font:16px AtlasThai,sans-serif">เปิดสมุดบันทึกอีกครั้ง</button>';
const html='<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local skill benefits review</title><style>'+css+'</style><body><div id="hud"></div>'+reviewControls+'<script>'+code.replaceAll('</script','<\\/script')+'\n__frontier.game.ch.jobLevel=20;__frontier.game.ch.jobPoints=19;__frontier.panels.onVisibility=open=>document.querySelector("#review-open").hidden=open;document.querySelector("#review-open").onclick=()=>__frontier.panels.open("job");__frontier.panels.open("job");</script></body></html>';
writeFileSync(out+'interactive-review.html',html);
if(process.env.JOURNAL_EXPORT_ONLY)process.exit(0);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
const cases=[['desktop',1440,900,false],['ipad',1180,820,true],['reference-clip',776,540,true],['phone',390,844,true],['phone-short',390,667,true],['phone-landscape',844,390,true]];const report=[];
try{for(const [label,width,height,touch] of cases){
 if(process.env.JOURNAL_CASES&&!process.env.JOURNAL_CASES.split(',').includes(label))continue;
 const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch,...(label==='ipad'&&process.env.JOURNAL_VIDEO?{recordVideo:{dir:out+'video/',size:{width,height}}}:{})});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(html);await page.waitForFunction(()=>__frontier.panels.jobJournal&&!__frontier.panels.jobJournal.snapshot().camera.active);await page.waitForTimeout(500);
 const tap=async selector=>touch?page.locator(selector).tap():page.locator(selector).click();
 const snapshot=()=>page.evaluate(()=>__frontier.panels.jobJournal.snapshot());
 const measured=[];
 async function essentials(name,key,value){
  await page.waitForFunction(()=>!__frontier.panels.jobJournal.snapshot().camera.active);await page.waitForTimeout(500);
  const actual=await page.locator(`[data-benefit="${key}"]`).innerText();assert.ok(actual.includes(value),actual);
  const fit=await page.evaluate(()=>{
   const inspector=document.querySelector('#inspector'),r=inspector.getBoundingClientRect(),essential=document.querySelector('.detail-essential'),content=document.querySelector('#detail-content');
   const items=[...document.querySelectorAll('.detail-header h2,.node-benefits>div,.availability,.blocking-prerequisites button,.learn-button,.detail-more,.inspector-close')].map(el=>{
    const b=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect();return {text:el.textContent.trim(),inside:b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1&&text.bottom<=b.bottom+1,visible:b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth,hit:el.matches('button')?el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)):true};
   });
   return {items,scroll:[inspector,essential,content].map(el=>({class:el.className,client:el.clientHeight,scroll:el.scrollHeight,top:el.scrollTop}))};
  });
  assert.ok(fit.items.every(x=>x.inside&&x.visible&&x.hit),name+' '+JSON.stringify(fit.items));assert.ok(fit.scroll.every(x=>x.scroll<=x.client+1&&x.top===0),name+' '+JSON.stringify(fit.scroll));measured.push({name,...fit});
  await page.waitForFunction(()=>+getComputedStyle(document.querySelector('#toast')).opacity===0);await page.screenshot({path:out+label+'-'+name+'.png'});
 }
 const summaries=await page.locator('.node-caption small').allTextContents();assert.ok(summaries.includes('HP +12'));assert.ok(summaries.includes('การฟื้นฟู +5%'));assert.ok(summaries.every(x=>!x.includes('ก่อน:')));
 await page.screenshot({path:out+label+'-overview.png'});
 await journalJump(page,'lesson.care');assert.equal(await page.locator('.learn-button').isEnabled(),true);await essentials('basic-route-preview','healPct','+5%');
 const before=await snapshot();await page.evaluate(()=>__frontier.panels.jobJournal.learn('lesson.care'));assert.equal((await snapshot()).points,before.points);assert.equal((await snapshot()).routes.events.length,0);
 await tap('[data-node="lesson.prepare"]');await essentials('basic-ready','maxHp','+12');assert.equal(await page.locator('.learn-button').isEnabled(),true);
 await tap('.learn-button');await essentials('basic-owned','maxHp','+12');assert.equal((await snapshot()).points,before.points-1);assert.equal(await page.locator('.learn-button').isDisabled(),true);
 const paid=await snapshot();await page.evaluate(()=>__frontier.panels.jobJournal.learn('lesson.prepare'));assert.deepEqual((await snapshot()).owned,paid.owned);assert.equal((await snapshot()).routes.events.length,paid.routes.events.length);
 if(label==='phone'){
  await page.evaluate(()=>{__frontier.game.ch.jobPoints=0;__frontier.panels.jobJournal.refresh();});await journalJump(page,'lesson.care');await essentials('basic-no-points','healPct','+5%');assert.equal(await page.locator('.learn-button').isDisabled(),true);assert.ok((await page.locator('.availability').innerText()).includes('ไม่เพียงพอ'));
  const blocked=await snapshot();await page.evaluate(()=>__frontier.panels.jobJournal.learn('lesson.care'));assert.deepEqual((await snapshot()).owned,blocked.owned);assert.equal((await snapshot()).routes.events.length,blocked.routes.events.length);await page.evaluate(()=>{__frontier.game.ch.jobPoints=18;__frontier.panels.jobJournal.refresh();});
 }
 for(const id of ['lesson.strike','lesson.rhythm','lesson.care','lesson.shelter','path.impact','path.reach']){await journalJump(page,id);await tap('.learn-button');}
 await journalJump(page,'advanced.flow');assert.equal(await page.locator('.blocking-prerequisites button').count(),0);await essentials('advanced-independent','moveSpeedPct','+2.5%');
 await tap('[data-action="node-details"]');await page.locator('#dialog').evaluate(async d=>Promise.all(d.getAnimations().map(a=>a.finished)));assert.equal(await page.locator('#dialog').evaluate(d=>d.open),true);assert.ok((await page.locator('.expanded-node-note').innerText()).includes('เริ่มได้ทันที'));await page.screenshot({path:out+label+'-advanced-details.png'});
 const modalFit=await page.locator('#dialog').evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollHeight<=d.clientHeight+1&&r.top>=0&&r.bottom<=innerHeight;});assert.equal(modalFit,true,'explicit advanced details fit');await tap('#dialog [data-action="back-to-node"]');assert.equal((await snapshot()).selected,'advanced.flow');
 for(const id of ['path.precision','path.horizon']){await journalJump(page,id);await tap('.learn-button');}
 await journalJump(page,'advanced.power');await essentials('advanced-ready','castSpeedPct','+2.5%');await tap('.learn-button');await essentials('advanced-owned','castSpeedPct','+2.5%');
 await tap('[data-action="close-detail"]');await tap('[data-action="junction"]');assert.equal((await snapshot()).view,'junction');
 await tap('[data-action="respec"]');const unchanged=await snapshot();await tap('[data-action="cancel-respec"]');assert.deepEqual((await snapshot()).owned,unchanged.owned);await tap('[data-action="exit"]');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);assert.equal(await page.evaluate(()=>__frontier.panels.jobJournal),null);await page.evaluate(()=>__frontier.panels.open('job'));assert.deepEqual((await snapshot()).owned,unchanged.owned);
 assert.deepEqual(errors,[]);const video=page.video();await context.close();if(video){await video.saveAs(out+label+'-interaction.webm');}
 report.push({label,width,height,ok:true,checks:['stat-subtitles','basic-locked-ready-owned','advanced-locked-ready-owned','explicit-details-back','all-essential-info-without-scroll','hit-tested-controls','directed-rejected-and-repeated-purchase','cancel-close-back-retain-progress'],measured,pageErrors:errors});writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log('PASS benefits '+label);
}}finally{await browser.close();}
