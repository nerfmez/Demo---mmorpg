// Real Game/Panels, deterministic resources and real mouse/touch controls. No renderer needed.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {build} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {ART,art} from '../../src/ui/art.js';
import {loadData} from '../../src/core/data-node.js';
const data=loadData(),name=process.env.BROWSER||'chromium',engine=name==='webkit'?webkit:chromium;
const out=new URL(`./out/balance-${name}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
const compiled=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'BalanceReview',formats:['iife']}}});
const code=compiled[0].output.find(x=>x.type==='chunk').code;
let css=['style','ux','art','workspaces','minimal','journal','overlays'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const subset of ['thai','latin'])for(const weight of [400,500]){const f=readFileSync(new URL(`../../node_modules/@fontsource/mitr/files/mitr-${subset}-${weight}-normal.woff2`,import.meta.url)).toString('base64');css+=`@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${f});font-weight:${weight}}`;}
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox']:[]}),reports=[];
try{
 for(const [size,width,height,touch]of [['desktop',1440,960,false],['ipad',1180,820,true],['phone',390,844,true]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:code});await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const {game:g}=window.__frontier;g.ch.level=1;g.ch.jobLevel=40;g.ch.jobPoints=39;g.ch.gold=100000;for(const k in g.ch.stats)g.ch.stats[k]=20;for(const id in g.data.items.materials)g.ch.materials[id]=500;const p=g.data.world.town.workbench;g.player.x=p[0];g.player.z=p[1];g.refresh();window.__frontier.panels.open('growth');});
  const click=async selector=>{const l=page.locator(selector).first();return touch?l.tap():l.click();};
  const shot=async label=>page.screenshot({path:out+size+'-'+label+'.png',timeout:60000});
  const open=async tab=>page.evaluate(tab=>window.__frontier.panels.open(tab),tab);
  const jump=async id=>{await page.locator('#node-search').fill(data.jobtree.nodes[id].nameTh);await click('.seeker-node-search button');await click(`.seeker-search-result[data-id="${id}"]`);};
  const overflow=async()=>assert.ok(await page.locator('.pbody').evaluate(el=>el.scrollWidth<=el.clientWidth+2),size+' content overflow');
  assert.ok(await page.locator('[data-act="skill-up"][data-skill="slash"]').isDisabled(),'rank cannot be rushed at Lv1 even with materials');
  await page.evaluate(()=>{window.__frontier.game.ch.level=5;window.__frontier.panels.render();});
  await click('[data-act="skill-up"][data-skill="slash"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.skills.slash),2);
  assert.ok(await page.locator('[data-act="skill-up"][data-skill="slash"]').isDisabled(),'next rank needs character Lv12');await overflow();await shot('growth');
  await page.evaluate(()=>{window.__frontier.game.ch.level=40;window.__frontier.panels.open('bag');});
  await click('[data-act="inspect-item"][data-id="1"]');await click('[data-act="gear-up"][data-uid="1"]');
  await click('[data-act="gear-grade"][data-uid="1"]');
  const promoted=await page.evaluate(()=>window.__frontier.game.ch.gear[0]);assert.equal(promoted.grade,'B');assert.equal(promoted.upgrade,1);assert.equal(promoted.options.length,1);await overflow();await shot('gear');
  await open('craft');const recipe=page.locator('.recipe-card').filter({has:page.locator('[data-act="craft"][data-id="tusk_blade"]')});await recipe.locator('.craft-repeat>summary').click();
  await recipe.locator('[data-field="grade"]').selectOption('');await recipe.locator('[data-field="attempts"]').selectOption('5');await overflow();await shot('craft');
  const before=await page.evaluate(()=>({gear:window.__frontier.game.ch.gear.length,gold:window.__frontier.game.ch.gold,crafted:window.__frontier.game.ch.progress.crafted}));
  await click('[data-act="craft-batch"][data-id="tusk_blade"]');
  const after=await page.evaluate(()=>({gear:window.__frontier.game.ch.gear.length,gold:window.__frontier.game.ch.gold,crafted:window.__frontier.game.ch.progress.crafted}));
  assert.equal(after.gear,before.gear+5);assert.equal(after.crafted,before.crafted+5);assert.equal(before.gold-after.gold,data.recipes.recipes.tusk_blade.cost.gold*5);assert.equal(await page.locator('.craft-result').count(),5);await overflow();await shot('results');
  await click('[data-act="inspect-crafted"]');assert.ok(await page.locator('.gear-compare').count());await shot('compare');
  await open('job');await jump('v2');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.seeker-node-detail').innerText(),/ต่อจากโหนด/);
  await jump('v1');await click('[data-act="take-node"]');await jump('v2');await click('[data-act="take-node"]');await jump('v5');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.journal-tier-status').innerText(),/2\/3/);
  await jump('m_atk');await click('[data-act="take-node"]');await jump('v5');await click('[data-act="take-node"]');await jump('vj');await click('[data-act="take-node"]');
  assert.ok(await page.evaluate(()=>window.__frontier.game.ch.jobNodes.includes('vj')));await jump('v9');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.journal-tier-status').innerText(),/5\/17/);
  assert.equal(await page.locator('.journal-section').count(),6);await click('[data-act="dismiss-node"]');await click('[data-fit]');await shot('tree');
  assert.deepEqual(errors,[],size+' browser errors');reports.push({size,touch,rankGates:true,gradeAffixes:true,boundedCraft:true,connectedTree:true,ok:true});await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:1180,height:900},deviceScaleFactor:1}),page=await ctx.newPage();
 for(const kind of ['skill','gear','material','mod']){
  const catalog=kind==='skill'?{...data.skills.combat,...data.skills.movement}:kind==='gear'?data.items.gearBases:kind==='material'?data.items.materials:data.mods.mods;
  const cells=Object.keys(ART[kind]).map(id=>`<figure>${art(kind,id)}<figcaption>${catalog[id].nameTh}</figcaption></figure>`).join('');
  await page.setContent(`<!doctype html><html lang="th"><body><h1>Frontier / ${kind}</h1><main>${cells}</main></body></html>`);
  await page.addStyleTag({content:css+'body{margin:0;background:#eef1e9;color:#38514c;font-family:Mitr}h1{padding:20px;font-size:22px}main{display:grid;grid-template-columns:repeat(8,1fr);gap:12px;padding:20px}figure{margin:0;text-align:center;display:grid;justify-items:center;gap:9px}figure .art{width:112px;height:112px}figcaption{font-size:11px}'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'art-'+kind+'.png',fullPage:true});
 }
 await ctx.close();writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS balance '+name+' '+reports.length+' viewports + all 91 icons');
}finally{await browser.close();}
