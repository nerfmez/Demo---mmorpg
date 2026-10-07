// Approved PR106 identity presentation only. Build first; fixtures stay in this browser.
// CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/browser/monster-identity.mjs
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freezeScene} from './freeze-scene.mjs';

const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=new URL(`./out/monster-identity/${engine.name()}/`,import.meta.url).pathname;
const approval=JSON.parse(readFileSync(new URL('../../docs/review/monster-identity-integration/integration.json',import.meta.url)));
const monsters=['salt_slime','tusk_boar','thornback_wolf','greyfang','reed_viper','marsh_wisp'];
const materials=['salt_gel','glow_dust','boar_hide','boar_tusk','wolf_pelt','wolf_fang','greyfang_mane','venom_gland','viper_scale','wisp_core'];
const expectedMonsters=Object.fromEntries(monsters.map(id=>[id,id==='greyfang'?'เกรย์แฟง จ่าฝูง':approval.applied_label_fields.find(f=>f.pointer===`/monsters/${id}/nameTh`).proposed]));
mkdirSync(out,{recursive:true});
const port=4237,base=`http://localhost:${port}/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
const errors=[],badResponses=[],report={engine:engine.name(),basis:approval.source_main_sha,views:[],assetHashes:[],errors,badResponses,ok:false};
let browser;
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>80)throw Error('preview server');await new Promise(r=>setTimeout(r,250));}
 for(const asset of approval.assets){
  const response=await fetch(base+asset.path.replace(/^public\//,''));assert.equal(response.status,200);
  const sha256=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(sha256,asset.sha256,asset.id+' served approved bytes');report.assetHashes.push({id:asset.id,sha256});
 }
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 for(const [size,width,height] of [['desktop',1440,960],['ipad',1180,820]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/assets/icons/')&&r.status()!==200)badResponses.push({url:r.url(),status:r.status()});});
  await page.goto(base+'?fresh=1&seed=9&quality=low&stream=0');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&document.getElementById('loading').classList.contains('done'));
  await page.evaluate(ids=>{
   const f=__frontier,g=f.game;f.paused=true;document.querySelector('.banner')?.remove();
   g.monsters=[];g.ch.gold=100000;g.ch.materials=Object.fromEntries(ids.map(id=>[id,30]));
   for(const [id,map]of Object.entries(g.data.maps)){
    const progress=id===g.data.world.id?g.ch.progress:(g.ch.progress.maps[id]??={});
    progress.zones=map.zones.map(z=>z.id);progress.waypoints=map.waypoints.map(w=>w.id);
   }
   Object.assign(g.player,g.freeSpotNear(...g.data.world.town.shop));g.refresh();f.view.snapCamera();
  },materials);
  await freezeScene(page);
  const view={size,width,height,regions:[],materialSources:[],craft:[],quests:[],artifacts:[]};report.views.push(view);
  const capture=async label=>{
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getClientRects().length).map(i=>i.decode()));});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),label+' page overflow');
   const file=`${size}-${label}.png`;await page.screenshot({path:out+file});view.artifacts.push(file);
  };
  await page.evaluate(()=>__frontier.panels.open('map'));
  const regions=await page.locator('.region-card').evaluateAll(es=>es.map(e=>e.dataset.id));
  assert.equal(regions.length,17);const seen=new Set();
  for(const region of regions){
   await page.locator(`.region-card[data-id="${region}"]`).tap();
   const entries=await page.locator('.creature-entry').evaluateAll(async es=>{
    return Promise.all(es.map(async e=>{const image=e.querySelector(':scope>.art>img');await image.decode();return {id:e.dataset.encounterEntry,name:e.querySelector(':scope>div>b').textContent,src:image.getAttribute('src'),native:image.naturalWidth,size:image.getBoundingClientRect().width,drops:[...e.querySelectorAll('.drop-pictures>span')].map(d=>({id:d.querySelector('.art').dataset.art.split('/')[1],name:d.querySelector('small').textContent}))};}));
   });
   for(const entry of entries){
    assert.equal(entry.native,256);assert.equal(entry.size,50);
    if(monsters.includes(entry.id)){assert.equal(entry.name,expectedMonsters[entry.id]);assert.ok(entry.src.endsWith(`/monster/${entry.id}.png`));seen.add(entry.id);}
    const names=await page.evaluate(()=>Object.fromEntries(Object.entries(__frontier.game.data.items.materials).map(([id,d])=>[id,d.nameTh])));
    for(const drop of entry.drops)assert.equal(drop.name,names[drop.id]);
   }
   view.regions.push({region,entries});
  }
  assert.deepEqual([...seen].sort(),[...monsters].sort());
  console.log(size+': 17 region controls and six approved portraits checked');
  const pin=page.locator('.bossmark [data-art="monster/greyfang"]>img');assert.equal(await pin.count(),1);
  await pin.evaluate(i=>i.decode());assert.equal(await pin.locator('..').locator('..').getAttribute('title'),expectedMonsters.greyfang);
  view.bossPin=await pin.evaluate(i=>({src:i.getAttribute('src'),size:i.getBoundingClientRect().width}));
  await pin.scrollIntoViewIfNeeded();await capture('atlas-boss');
  for(const [region,label,subject]of [['frontier-wilds-v1:meadow','atlas-meadow','tusk_boar'],['frontier-wilds-v1:wolf_den','atlas-wolves','thornback_wolf'],['frontier-wilds-v1:wetland','atlas-wetland','marsh_wisp']]){
   await page.locator(`.region-card[data-id="${region}"]`).tap();await page.locator(`.creature-entry[data-encounter-entry="${subject}"]`).evaluate(e=>e.scrollIntoView({block:'start'}));await capture(label);
  }
  await page.evaluate(()=>__frontier.panels.open('bag'));
  await page.locator('#atelier [data-action="bag-category"][data-id="material"]').tap();
  await capture('bag');
  const sourceSeen=new Set();
  for(const id of materials){
   await page.locator(`#atelier [data-action="material"][data-id="${id}"]`).tap();
   const expected=await page.evaluate(id=>__frontier.game.data.items.materials[id].nameTh,id);
   assert.equal(await page.locator('#atelier .selected-summary h2').textContent(),expected);
   await page.locator('#atelier [data-action="details"]').tap();
   assert.equal(await page.locator('.atelier-dialog h3').first().textContent(),expected);
   const sources=await page.locator('.source-creature').evaluateAll(async es=>Promise.all(es.map(async e=>{const art=e.querySelector('.art'),id=art.dataset.art.split('/')[1],image=art.querySelector('img');if(image)await image.decode();return {id,name:e.querySelector(':scope>span:last-child').textContent,src:image?.getAttribute('src'),size:art.getBoundingClientRect().width};})));
   for(const source of sources)if(monsters.includes(source.id)){assert.equal(source.name,expectedMonsters[source.id]);assert.ok(source.src?.endsWith(`/monster/${source.id}.png`));assert.equal(source.size,30);sourceSeen.add(source.id);}
   view.materialSources.push({id,name:expected,sources});
   if(id==='wisp_core')await capture('material-source');
   await page.locator('.atelier-dialog [data-action="cancel"]').tap();
  }
  assert.deepEqual([...sourceSeen].sort(),[...monsters].sort());
  console.log(size+': ten material details and six source portraits checked');
  for(const id of ['boar_hide','boar_tusk','wolf_pelt','viper_scale','wisp_core']){
   const recipe=await page.evaluate(id=>{const p=__frontier.panels,r=Object.entries(p.game.data.recipes.recipes).find(([,r])=>r.cost[id]);assertRecipe(r,id);p.sel.craftRecipe=r[0];p.open('craft');return r[0];function assertRecipe(r,id){if(!r)throw Error('no recipe for '+id);}},id);
   const ingredient=page.locator(`.ingredient [data-art="material/${id}"]`).locator('..');
   const details=await ingredient.evaluateAll(async es=>Promise.all(es.map(async e=>{const i=e.querySelector('img');await i.decode();return {text:e.textContent,size:i.getBoundingClientRect().width};})));
   assert.ok(details.length>0);
   const expected=await page.evaluate(id=>__frontier.game.data.items.materials[id].nameTh,id);assert.ok(details.every(d=>d.text.startsWith(expected)));
   view.craft.push({id,recipe,ingredients:details});
  }
  await page.locator('.ingredient [data-art="material/wisp_core"]').first().scrollIntoViewIfNeeded();await capture('craft');
  await page.evaluate(()=>{const p=__frontier.panels;p.sel.questMode='story';p.sel.questChapter='first-footsteps';p.open('journal');});
  assert.ok((await page.locator('[data-quest-id="h_slimes"]').textContent()).includes(expectedMonsters.salt_slime));
  await page.locator('[data-quest-id="h_slimes"] .qj-picture img').evaluate(i=>i.decode());await capture('quest-slime');view.quests.push('h_slimes');
  await page.evaluate(()=>{const p=__frontier.panels;for(const id of ['m_boars','s_wolves'])p.game.ch.progress.quests[id]={status:'active',count:0};p.sel.questMode='optional';p.render();});
  for(const [id,monster]of [['m_boars','tusk_boar'],['s_wolves','thornback_wolf']]){
   const card=page.locator(`[data-quest-id="${id}"]`);assert.ok((await card.textContent()).includes(expectedMonsters[monster]));await card.locator('.qj-picture img').evaluate(i=>i.decode());view.quests.push(id);
  }
  await page.locator('[data-quest-id="s_wolves"]').scrollIntoViewIfNeeded();await capture('quest-optional');
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);report.ok=true;
 console.log('PASS approved identities: desktop/iPad map, boss pin, bag/source details, craft costs, quest labels; exact served hashes; no page/image errors.');
}finally{
 report.limitations=[approval.dependency_merge_sha
  ? 'UI contexts use merged PR106; model animation/performance is outside this identity patch.'
  : 'PR106 model dependency pending; reviewed base models were not replaced by this patch.',
  'Viewport emulation and SwiftShader; no physical iPad or Safari/performance claim.'];
 writeFileSync(out+'report.json',JSON.stringify(report,null,2)+'\n');await browser?.close();process.kill(-server.pid);
}
