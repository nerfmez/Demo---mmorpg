// Real Game/Panels workshop visual capture and lifecycle checks, without the 3D renderer.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { build } from 'vite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const tag=process.env.CAPTURE_TAG||'after', captureOnly=process.env.CAPTURE_ONLY==='1';
const out=process.env.EVIDENCE_DIR||new URL(`./out/workshop-motion-${engine.name()}-${tag}/`,import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const bundle=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'WorkshopMotion',formats:['iife']}}});
const code=bundle[0].output.find(f=>f.type==='chunk').code;
const css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud'].map(n=>readFileSync(new URL(`../../src/ui/${n}.css`,import.meta.url),'utf8')).join('\n')+'\n'+bundle[0].output.filter(f=>f.type==='asset'&&f.fileName.endsWith('.css')).map(f=>f.source).join('\n');
const browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox']:[]});
const reports=[];
try {
 for(const [label,width,height,touch,reduced] of [['ipad',1180,820,true,false],['phone-landscape',844,390,true,false],['ipad-reduced',1180,820,true,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:reduced?'reduce':'no-preference',recordVideo:{dir:out,size:{width,height}}});
  const videoEpoch=Date.now(),page=await context.newPage(),errors=[],missing=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
  await page.route('http://workshop.local/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>'});const f=new URL('../../public/'+u.pathname.slice(1),import.meta.url);return existsSync(f)?route.fulfill({path:f.pathname}):route.fulfill({status:404,body:''});});
  await page.goto('http://workshop.local/');await page.addStyleTag({content:css});await page.addScriptTag({content:code});
  await page.evaluate(()=>{const {game:g,panels:p}=__frontier;g.ch.gold=100000;g.ch.level=30;for(const k in g.ch.stats)g.ch.stats[k]=100;for(const k in g.data.items.materials)g.ch.materials[k]=500;[g.player.x,g.player.z]=g.data.world.town.workbench;g.refresh();p.sel.forgeUid=g.ch.gear[0].uid;p.open('forge');});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  const stage=page.locator('[data-workshop-stage]');await stage.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${label}-${tag}-before.png`});
  const snapshot=()=>page.evaluate(()=>JSON.stringify(__frontier.game.ch));
  const trigger=()=>page.evaluate(()=>{const p=__frontier.panels;p.onClick({target:document.querySelector('[data-act="gear-up"]')});});
  const strikeStart=(Date.now()-videoEpoch)/1000;await trigger();const paid=await snapshot();
  if(!captureOnly){await trigger();assert.equal(await snapshot(),paid,'repeated tap must not deduct twice');}
  await page.waitForFunction(()=>!__frontier.panels.workshop.busy);
  await stage.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
  await page.screenshot({path:`${out}/${label}-${tag}-result.png`});
  // Freeze the exact production CSS animation at authored transition times for diagnostic stills.
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
  await trigger();const duration=await page.locator('.ws-hammer').evaluate(h=>parseFloat(getComputedStyle(h).animationDuration)*1000);
  await page.evaluate(()=>document.querySelector('[data-workshop-stage]').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=0;}));
  const frames=reduced?[0,70,100,140,200]:[0,150,320,400,442,470,530,700];
  const samples=[];
  for(const ms of frames){const sample=await page.evaluate(t=>{const stage=document.querySelector('[data-workshop-stage]');stage.getAnimations({subtree:true}).forEach(a=>{a.currentTime=t;});const h=stage.querySelector('.ws-hammer');return {ms:t,transform:getComputedStyle(h).transform,flash:getComputedStyle(stage.querySelector('.ws-spark')).opacity,sparks:stage.querySelectorAll('.ws-metal-spark').length};},ms);samples.push(sample);await page.screenshot({path:`${out}/${label}-${tag}-${ms}ms.png`,clip:await stage.boundingBox()});}
  // Frozen animations are presentation only; finish/cancel retains the committed transaction.
  await page.evaluate(()=>__frontier.panels.workshop.finish());
  await page.clock.resume();
  if(!captureOnly){
   await trigger();const committed=await snapshot();await page.evaluate(()=>{const p=__frontier.panels;p.close();p.open('forge');});
   assert.equal(await snapshot(),committed,'close/reopen preserves committed result');await page.waitForTimeout(950);assert.equal(await snapshot(),committed,'cancelled completion cannot mutate');
   await trigger();const backPaid=await snapshot();await page.evaluate(()=>{const p=__frontier.panels;p.open('menu');p.open('forge');});assert.equal(await snapshot(),backPaid,'back/reopen preserves result');
   await page.evaluate(()=>{const p=__frontier.panels;p.sel.craftRecipe='tusk_blade';p.open('craft');p.workshop.run('craft',{id:'tusk_blade'});});
   const crafted=await snapshot(),receipt=await page.evaluate(()=>JSON.stringify(__frontier.panels.workshop.receipt));
   await page.evaluate(()=>{const p=__frontier.panels;p.workshop.run('craft',{id:'tusk_blade'});p.close();p.open('craft');});
   assert.equal(await snapshot(),crafted,'craft repeated/cancel cannot reroll');assert.equal(await page.evaluate(()=>JSON.stringify(__frontier.panels.workshop.receipt)),receipt);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'horizontal overflow');assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  reports.push({label,width,height,touch,reduced,context:'real Game and Panels; no 3D renderer',strikeStart,duration,samples,errors,missing,checks:captureOnly?['baseline capture']:['repeat guard','close/reopen','back/reopen','craft no reroll','receipt preserved','no horizontal overflow','no page errors/missing assets']});
  await context.close();await page.video().saveAs(`${out}/${label}-${tag}.webm`);
 }
 writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
} finally {await browser.close();}
