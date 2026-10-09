import assert from 'node:assert/strict';

// Exercise the whole list through native input, not by assigning scrollTop.
// Chromium exposes touch swipes. Mobile WebKit's supported public input uses
// the focusable region's native keyboard scrolling, then native touch taps.
// Keyboard coverage is not represented as physical Safari swipe coverage.
export async function verifyInventoryScroll(page,{context,engineName,width,height,touch,capture}){
 const click=async selector=>touch?page.locator(selector).first().tap():page.locator(selector).first().click();
 const fixture=await page.evaluate(()=>{
  const g=__frontier.game,ch=g.ch,stats={...ch.stats};for(const k in ch.stats)ch.stats[k]=100;
  const bases=Object.keys(g.data.items.gearBases);
  for(let i=0;i<64;i++)ch.gear.push({uid:ch.nextUid++,base:i===63?'rusty_sword':bases[i%bases.length],itemLevel:1,grade:'C',upgrade:0,options:[]});
  g.refresh();__frontier.panels.open('bag');return {count:ch.gear.length,last:ch.gear.at(-1).uid,stats};
 });
 if(height>width&&!(await page.locator('.library-window').isVisible()))await click('[data-action="view-side"][data-id="right"]');
 const cells=page.locator('.bag-grid .inventory-cell'),scroller=page.locator('.inventory-scroll');
 assert.equal(await cells.count(),fixture.count,'every owned item exists in the same list');
 assert.equal(await page.locator('[data-action="prev"],[data-action="next"]').count(),0,'no inventory page arrows');
 const bounds=await page.locator('.library-window').boundingBox();
 assert.ok(bounds.x>=10&&bounds.y>=10&&bounds.x+bounds.width<=width-10&&bounds.y+bounds.height<=height-10,'bounded inventory leaves scene margins');
 const box=await scroller.boundingBox(),x=box.x+box.width/2;
 if(touch&&engineName==='chromium'){
  const cdp=await context.newCDPSession(page),y=Math.min(box.y+box.height-20,height-60);
  for(let n=0;n<20;n++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let k=1;k<=8;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-k*14}]});await page.waitForTimeout(16);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
   if(await scroller.evaluate(e=>e.scrollTop>=e.scrollHeight-e.clientHeight-2))break;
  }
  await cdp.detach();
 }else if(touch&&engineName==='webkit'){
  await scroller.focus();assert.ok(await scroller.evaluate(e=>document.activeElement===e),'inventory region receives native keyboard input');
  const before=await scroller.evaluate(e=>e.scrollTop);
  await page.keyboard.press('PageDown');
  await page.waitForFunction(before=>document.querySelector('.inventory-scroll').scrollTop>before,before);
  await page.keyboard.press('End');
  await page.waitForFunction(()=>{const e=document.querySelector('.inventory-scroll');return e.scrollTop>=e.scrollHeight-e.clientHeight-2;});
 }else{
  await page.mouse.move(x,Math.min(box.y+60,height-30));
  // Real wheel steps also work in desktop WebKit; one huge delta may be
  // ignored by its scrolling implementation. Observe the resulting position.
  for(let n=0;n<40;n++){
   if(await scroller.evaluate(e=>e.scrollTop>=e.scrollHeight-e.clientHeight-2))break;
   await page.mouse.wheel(0,200);await page.waitForTimeout(80);
  }
 }
 await page.waitForTimeout(300);
 const end=await scroller.evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
 assert.ok(end.max>0&&end.top>=end.max-2,'native scrolling reaches the last row '+JSON.stringify(end));
 await click(`.inventory-cell[data-id="${fixture.last}"]`);
 assert.equal(await page.locator('.bag-grid .selected').getAttribute('data-id'),String(fixture.last));
 await capture('last-row');
 await click('.gear-shelf [data-action="details"]');assert.ok(await page.locator('.atelier-dialog').isVisible());await click('.detail-close');
 await click('.gear-shelf [data-action="equip"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.equipped.weapon),fixture.last,'last item equips through its reachable action');
 await page.locator('[data-filter]').selectOption('weapon');
 assert.equal(await cells.count(),await page.evaluate(()=>{const g=__frontier.game;return g.ch.gear.filter(i=>g.data.items.gearBases[i.base].slot==='weapon').length;}));
 await page.locator('[data-filter]').selectOption('all');assert.equal(await cells.count(),fixture.count);
 await click('[data-action="bag-category"][data-id="material"]');const last=await cells.last().getAttribute('data-id');await click(`.bag-grid .inventory-cell[data-id="${last}"]`);
 await click('[data-action="bag-category"][data-id="gear"]');
 if(height>width){await click('[data-action="view-side"][data-id="left"]');assert.ok(await page.locator('.character-window').isVisible());await click('[data-action="view-side"][data-id="right"]');}
 await click('[data-action="close"]');await page.evaluate(()=>__frontier.panels.open('bag'));
 assert.equal(await page.locator('.bag-grid .selected').getAttribute('data-id'),String(fixture.last),'reopening preserves selection');
 await click('.gear-shelf [data-action="details"]');await click('.detail-close');
 await page.evaluate(stats=>{Object.assign(__frontier.game.ch.stats,stats);__frontier.game.refresh();},fixture.stats);
}
