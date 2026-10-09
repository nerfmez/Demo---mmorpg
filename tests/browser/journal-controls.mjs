import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadData} from '../../src/core/data-node.js';
import {createPresentation,currentPresentation} from '../../src/ui/skill-journal/presentation.js';

const tree=loadData().jobtree;
const presentation=createPresentation(tree,tree.presentation||currentPresentation);
const snapshot=page=>page.evaluate(()=>__frontier.panels.jobJournal.snapshot());
const input=async(page,target,touch)=>touch?target.tap():target.click();

// Use the controls the user can actually see. Short landscape deliberately
// hides the chapter rail; its footer still navigates the same chapter state.
export async function selectJournalStage(page,tier,{touch=false}={}){
 const visible=page.locator(`.skill-journal [data-stage="${tier}"]:visible`).first();
 if(await visible.count())await input(page,visible,touch);
 else{
  for(let n=0;(await snapshot(page)).tier!==tier;n++){
   assert.ok(n<presentation.tiers.length,'visible chapter navigation reaches '+tier);
   const current=(await snapshot(page)).tier,direction=Math.sign(presentation.tiers.indexOf(tier)-presentation.tiers.indexOf(current));
   const next=page.locator(`.skill-journal footer [data-page="${direction}"]:visible`);
   assert.equal(await next.count(),1,'visible footer chapter control');
   assert.ok(await next.isEnabled(),'chapter control enabled');
   await input(page,next,touch);
   assert.notEqual((await snapshot(page)).tier,current,'footer changes the chapter');
  }
 }
 assert.equal((await snapshot(page)).tier,tier,'native navigation selects the requested chapter');
}

// Width determines cards per spread. Check the complete data-owned group set
// through native pagination, then restore the first spread for later actions.
export async function verifyJournalGroups(page,tier,{touch=false}={}){
 const expected=presentation.hubs(tier).map(g=>g.id),seen=[];
 const before=await snapshot(page);
 assert.equal(before.tier,tier);
 assert.equal(before.junctionPage,0,'start coverage on the first spread');
 for(;;){
  await page.waitForFunction(()=>!document.querySelector('.paper-turn-layer')&&!__frontier.panels.jobJournal.snapshot().camera.active);
  const ids=await page.locator('[data-discipline]').evaluateAll(es=>es.map(e=>e.dataset.discipline));
  assert.ok(ids.length>0,'each spread contains real branch cards');
  for(const id of ids){assert.ok(expected.includes(id),'expected branch '+id);assert.ok(!seen.includes(id),'branch appears once '+id);seen.push(id);}
  const next=page.locator('#junction-pagination [data-junction-page="1"]:visible:not(:disabled)');
  if(!await next.count())break;
  const old=(await snapshot(page)).junctionPage;
  await input(page,next,touch);assert.equal((await snapshot(page)).junctionPage,old+1);
 }
 assert.deepEqual([...seen].sort(),[...expected].sort(),'all expected branches available across real spreads');
 if(tier===2)for(const id of ['impact','support'])assert.ok(seen.includes(id),'reviewed branch '+id+' remains available');
 while((await snapshot(page)).junctionPage>0)await input(page,page.locator('#junction-pagination [data-junction-page="-1"]:visible:not(:disabled)'),touch);
 const after=await snapshot(page);assert.equal(after.tier,tier);assert.equal(after.points,before.points);assert.deepEqual(after.owned,before.owned,'pagination never purchases');
 return seen;
}

// A bounded page may be taller than its viewport at the readable minimum zoom.
// Prove every whole target/caption is reachable via the camera's real controls.
export async function verifyJournalNodeReachability(page,{touch=false}={}){
 const ids=await page.locator('#plane > [data-node]').evaluateAll(es=>es.map(e=>e.dataset.node));
 const before=await snapshot(page);
 for(const id of ids){
  await input(page,page.locator('[data-action="fit"]'),touch);
  await page.locator('#map').focus();
  let target,previous;
  for(let n=0;n<30;n++){
   await page.waitForFunction(()=>!__frontier.panels.jobJournal.snapshot().camera.active);
   target=await page.locator(`#plane > [data-node="${id}"]`).evaluate(e=>{
    const r=e.getBoundingClientRect(),m=document.querySelector('#map').getBoundingClientRect(),c=e.querySelector('.node-caption').getBoundingClientRect();
    return {width:r.width,height:r.height,left:Math.min(r.left,c.left)-m.left,right:Math.max(r.right,c.right)-m.right,top:r.top-m.top,bottom:Math.max(r.bottom,c.bottom)-m.bottom,cy:r.y+r.height/2-(m.y+m.height/2),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
   });
   if(target.left>=-1&&target.right<=1&&target.top>=-1&&target.bottom<=1&&target.hit)break;
   // At overview zoom a short strip may be smaller than the viewport and
   // correctly refuse further pan. Use its real zoom control to gain room.
   if(previous&&Math.abs(target.left-previous.left)+Math.abs(target.top-previous.top)<1){await input(page,page.locator('[data-action="zoom-in"]'),touch);await page.locator('#map').focus();previous=null;continue;}
   previous=target;
   const key=target.left< -1?'ArrowLeft':target.right>1?'ArrowRight':target.top< -1?'ArrowUp':target.bottom>1?'ArrowDown':target.cy<0?'ArrowUp':'ArrowDown';
   await page.keyboard.press(key);
  }
  assert.ok(Math.round(target.width)>=44&&Math.round(target.height)>=44&&target.left>=-1&&target.right<=1&&target.top>=-1&&target.bottom<=1&&target.hit,'whole readable node reachable via native pan '+JSON.stringify({id,...target}));
  await input(page,page.locator(`#plane > [data-node="${id}"]`),touch);
  assert.equal((await snapshot(page)).selected,id);
  await input(page,page.locator('[data-action="close-detail"]'),touch);
  assert.equal((await snapshot(page)).points,before.points);assert.deepEqual((await snapshot(page)).owned,before.owned,'pan/inspect never purchases');
 }
 await input(page,page.locator('[data-action="fit"]'),touch);
 await page.waitForFunction(()=>!__frontier.panels.jobJournal.snapshot().camera.active);
 return ids;
}

// Match the production cascade, including compact overrides and imported
// loadout styles, rather than testing the superseded fullscreen paper.
export function journalHarnessStyles(){
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const paths=[...html.matchAll(/href="(\/src\/ui\/[^\"]+\.css)"/g)].map(m=>m[1]);
 paths.splice(paths.indexOf('/src/ui/compact.css'),0,'/src/ui/loadout-workspace.css');
 let css=paths.map(p=>readFileSync(new URL('../..'+p,import.meta.url),'utf8')).join('\n');
 for(const weight of [400,600]){const bytes=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${bytes});font-weight:${weight}}`;}
 for(const subset of ['thai','latin'])for(const weight of [400,500,600]){const bytes=readFileSync(new URL(`../../node_modules/@fontsource/mitr/files/mitr-${subset}-${weight}-normal.woff2`,import.meta.url)).toString('base64');css+=`@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${bytes});font-weight:${weight}}`;}
 return css;
}
