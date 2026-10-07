// Focused real-game review: retained invalid slots, deficits, recovery and touch details.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {freezeScene} from './freeze-scene.mjs';
const out='tests/browser/out/equipment-inactive'+(process.env.OFFLINE_UI?'-harness':'');mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4186','--strictPort'],{stdio:'ignore'});
for(let n=0;;n++){try{if((await fetch('http://127.0.0.1:4186')).ok)break;}catch{}if(n>40)throw Error('local server unavailable');await new Promise(r=>setTimeout(r,150));}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
try{
 for(const [name,width,height,touch] of (process.env.UI_DEVICE==='tablet'?[['ipad',1180,820,true]]:[['desktop',1440,900,false],['ipad',1180,820,true],['phone',844,390,true]])){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.OFFLINE_UI)await page.route('**/?fresh=*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><head>${['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','loadout-workspace','skill-journal/journal'].map(n=>`<link rel="stylesheet" href="/src/ui/${n}.css">`).join('')}<style>@font-face{font-family:Mitr;src:url('/node_modules/@fontsource/mitr/files/mitr-thai-400-normal.woff2')}</style></head><body><div id="hud"></div><script type="module" src="/tests/browser/workspace-harness.js"></script></body></html>`}));
  await page.goto('http://127.0.0.1:4186/?fresh=1&quality=low&stream=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__frontier?.game?.time>=.3&&(!document.getElementById('loading')||document.getElementById('loading').classList.contains('done')),null,{timeout:90000});await freezeScene(page);
  const ids=await page.evaluate(async()=>{
   const {equip,gearRequirements}=await import('/src/core/character.js');const f=__frontier,g=f.game,ch=g.ch;
   for(const k in ch.stats)ch.stats[k]=100;ch.gold=100000;
   const give=()=>{const it={uid:ch.nextUid++,base:'rusty_sword',itemLevel:1,grade:'C',upgrade:0,options:[]};ch.gear.push(it);return it;};
   const a=give(),b=give();equip(ch,g.data,a.uid);equip(ch,g.data,b.uid,'offhand');
   const own=gearRequirements(a,g.data);for(const [k,n] of Object.entries(own))ch.stats[k]=n;
   g.refresh();f.panels.open('bag');return {a:a.uid,b:b.uid};
  });
  const tap=async selector=>{const l=page.locator(selector).first();await(touch?l.tap():l.click());};
  await tap(`.wear-slot[data-id="${ids.a}"]`);
  assert.equal(await page.locator('.wear-slot.equipment-inactive').count(),2);
  const border=await page.locator('.bag-grid .inventory-cell.selected.equipment-inactive').evaluate(el=>getComputedStyle(el).borderTopColor);assert.equal(border,'rgb(200, 59, 53)','selected inactive item keeps the red border');
  assert.match(await page.locator('.gear-shelf .gear-requires').innerText(),/รีเควสรวมสองมือ.*STR มี.*ต้องใช้.*ขาด/s);
  assert.match(await page.locator('.gear-shelf .shelf-actions').innerText(),/สถานะไม่ได้ใช้/);
  assert.equal(await page.evaluate(()=>__frontier.game.derived.weaponType),'none');
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/${name}-inactive.png`});
  const shelf=await page.locator('.gear-shelf').boundingBox(),actions=await page.locator('.gear-shelf .shelf-actions').boundingBox();assert.ok(actions.y+actions.height<=shelf.y+shelf.height+2,'shelf actions fit');
  await tap('.gear-shelf [data-action="details"]');assert.match(await page.locator('.atelier-dialog .gear-requires').first().innerText(),/ขาด/);await page.screenshot({path:`${out}/${name}-details.png`});
  await tap('.detail-close');
  await page.evaluate(()=>{const f=__frontier;f.panels.close();f.game.ch.stats.STR=100;f.game.refresh();f.panels.open('bag');});
  assert.equal(await page.locator('.wear-slot.equipment-inactive').count(),0);assert.equal(await page.evaluate(()=>__frontier.game.ch.equipped.weapon),ids.a);assert.equal(await page.evaluate(()=>__frontier.game.ch.equipped.offhand),ids.b);assert.equal(await page.evaluate(()=>__frontier.game.derived.dualWield),true);
  await page.evaluate(async()=>{
   const {migrateCharacter}=await import('/src/core/character.js');const f=__frontier,ch=f.game.ch;
   f.panels.close();ch.level=f.game.data.progression.character.maxLevel+1;ch.statPoints=0;
   migrateCharacter(ch,f.game.data);f.game.refresh();f.panels.open('bag');
  });
  assert.match(await page.locator('.atelier-notice').innerText(),/คืนแต้มสเตตัสให้จัดใหม่ฟรี/);
  assert.match(await page.locator('.atelier-notice').innerText(),/สถานะไม่ได้ใช้/);
  await page.screenshot({path:`${out}/${name}-cap-reset.png`});
  assert.deepEqual(errors,[]);report.push({name,width,height,retainedAndRecovered:true,pageErrors:errors});await context.close();console.log('PASS equipment inactive',name);
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
}finally{await browser.close();server.kill();}
