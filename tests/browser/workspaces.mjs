// Browse and mutate through real controls. Fixtures supply resources, never click results.
import assert from 'node:assert/strict';
import {verifyPassiveGestures,journalJump} from './passive-checks.mjs';
import {verifyEncounterCraft} from './encounter-craft-review.mjs';
import {freezeScene} from './freeze-scene.mjs';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const name=process.env.BROWSER||'chromium',port=4185,out=new URL(`./out/workspaces-${name}/`,import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const server=spawn('npx',['vite','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;const reports=[];
let offlineCode='',offlineCss='';
if(process.env.OFFLINE_UI){
 const {build}=await import('vite');
 const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'SeekerReview',formats:['iife']}}});
 offlineCode=built[0].output.find(o=>o.type==='chunk').code;
 offlineCss=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','loadout-workspace','skill-journal/journal'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
 for(const weight of [400,600]){const f=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64');offlineCss+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${f});font-weight:${weight}}`;}
 for(const subset of ['thai','latin']){
  const font=readFileSync(new URL('../../node_modules/@fontsource/mitr/files/mitr-'+subset+'-400-normal.woff2',import.meta.url)).toString('base64');
  offlineCss += `@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;}`;
 }
}

try{
 for(let i=0;;i++){try{if((await fetch(`http://localhost:${port}/`)).ok)break;}catch{}if(i>80)throw Error('preview timeout');await new Promise(r=>setTimeout(r,300));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const sizes=process.env.QUICK?[['ipad',1180,820,true]]:[['desktop',1440,960,false],['ipad',1180,820,true],['phone-landscape',844,390,true],['phone-portrait',390,844,true]];
 // Keep the new review fixture in disposable contexts. Never replace the character
 // object held by the existing loadout controllers in the legacy workspace checks.
 for(const [size,width,height,touch]of sizes){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   if(process.env.OFFLINE_UI){await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:offlineCss});await page.addScriptTag({content:offlineCode});await page.evaluate(()=>document.fonts.ready);}
   else await page.goto(`http://localhost:${port}/?fresh=1&quality=low&seed=7`);
   await page.waitForFunction(()=>window.__frontier?.game?.time>.2,null,{timeout:60000});await freezeScene(page);
   await verifyEncounterCraft(page,{size,width,height,touch,out});
   assert.deepEqual(errors,[],size+' encounter page errors');console.log('PASS encounter '+name+' '+size);
  }finally{await ctx.close();}
 }
 for(const [size,width,height,touch]of sizes){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  if(process.env.OFFLINE_UI){await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:offlineCss});await page.addScriptTag({content:offlineCode});await page.evaluate(()=>document.fonts.ready);}else await page.goto(`http://localhost:${port}/?fresh=1&quality=low&seed=7`);await page.waitForFunction(()=>window.__frontier?.game?.time>.2,null,{timeout:60000});await freezeScene(page);
  await page.evaluate(()=>{const f=window.__frontier,g=f.game;f.paused=true;for(const s in g.ch.stats)g.ch.stats[s]=20;for(const id in g.data.skills.combat)g.ch.skills[id]=1;g.ch.jobPoints=30;g.ch.jobLevel=8;g.ch.gold=10000;for(const id in g.data.items.materials)g.ch.materials[id]=500;g.ch.mods=Object.keys(g.data.mods.mods).map((id,i)=>({id,level:1,uid:900+i}));g.ch.slots[0]={skill:'stone_burst',mods:[]};g.refresh();f.panels.open('job');});
  const click=async sel=>{const q=page.locator(sel).first();return touch?q.tap():q.click();};
  const nav=async tab=>{if(await page.locator('#atelier').isVisible()){await page.evaluate(tab=>__frontier.panels.open(tab),tab);return;}if(await page.locator('.is-journal').count()){await click('[data-action="exit"]');await page.evaluate(t=>window.__frontier.panels.open(t),tab);return;}if(!await page.locator(`[data-tab="${tab}"]`).count()){await page.evaluate(t=>window.__frontier.panels.open(t),tab);return;}if(width<=700)await page.locator('[data-page-select]').selectOption(tab);else await click(`[data-tab="${tab}"]`);};
  const shot=async label=>{await page.screenshot({path:out+size+'-'+label+'.png',timeout:60000});};
  const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),size+' horizontal overflow');
  assert.equal(await page.locator('#plane > [data-node]').count(),6);assert.equal(await page.locator('.seeker-constellation').count(),0);await noOverflow();await shot('shared-start');
  const before=await page.evaluate(()=>window.__frontier.game.ch.jobPoints);
  await journalJump(page,'lesson.prepare');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before,'inspection never spends');
  await click('[data-action="learn"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before-1);
  await journalJump(page,'lesson.strike');assert.ok(await page.locator('[data-action="learn"][data-id="lesson.strike"]').count());
  await click('[data-action="learn"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before-2);
  await click('[data-action="close-detail"]');await click('[data-action="fit"]');await noOverflow();await shot('ordinary-path');
  const pts=await page.evaluate(()=>window.__frontier.game.ch.jobPoints),rect=await page.locator('#map').boundingBox();
  if(touch){await page.locator('#map').evaluate(el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:15,pointerType:'touch',clientX:r.x+100,clientY:r.y+100}));el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:15}));});}
  else{await page.mouse.move(rect.x+100,rect.y+150);await page.mouse.down();await page.mouse.move(rect.x+180,rect.y+190,{steps:5});await page.mouse.up();}
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),pts);
  if(height>width){await nav('skills');assert.equal(await page.locator('#atelier .rotate-message').isVisible(),true);await page.keyboard.press('Escape');assert.deepEqual(errors,[]);await ctx.close();reports.push({size,width,height,touch,landscapeRequired:true});continue;}
  await nav('skills');assert.equal(await page.locator('#atelier .skill-card').count(),4);await noOverflow();await shot('skills');
  await click('[data-action="skill"][data-id="venom_mire"]');await click('#atelier [data-action="apply"]');await click('.atelier-dialog [data-action="confirm"]');
  await click('.category-tabs [data-action="category"][data-id="mod"]');
  const uid=await page.evaluate(()=>__frontier.game.ch.mods.find(m=>m.id==='split').uid);
  await click(`[data-action="mod"][data-id="${uid}"]`);await click('#atelier [data-action="apply"]');assert.match(await page.locator('.atelier-notice').innerText(),/ขาดประเภท.*กระสุน/);await shot('incompatible');
  const lingering=await page.evaluate(()=>__frontier.game.ch.mods.find(m=>m.id==='lingering').uid);
  await click(`[data-action="mod"][data-id="${lingering}"]`);await click('#atelier [data-action="apply"]');assert.ok(await page.evaluate(uid=>__frontier.game.ch.slots[0].mods.includes(uid),lingering));
  assert.ok(await page.evaluate(()=>__frontier.game.skills[0].duration>__frontier.game.data.skills.combat.venom_mire.duration));await noOverflow();await shot('mods');
  await nav('movement');assert.equal(await page.locator('#atelier .skill-grid .inventory-cell').count(),4);await click('[data-action="skill"][data-id="roll"]');await click('#atelier [data-action="apply"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.movement),'roll');await noOverflow();await shot('movement');
  await nav('growth');assert.ok(await page.locator('[data-act="skill-up"]').count());await noOverflow();await shot('upgrades');
  // Open/close and panel navigation preserve combat selections; no unexpected mutations.
  await click('.panel-close');assert.equal(await page.evaluate(()=>window.__frontier.panels.isOpen),false);
  await verifyPassiveGestures(page,{context:ctx,engineName:name,capture:label=>shot('passive-'+label)});
  assert.deepEqual(errors,[],size+' page errors');reports.push({size,width,height,touch,ok:true});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS '+name+' '+size);await ctx.close();
 }
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
