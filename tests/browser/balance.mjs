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
  assert.ok(await page.locator('[data-act="skill-up"][data-skill="slash"]').isDisabled(),'next rank needs character Lv12');
  assert.doesNotMatch(await page.locator('.pbody').innerText(),/\d+\.\d{5,}/,'growth previews format fractional stats readably');
  await overflow();await shot('growth');
  // Equipment can reach +5/S at Lv1; only wearing is gated by trained stats.
  await page.evaluate(()=>{const {game:g,panels:p}=window.__frontier;g.ch.level=1;g.ch.stats.STR=3;g.ch.statPoints=100;g.refresh();p.open('bag');});
  await click('[data-act="inspect-item"][data-id="1"]');
  for(let n=0;n<5;n++)await click('[data-act="gear-up"][data-uid="1"]');
  for(let n=0;n<3;n++)await click('[data-act="gear-grade"][data-uid="1"]');
  const promoted=await page.evaluate(()=>window.__frontier.game.ch.gear[0]);assert.equal(promoted.grade,'S');assert.equal(promoted.upgrade,5);assert.equal(promoted.options.length,5);
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.equipped.weapon),null);
  assert.ok(await page.locator('.item-detail [data-act="equip-gear"][data-uid="1"]').isDisabled());
  const required=Number(await page.locator('.item-description .gear-requires [data-required-stat="STR"]').first().getAttribute('data-need'));
  assert.ok(required>3);await overflow();await shot('gear-requirements');
  await open('char');for(let n=3;n<required;n++)await click('[data-act="stat"][data-stat="STR"]');
  await open('bag');await click('[data-act="inspect-item"][data-id="1"]');await click('.item-detail [data-act="equip-gear"][data-uid="1"]');
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.equipped.weapon),1);await overflow();await shot('gear');
  await open('craft');const beforePick=await page.evaluate(()=>JSON.stringify(window.__frontier.game.ch));
  await click('[data-act="craft-open"][data-id="tusk_blade"]');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.__frontier.game.ch)),beforePick,'opening the specific workshop never crafts or spends');
  assert.equal(await page.locator('.craft-workspace').getAttribute('data-recipe'),'tusk_blade');assert.equal(await page.locator('[data-act="craft"]').count(),1);
  const initial=await page.evaluate(()=>window.__frontier.game.ch.gear.length);
  await click('[data-act="craft"][data-id="tusk_blade"]');await click('[data-act="craft"][data-id="tusk_blade"]');
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.gear.length),initial+2);assert.equal(await page.locator('.craft-result').count(),2);assert.equal(await page.locator('.craft-workspace').getAttribute('data-recipe'),'tusk_blade');
  await page.locator('.craft-repeat>summary').click();await page.locator('[data-field="grade"]').selectOption('');await page.locator('[data-field="attempts"]').selectOption('5');await overflow();await shot('craft');
  const before=await page.evaluate(()=>({gear:window.__frontier.game.ch.gear.length,gold:window.__frontier.game.ch.gold,crafted:window.__frontier.game.ch.progress.crafted}));
  await click('[data-act="craft-batch"][data-id="tusk_blade"]');
  const after=await page.evaluate(()=>({gear:window.__frontier.game.ch.gear.length,gold:window.__frontier.game.ch.gold,crafted:window.__frontier.game.ch.progress.crafted}));
  assert.equal(after.gear,before.gear+5);assert.equal(after.crafted,before.crafted+5);assert.equal(before.gold-after.gold,data.recipes.recipes.tusk_blade.cost.gold*5);assert.equal(await page.locator('.craft-result').count(),7);await overflow();await shot('results');
  await click('[data-act="inspect-crafted"]');assert.ok(await page.locator('.gear-compare').count());await shot('compare');
  await click('[data-act="return-craft"]');assert.equal(await page.locator('.craft-workspace').getAttribute('data-recipe'),'tusk_blade');assert.equal(await page.locator('.craft-result').count(),7);
  await click('[data-act="craft-back"]');await click('[data-act="craft-open"][data-id="hunter_bow"]');assert.equal(await page.locator('.craft-result').count(),0,'another recipe has its own history');
  await click('[data-act="craft-back"]');await click('[data-act="craft-open"][data-id="tusk_blade"]');assert.equal(await page.locator('.craft-result').count(),7,'recipe and goals persist through comparison and switching');
  await open('job');await jump('v2');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.seeker-node-detail').innerText(),/ต่อจากโหนด/);
  await jump('v1');await click('[data-act="take-node"]');await jump('v2');await click('[data-act="take-node"]');await jump('v5');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.journal-tier-status').innerText(),/2\/3/);
  await jump('m_atk');await click('[data-act="take-node"]');await jump('v5');await click('[data-act="take-node"]');await jump('vj');await click('[data-act="take-node"]');
  assert.ok(await page.evaluate(()=>window.__frontier.game.ch.jobNodes.includes('vj')));await jump('v9');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());assert.match(await page.locator('.journal-tier-status').innerText(),/5\/17/);
  assert.equal(await page.locator('.journal-section').count(),6);await click('[data-act="dismiss-node"]');await click('[data-fit]');await shot('tree');
  // Type filters and mod rules are visible chips sourced from actual compiler tags.
  await open('skills');await page.locator('[data-workspace-select="skillFilter"]').selectOption('Attack');
  assert.equal(await page.locator('.seeker-library-item').count(),3);assert.equal(await page.locator('.seeker-library-item [data-skill-tag="Attack"]').first().textContent(),'กายภาพ');
  await page.locator('[data-workspace-select="skillFilter"]').selectOption('Spell');
  const stone=page.locator('.seeker-library-item').filter({has:page.locator('[data-act="choose-skill"][data-id="stone_burst"]')});
  assert.equal(await stone.locator('[data-skill-tag="Spell"]').count(),1);assert.equal(await stone.locator('[data-damage-element="physical"]').count(),1);assert.equal(await stone.locator('[data-skill-tag="Attack"]').count(),0);
  await page.locator('[data-workspace-select="skillFilter"]').selectOption('Projectile');assert.equal(await page.locator('.seeker-library-item').count(),2);
  await click('[data-act="skill-slot"][data-slot="2"]');await overflow();await shot('tags-skills');
  await page.evaluate(()=>{const g=window.__frontier.game;g.ch.mods=[{id:'split',uid:5001,level:1},{id:'echo',uid:5002,level:1}];g.ch.slots[2]={skill:'firebolt',mods:[]};g.refresh();});
  await open('mods');await click('.seeker-mod-tile[data-uid="5001"]');
  assert.equal(await page.locator('.seeker-focus [data-mod-rule="all"] [data-skill-tag="Projectile"]').count(),1);assert.ok(await page.locator('.seeker-focus [data-tag-scope="mod"]').isVisible());
  assert.ok(!(await page.locator('[data-act="socket"][data-uid="5001"]').isDisabled()));await overflow();await shot('tags-mods');
  await click('.seeker-mod-tile[data-uid="5002"]');assert.ok(await page.locator('[data-act="socket"][data-uid="5002"]').isDisabled());
  assert.equal(await page.locator('.seeker-focus [data-mod-rule="all"] [data-skill-tag="Area"]').count(),1);assert.equal(await page.locator('.seeker-focus [data-mod-rule="exclude"] .seeker-tag').count(),2);await overflow();await shot('tags-incompatible');
  await open('craft');await click('[data-act="craft-back"]');await click('[data-act="craft-filter"][data-id="mod"]');
  assert.equal(await page.locator('.recipe-card').filter({has:page.locator('[data-id="mod_split"]')}).locator('[data-mod-rule="all"] [data-skill-tag="Projectile"]').count(),1);await overflow();await shot('tags-craft');
  // Element filters, conversion metadata, new recipe goals and connected elemental nodes.
  await open('skills');await page.locator('[data-workspace-select="skillFilter"]').selectOption('Fire');
  assert.equal(await page.locator('.seeker-library-item').count(),1);assert.equal(await page.locator('.seeker-library-item [data-element-tag="Fire"]').count(),1);
  await page.locator('[data-workspace-select="skillFilter"]').selectOption('Earth');
  assert.equal(await page.locator('.seeker-library-item [data-element-tag="Earth"]').count(),1);assert.equal(await page.locator('.seeker-library-item [data-element-tag="Physical"]').count(),1);
  await page.evaluate(()=>{const g=window.__frontier.game;g.ch.mods=[{id:'frost_shift',uid:5011,level:1},{id:'burning_ground',uid:5012,level:1}];g.ch.slots[2]={skill:'firebolt',mods:[5011,5012]};g.refresh();window.__frontier.panels.render();});
  assert.equal(await page.locator('.seeker-skill-meta [data-tag-scope="element"] [data-element-tag="Cold"]').count(),1);
  assert.equal(await page.locator('.seeker-skill-meta [data-tag-scope="element"] [data-element-tag="Fire"]').count(),0);
  assert.equal(await page.locator('.seeker-skill-meta [data-tag-scope="secondary"] [data-element-tag="Fire"]').count(),1);await overflow();await shot('element-conversion');
  await open('craft');await click('[data-act="craft-filter"][data-id="weapon"]');await click('[data-act="craft-open"][data-id="wisp_staff"]');
  await page.locator('.recipe-affixes>summary').click();assert.equal(await page.locator('.recipe-affixes [data-element-tag="Fire"]').count(),1);
  await page.locator('.craft-repeat>summary').click();await page.locator('[data-field="option"]').selectOption('fire_pct');await overflow();await shot('element-craft');
  await open('job');await jump('element_fire_2');assert.ok(await page.locator('[data-act="take-node"]').isDisabled());
  await jump('element_fire_1');assert.equal(await page.locator('.seeker-node-detail [data-element-tag="Fire"]').count(),1);await click('[data-act="take-node"]');
  await jump('element_fire_2');await click('[data-act="take-node"]');
  assert.equal(await page.evaluate(()=>window.__frontier.game.derived.fireDamagePct),8);await overflow();await shot('element-tree');
  assert.deepEqual(errors,[],size+' browser errors');reports.push({size,touch,rankGates:true,gradeAffixes:true,wearStatRequirements:true,dedicatedWorkshop:true,boundedCraft:true,connectedTree:true,visibleTypeTags:true,elementRules:true,ok:true});await ctx.close();
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
