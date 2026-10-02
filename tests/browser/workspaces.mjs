// Browse and mutate through real controls. Fixtures supply resources, never click results.
import assert from 'node:assert/strict';
import {verifyPassiveGestures} from './passive-checks.mjs';
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
 offlineCss=['style','ux','art','workspaces','minimal','journal'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
 for(const subset of ['thai','latin']){
  const font=readFileSync(new URL('../../node_modules/@fontsource/mitr/files/mitr-'+subset+'-400-normal.woff2',import.meta.url)).toString('base64');
  offlineCss += `@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;}`;
 }
}

try{
 for(let i=0;;i++){try{if((await fetch(`http://localhost:${port}/`)).ok)break;}catch{}if(i>80)throw Error('preview timeout');await new Promise(r=>setTimeout(r,300));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const sizes=process.env.QUICK?[['ipad',1180,820,true]]:[['desktop',1440,960,false],['ipad',1180,820,true],['phone-landscape',844,390,true],['phone-portrait',390,844,true]];
 for(const [size,width,height,touch]of sizes){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  if(process.env.OFFLINE_UI){await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:offlineCss});await page.addScriptTag({content:offlineCode});await page.evaluate(()=>document.fonts.ready);}else await page.goto(`http://localhost:${port}/?fresh=1&quality=low&seed=7`);await page.waitForFunction(()=>window.__frontier?.game?.time>.2,null,{timeout:60000});await freezeScene(page);
  await page.evaluate(()=>{const f=window.__frontier,g=f.game;f.paused=true;for(const s in g.ch.stats)g.ch.stats[s]=20;for(const id in g.data.skills.combat)g.ch.skills[id]=1;g.ch.jobPoints=30;g.ch.jobLevel=8;g.ch.gold=10000;for(const id in g.data.items.materials)g.ch.materials[id]=500;g.ch.mods=Object.keys(g.data.mods.mods).map((id,i)=>({id,level:1,uid:900+i}));g.ch.slots[0]={skill:'stone_burst',mods:[]};g.refresh();f.panels.open('job');});
  const click=async sel=>{const q=page.locator(sel).first();return touch?q.tap():q.click();};
  const nav=async tab=>{if(await page.locator('.is-journal').count()){await page.keyboard.press('Escape');await page.evaluate(t=>window.__frontier.panels.open(t),tab);return;}if(width<=700)await page.locator('[data-page-select]').selectOption(tab);else await click(`[data-tab="${tab}"]`);};
  const shot=async label=>{await page.screenshot({path:out+size+'-'+label+'.png',timeout:60000});};
  const noOverflow=async()=>assert.ok(await page.locator('.pbody').evaluate(el=>el.scrollWidth<=el.clientWidth+2),size+' content horizontal overflow');
  assert.equal(await page.locator('.seeker-constellation').count(),11);assert.equal(await page.locator('.seeker-node').count(),0);await noOverflow();await shot('categories');
  await page.locator('#node-search').fill('ศึกษาเวท');await click('.seeker-node-search [type="submit"]');await click('.seeker-search-result[data-id="a1"]');await click('[data-act="dismiss-node"]');assert.equal(await page.locator('.seeker-node').count(),8);await shot('area');
  const before=await page.evaluate(()=>window.__frontier.game.ch.jobPoints);
  await click('[data-focus]');await click('.seeker-node[data-id="a1"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before,'inspection must not spend');
  await click('[data-act="take-node"][data-id="a1"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before-1);
  // Search across all categories; jumping follows the real graph and never buys a route.
  await page.locator('#node-search').fill('ขยายขอบเขต I');await click('.seeker-node-search [type="submit"]');assert.ok(await page.locator('.seeker-search-result').count()>=1);
  await click('.seeker-search-result[data-id="aoe_radius"]');assert.equal(await page.locator('.seeker-node-detail [data-act="take-node"]').getAttribute('data-id'),'aoe_radius');
  await click('[data-act="take-node"][data-id="aoe_radius"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),before-2);
  await click('[data-fit]');await noOverflow();await shot('area-learned');
  // Native pointer move/cancellation does not spend points, or inspect by accidental click.
  const pts=await page.evaluate(()=>window.__frontier.game.ch.jobPoints);const rect=await page.locator('.seeker-graph').boundingBox();
  if(touch){await page.locator('.seeker-graph').evaluate(el=>{const r=el.getBoundingClientRect(),emit=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:15,pointerType:'touch',clientX:x,clientY:y}));emit('pointerdown',r.x+100,r.y+100);emit('pointercancel',r.x+100,r.y+100);});}
  else{await page.mouse.move(rect.x+100,rect.y+150);await page.mouse.down();await page.mouse.move(rect.x+180,rect.y+190,{steps:5});await page.mouse.up();}
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),pts);
  await nav('skills');assert.equal(await page.locator('.seeker-movement-grid').count(),0);assert.equal(await page.locator('.seeker-mod-list').count(),0);assert.equal(await page.locator('.seeker-focus [data-skill-tag="Area"]').count(),1);await noOverflow();await shot('skills');
  await page.locator('[data-workspace-select="skillFilter"]').selectOption('DoT');assert.equal(await page.locator('.seeker-library-item').count(),1);await click('[data-act="choose-skill"][data-id="venom_mire"]');
  await click('[data-act="pick-socket"]');assert.equal(await page.locator('.pbody').getAttribute('data-panel'),'mods');assert.equal(await page.locator('.seeker-library-item').count(),0);
  const uid=await page.evaluate(()=>window.__frontier.game.ch.mods.find(m=>m.id==='split').uid);
  await click(`.seeker-mod-tile[data-uid="${uid}"]`);assert.match(await page.locator('.seeker-mod-status').innerText(),/ขาดประเภท.*โปรเจกไทล์/);assert.equal(await page.locator('.seeker-focus [data-mod-rule="all"] [data-skill-tag="Projectile"]').count(),1);assert.ok(await page.locator('[data-act="socket"]').isDisabled());await shot('incompatible');
  const lingering=await page.evaluate(()=>window.__frontier.game.ch.mods.find(m=>m.id==='lingering').uid);
  await click(`.seeker-mod-tile[data-uid="${lingering}"]`);await click(`[data-act="socket"][data-uid="${lingering}"]`);assert.ok(await page.evaluate(uid=>window.__frontier.game.ch.slots[0].mods.includes(uid),lingering));
  assert.ok(await page.evaluate(()=>window.__frontier.game.skills[0].duration>window.__frontier.game.data.skills.combat.venom_mire.duration));await noOverflow();await shot('mods');
  await nav('movement');assert.equal(await page.locator('.seeker-movement-grid>.card').count(),4);await click('[data-act="movement"][data-id="roll"]');assert.equal(await page.evaluate(()=>window.__frontier.game.ch.movement),'roll');await noOverflow();await shot('movement');
  await nav('growth');assert.ok(await page.locator('[data-act="skill-up"]').count());await noOverflow();await shot('upgrades');
  // Open/close and panel navigation preserve combat selections; no unexpected mutations.
  await click('.panel-close');assert.equal(await page.evaluate(()=>window.__frontier.panels.isOpen),false);
  await verifyPassiveGestures(page,{context:ctx,engineName:name,capture:label=>shot('passive-'+label)});
  assert.deepEqual(errors,[],size+' page errors');reports.push({size,width,height,touch,ok:true});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS '+name+' '+size);await ctx.close();
 }
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
