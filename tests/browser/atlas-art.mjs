// Focused real-game Atlas capture; no world/map geometry or gameplay mutations.
// ATLAS_URL=http://localhost:4195 CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/atlas-art.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=new URL('./out/atlas-art/',import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:960},hasTouch:true});
const page=await context.newPage(),errors=[],badImages=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(/\/assets\/icons\/(monster|region)\//.test(r.url())&&r.status()!==200)badImages.push([r.status(),r.url()]);});
const report={regions:[],viewports:[],errors,badImages};
try{
 await page.goto((process.env.ATLAS_URL||'http://localhost:4195')+'/?fresh=1&quality=low');
 await page.waitForFunction(()=>window.__frontier?.game,null,{timeout:60000});
 await page.evaluate(()=>{__frontier.paused=true;__frontier.panels.open('map');});
 const regions=await page.locator('.region-card').evaluateAll(es=>es.map(e=>e.dataset.id));
 assert.equal(regions.length,17);
 const seen=new Set();
 for(const region of regions){
  // Exercise the existing select-zone control, including same zone IDs on different maps.
  await page.locator(`.region-card[data-id="${region}"]`).click();
  const result=await page.evaluate(async()=>{
   const f=__frontier,[map,id]=f.panels.sel.zone.split(':'),data=f.game.data,m=data.maps[map],world=f.game.worlds[map];
   const expected=[...new Set([...m.spawns.filter(s=>s.zone===id).map(s=>s.monster),...m.bosses.filter(b=>world.zoneAt(...b.pos).id===id).map(b=>b.monster)])];
   const cards=[...document.querySelectorAll('.region-card')];
   for(const card of cards){const img=card.querySelector('.art>img');if(!img)throw Error('missing location '+card.dataset.id);await img.decode();if(img.naturalWidth!==256)throw Error('location native dimensions');}
   const entries=[...document.querySelectorAll('.creature-entry')];
   for(const entry of entries){const img=entry.querySelector(':scope>.art>img');if(!img)throw Error('missing monster portrait');await img.decode();const key=img.parentElement.dataset.art.split('/')[1];if(entry.querySelector(':scope>div>b').textContent!==data.monsters.monsters[key].nameTh)throw Error('monster name mismatch');if(img.naturalWidth!==256)throw Error('portrait native dimensions');}
   return {expected,actual:entries.map(e=>e.querySelector(':scope>.art').dataset.art.split('/')[1]),drops:entries.flatMap(e=>[...e.querySelectorAll('.drop-pictures .art')].map(a=>a.dataset.art)),bossPins:[...document.querySelectorAll('.bossmark .art')].every(e=>!!e.querySelector('svg'))};
  });
  assert.deepEqual(result.actual,result.expected,region);
  assert.ok(result.drops.every(key=>key.startsWith('material/')),region+' existing material art');
  assert.ok(result.bossPins,region+' authored boss pins');
  result.actual.forEach(id=>seen.add(id));report.regions.push({region,monsters:result.actual});
 }
 assert.equal(seen.size,18);
 for(const [name,width,height] of [['desktop',1440,960],['ipad',1180,820],['mobile-landscape',844,390],['mobile-portrait',390,844]]){
  await page.setViewportSize({width,height});
  // The live WebGL canvas handles resize on the next render frame.
  await page.waitForFunction(()=>document.querySelector('canvas').getBoundingClientRect().width<=innerWidth+2);
  await page.evaluate(()=>{__frontier.panels.sel.zone='frontier-wilds-v1:forest';__frontier.panels.open('map');});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
  const sizes=await page.locator('.creature-entry>.art').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}));
  assert.ok(sizes.every(([w,h])=>w===50&&h===50),name+' existing 50px portrait footprint');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' no page overflow');
  await page.locator('.region-card').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:out+name+'-places.png'});
  await page.locator('.creature-entry').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({path:out+name+'-monsters.png'});
  report.viewports.push({name,width,height,portraitSizes:sizes});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(badImages,[]);
 report.monsterCount=seen.size;report.engine='Chromium';report.webkit='Unavailable in this environment; no physical iPad claim';
 writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS Atlas: 17 regions, 18 portraits, four viewports, zero page/image errors.');
}finally{await browser.close();}
