// UI fixtures supply a review character, never fabricated click results.
// Default: full game and real renderer. OFFLINE_UI=1: real Game/Panels without renderer.
import assert from 'node:assert/strict';
import {journalJump} from './passive-checks.mjs';
import {freezeScene} from './freeze-scene.mjs';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const offline=!!process.env.OFFLINE_UI,engineName=process.env.BROWSER||'chromium',engine=engineName==='webkit'?webkit:chromium;
const dir=new URL(`./out/journal-${engineName}/`,import.meta.url).pathname;mkdirSync(dir,{recursive:true});
let server,browser,code='',css='';const reports=[];
if(offline){
 const {build}=await import('vite');const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'JournalReview',formats:['iife']}}});
 code=b[0].output.find(o=>o.type==='chunk').code;
 css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
 for(const weight of [400,600]){const f=readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${weight}.ttf`,import.meta.url)).toString('base64');css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${f});font-weight:${weight}}`;}
 for(const subset of ['thai','latin'])for(const weight of [400,500]){const f=readFileSync(new URL(`../../node_modules/@fontsource/mitr/files/mitr-${subset}-${weight}-normal.woff2`,import.meta.url)).toString('base64');css+=`@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${f});font-weight:${weight}}`;}
}else server=spawn('npx',['vite','preview','--port','4187','--strictPort'],{stdio:'ignore',detached:true});
try{
 if(!offline)for(let i=0;;i++){try{if((await fetch('http://localhost:4187/')).ok)break;}catch{}if(i>50)throw Error('server startup');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const sizes=process.env.QUICK?[['desktop',1600,900,false]]:[['desktop',1600,900,false],['ipad',1180,820,true],['phone-landscape',844,390,true],['phone-portrait',390,844,true]];
 for(const [name,width,height,touch]of sizes){
  if(process.env.JOURNAL_CASES&&!process.env.JOURNAL_CASES.split(',').includes(name))continue;
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  if(offline){await page.setContent('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="hud"></div></body></html>');await page.addStyleTag({content:css});await page.addScriptTag({content:code});}
  else {await page.goto('http://localhost:4187/?fresh=1&quality=low&seed=7');await page.waitForFunction(()=>window.__frontier?.game?.time>.2,null,{timeout:60000});await freezeScene(page);}
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const f=window.__frontier,g=f.game;g.ch.name='Seeker';g.ch.level=18;g.ch.jobLevel=18;g.ch.jobPoints=12;g.ch.jobNodes=['origin','v1','v2','r1','r2','f_hp'];g.ch.gold=2400;for(const k in g.ch.stats)g.ch.stats[k]=20;g.ch.mods=Object.keys(g.data.mods.mods).map((id,i)=>({id,uid:900+i,level:1}));g.ch.slots[0]={skill:'firebolt',mods:[]};g.ch.skills.firebolt=1;g.refresh();f.panels.open('job');});
  const click=async selector=>{const l=page.locator(selector).first();return touch?l.tap():l.click();};
  const shot=async label=>page.screenshot({path:dir+name+'-'+label+'.png',timeout:60000});
  assert.equal(await page.locator('#plane > [data-node]').count(),8);assert.equal(await page.locator('.seeker-constellation').count(),0);
  assert.ok(!await page.locator('#inspector').isVisible());
  const full=await page.locator('.panel').boundingBox();assert.equal(full.x,0);assert.equal(full.y,0);assert.equal(full.width,width);assert.equal(full.height,height);
  assert.ok(await page.evaluate(()=>document.body.classList.contains('panel-open')));
  assert.ok(!await page.locator('.tabs').isVisible());
  const gr=await page.locator('#map').boundingBox();assert.ok(gr.height>=44,JSON.stringify({gr,height}));await shot('01-shared-start');
  const points=await page.evaluate(()=>__frontier.game.ch.jobPoints);
  await journalJump(page,'a1');assert.equal(await page.evaluate(()=>__frontier.game.ch.jobPoints),points);
  await click('[data-action="learn"][data-id="a1"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.jobPoints),points-1);
  await shot('02-inspected');await click('[data-action="close-detail"]');
  assert.equal(await page.evaluate(()=>__frontier.game.ch.jobNodes.includes('a2')),false);
  const stageSelector=width<=760?'#mobile-stages':'#chapter-tabs';await click(stageSelector+' [data-stage="2"]');await shot('03-ordinary-path');
  assert.equal(await page.locator('[data-discipline]').count(),0);
  const before=await page.evaluate(()=>JSON.stringify(__frontier.game.ch.jobNodes));const rect=await page.locator('#map').boundingBox();
  await page.mouse.move(rect.x+rect.width*.35,rect.y+rect.height*.4);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.35+60,rect.y+rect.height*.4+10,{steps:6});await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(__frontier.game.ch.jobNodes)),before);
  await click('[data-action="fit"]');await click('[data-action="exit"]');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);
  // Open actual menu workspace; the fixtures are not the implementation.
  await page.evaluate(()=>window.__frontier.panels.open('mods'));
  assert.equal(await page.locator('.seeker-mod-list [data-gem]').count(),15);
  await click('.seeker-mod-tile[data-uid="900"]');await shot('04-mod-gems');
  await click('[data-act="socket"][data-uid="900"]');assert.ok(await page.evaluate(()=>window.__frontier.game.ch.slots[0].mods.includes(900)));
  const base=await page.evaluate(()=>window.__frontier.game.skills[0].projectiles); // compiler remains authoritative
  await page.evaluate(()=>window.__frontier.panels.open('bag'));
  await click('[data-act="inventory-category"][data-id="mods"]');await shot('05-bag');assert.ok(await page.locator('[data-panel="bag"] [data-gem="split"]').count());
  await page.evaluate(()=>window.__frontier.panels.open('craft'));await click('[data-act="craft-filter"][data-id="mod"]');assert.ok(await page.locator('.recipe-card [data-gem]').count());
  assert.deepEqual(errors,[]);
  reports.push({viewport:name,width,height,touch,source:offline?'real Game+Panels, no renderer':'full game',fullscreen:true,startingNodes:8,modGemTypes:15,ok:true});writeFileSync(dir+'report.json',JSON.stringify(reports,null,2));console.log('PASS journal '+engineName+' '+name);await ctx.close();
 }
}finally{await browser?.close();if(server)try{process.kill(-server.pid);}catch{}}
