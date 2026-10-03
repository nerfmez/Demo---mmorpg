// Real input regression for the integrated book. Current core remains authoritative.
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {jobNodeState} from '../../src/core/character.js';
const data=loadData();
export async function journalJump(page,id){
 const search=page.locator('[data-action="search"]').first();await search.click();
 await page.locator('#node-search').fill(id);
 await page.locator(`#search-results [data-jump="${id}"]`).first().click();
 await page.waitForFunction(id=>window.__frontier.panels.jobJournal.snapshot().selected===id||!window.__frontier.panels.jobJournal.snapshot().progress.stages.find(s=>s.tier===window.__frontier.panels.jobJournal.snapshot().tier).unlocked,id);
}
export async function verifyPassiveGestures(page,{context,engineName,capture=async()=>{}}){
 await page.evaluate(()=>{const f=window.__frontier;f.panels.close();f.game.ch.jobNodes=['origin'];f.game.ch.jobLevel=20;f.game.ch.jobPoints=19;f.game.ch.gold=1000;f.panels.journalState=null;f.panels.open('job');});
 const tap=async s=>{const t=page.locator(s).first();if(await page.evaluate(()=>navigator.maxTouchPoints>0))await t.tap();else await t.click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const state=()=>page.evaluate(()=>__frontier.panels.jobJournal.snapshot());
 assert.equal(await page.locator('#plane > [data-node]').count(),6);assert.equal(await page.locator('.seeker-constellation').count(),0);
 assert.equal((await state()).audio.plays,0);assert.equal((await state()).audio.contextState,'not-created');
 await journalJump(page,'lesson.prepare');assert.equal((await state()).owned.length,1,'inspection never spends');await tap('[data-action="learn"]');assert.equal((await state()).points,18);
 for(const id of ['lesson.strike','lesson.rhythm','path.impact','path.reach','path.precision','path.horizon']){await journalJump(page,id);await tap('[data-action="learn"]');}
 assert.equal((await state()).progress.spent,7);await journalJump(page,'advanced.power');assert.ok(await page.locator('[data-action="learn"]').isEnabled());
 await journalJump(page,'advanced.flow');assert.ok(await page.locator('[data-action="learn"]').isDisabled(),'both named parents required');
 await journalJump(page,'advanced.power');await capture('job-detail');await tap('[data-action="close-detail"]');
 const before=await state();
 await page.locator('#map').evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:91,pointerType:'touch',clientX:100,clientY:150}));el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:91}));});
 await tap('[data-action="zoom-out"]');await tap('[data-action="zoom-in"]');
 // A fitted wide spread has no horizontal room to pan. Zoom using the actual
 // controls until there is room for this drag; keep the purchase assertions.
 for(let i=0;i<6;i++){
  const room=await page.locator('#map').evaluate(el=>document.querySelector('#plane').offsetWidth*window.__frontier.panels.jobJournal.snapshot().camera.z-el.clientWidth);
  if(room>150)break;
  await tap('[data-action="zoom-in"]');
 }
 const box=await page.locator('#map').boundingBox(),cameraBefore=(await state()).camera;
 await page.mouse.move(box.x+box.width*.35,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.35+55,box.y+box.height*.4+15,{steps:6});await page.mouse.up();
 assert.ok(Math.abs((await state()).camera.x-cameraBefore.x)>20,'drag pans without purchase');
 if(engineName==='chromium'&&page.viewportSize().width===1180){const cdp=await context.newCDPSession(page),old=(await state()).camera.z,x=box.x+box.width*.35,y=box.y+box.height*.35;try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y,id:1},{x:x+35,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-62,y,id:1},{x:x+62,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await state()).camera.z>old);}finally{await cdp.detach();}}
 assert.deepEqual((await state()).owned,before.owned);assert.equal((await state()).selected,before.selected);
 await tap('[data-action="junction"]');assert.ok(await page.locator('[data-discipline]').count());const points=(await state()).points;
 if(page.viewportSize().height<=520){
  await page.waitForFunction(()=>!document.querySelector('.paper-turn-layer')&&[...document.querySelectorAll('[data-discipline]')].every(el=>{const r=el.getBoundingClientRect(),m=document.querySelector('#map').getBoundingClientRect();return r.left>=m.left&&r.top>=m.top&&r.right<=m.right&&r.bottom<=m.bottom&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),null,{timeout:10000});
  const targets=await page.locator('[data-discipline]').evaluateAll(es=>es.map(el=>{const r=el.getBoundingClientRect(),m=document.querySelector('#map').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:el.dataset.discipline,w:r.width,h:r.height,inMap:r.left>=m.left&&r.top>=m.top&&r.right<=m.right&&r.bottom<=m.bottom,hit:el.contains(hit)};}));
  assert.ok(targets.every(t=>t.w>=44&&t.h>=44&&t.inMap&&t.hit),'all compact spread branch targets stay in the map and accept native taps: '+JSON.stringify(targets));
 }
 const group=await page.locator('[data-discipline]').first().getAttribute('data-discipline');await tap(`[data-discipline="${group}"]`);await tap('[data-action="junction"]');assert.equal((await state()).points,points);if(await page.locator('[data-junction-page="1"]:not(:disabled)').count()){await tap('[data-junction-page="1"]');const spread=(await state()).junctionPage,key=await page.locator('[data-discipline]').first().getAttribute('data-discipline');await tap(`[data-discipline="${key}"]`);await tap('[data-action="junction"]');assert.equal((await state()).junctionPage,spread,'drilldown returns to the same dense spread');assert.equal((await state()).points,points);}
 await capture('job-overview');
 await tap('[data-action="exit"]');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);
}
