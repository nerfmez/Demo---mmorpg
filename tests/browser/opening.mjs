// Ordinary title/new-character UI (never ?fresh), all weapons, paid popup queue and ground routes.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';
import {data} from '../core/helpers.js';
import {createCharacter} from '../../src/core/character.js';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,port=4251,base=`http://localhost:${port}/`,out=`tests/browser/out/opening/${engine.name()}/`;
mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
const reports=[];let browser;
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('server');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const cases=[['desktop',1280,800,false],['ipad',1180,820,true],['phone-landscape',844,390,true],['phone-portrait',390,844,true]];
 for(const [size,width,height,touch] of cases.filter(c=>!process.env.OPENING_VIEW||c[0]===process.env.OPENING_VIEW))for(const kit of process.env.KIT?[process.env.KIT]:size.startsWith('phone')?['staff']:['sword','bow','staff']) {
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),page=await ctx.newPage(),errors=[];let verifiedRemoteRoute=null;
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
  const activate=s=>touch?page.locator(s).first().tap():page.locator(s).first().click();
  const ready=()=>page.waitForFunction(()=>__frontier.game&&__frontier.modelsReady&&document.querySelector('#loading').classList.contains('done'));
  const shot=label=>page.screenshot({path:out+`${size}-${kit}-${label}.png`});
  const resume=async()=>{await page.waitForFunction(()=>__frontier.weaponModelsReady());await page.reload();await enterFullscreenGate(page);await activate('[data-act="continue"]');await ready();};
  console.log('START ordinary opening',engine.name(),size,kit);
  await page.goto(`${base}?quality=low&seed=5&stream=0`);await enterFullscreenGate(page);await activate('[data-act="new"]');await page.locator('#heroName').fill(`Start ${kit}`);await activate('[data-act="start"]');await ready();
  assert.deepEqual(await page.evaluate(()=>Object.keys(__frontier.game.ch.skills)),[]);
  await activate('[data-act="wake"]');await page.waitForSelector('[data-act="kit"]');await activate(`[data-act="kit"][data-kit="${kit}"]`);
  if(size==='ipad'&&kit==='staff'){await shot('weapon');await resume();assert.equal(await page.locator(`[data-kit="${kit}"].on`).count(),1);}
  assert.equal(await page.locator('[data-act="skill"], [data-act="move"], [data-act="to-skills"]').count(),0);
  await activate('[data-act="finish"]');await page.waitForFunction(()=>__frontier.game.ch.opening.stage==='done');
  const basic={sword:'slash',bow:'hunter_shot',staff:'arcane_bolt'}[kit];
  const check=async()=>assert.deepEqual(await page.evaluate(()=>{const g=__frontier.game;g.refresh();return {skills:g.ch.skills,slots:g.ch.slots.map(s=>s.skill),movement:g.ch.movement,movementSkills:g.ch.movementSkills,charges:g.player.movement.charges,use:g.useMovement()};}),{skills:{[basic]:1},slots:[basic,null,null,null],movement:null,movementSkills:[],charges:0,use:false});
  await check();await page.waitForFunction(()=>__frontier.weaponModelsReady());await page.waitForTimeout(1200);await page.evaluate(()=>{__frontier.paused=true;__frontier.hud.setQuestCollapsed(false);document.querySelector('.banner')?.remove();});
  if(touch)await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-t','12px');document.documentElement.style.setProperty('--safe-l','12px');document.documentElement.style.setProperty('--safe-b','20px');dispatchEvent(new Event('resize'));});
  const fit=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {quest:rect('.quest-widget'),frame:rect('.pframe'),joy:rect('.joy'),hit:(()=>{const e=document.querySelector('.questtrack'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()};});
  assert.ok(fit.quest.x<width/2&&fit.quest.y>=fit.frame.bottom&&fit.hit,JSON.stringify(fit));if(touch)assert.ok(fit.quest.bottom<fit.joy.y,JSON.stringify(fit));
  await shot('basic-only');
  await activate('.questtrack');await page.waitForFunction(()=>__frontier.questRoute.mesh);
  assert.equal(await page.locator('.questtrack').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>__frontier.panels.isOpen),false);
  await shot('ground-route');
  const builds=await page.evaluate(()=>__frontier.questRoute.builds);await page.waitForTimeout(2100);assert.equal(await page.evaluate(()=>__frontier.questRoute.builds),builds,'stationary player never repeats pathfinding');
  await activate('.questtrack');assert.equal(await page.evaluate(()=>!!__frontier.questRoute.mesh),false);
  const plateau=await page.evaluate(()=>{const f=__frontier,counts=[];for(let i=0;i<4;i++){f.questRoute.toggle();f.view.render(0,performance.now()/1000,{});f.questRoute.toggle();f.view.render(0,performance.now()/1000,{});counts.push(f.view.renderer.info.memory.geometries);}return counts;});
  assert.equal(new Set(plateau).size,1,'route geometry returns to the same plateau after every hide');
  if(kit==='staff'&&!size.startsWith('phone')) {
    await page.evaluate(()=>{const g=__frontier.game;g.ch.progress.quests.f_road={status:'active',objectives:{'origin-road':1,primary:0},progress:0};g.ch.progress.questJournal.trackedId='f_road';});
    await activate('.questtrack');
    await page.waitForFunction(()=>!__frontier.questRoute.work&&__frontier.questRoute.path.length>1);
    const remoteRoute=await page.evaluate(()=>{
      const f=__frontier,g=f.game,r=f.questRoute,map='frontier-wilds-v1',stone=g.worlds[map].waypoints.find(w=>w.id==='town');
      const expected=g.scenePoint(map,stone.x,stone.z),end=r.path.at(-1),regions=new Set();let failure=null;
      // The rendered ribbon must be physically walkable through both native
      // regions, including between compressed vertices and across the old edge.
      for(let i=1;i<r.path.length&&!failure;i++){
        const a=r.path[i-1],b=r.path[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));let x=a.x,z=a.z;
        regions.add(g.world.regionAt(x,z)?.id);
        for(let j=1;j<=steps;j++){
          const nx=a.x+(b.x-a.x)*j/steps,nz=a.z+(b.z-a.z)*j/steps;
          const moved=g.world.move(x,z,.48,nx-x,nz-z,{allowSeams:true});
          if(!g.world.isFree(nx,nz,.48)||Math.hypot(moved.x-nx,moved.z-nz)>.01){failure={x:nx,z:nz};break;}
          regions.add(g.world.regionAt(nx,nz)?.id);x=nx;z=nz;
        }
      }
      return {target:{world:r.target.world,x:r.target.x,z:r.target.z},goal:r.target.goal,native:[stone.x,stone.z],expected,end,
        reach:Math.hypot(end.x-expected[0],end.z-expected[1]),endRegion:g.world.regionAt(end.x,end.z)?.id,
        endFree:g.world.isFree(end.x,end.z,.48),regions:[...regions],failure};
    });
    verifiedRemoteRoute=remoteRoute;
    assert.equal(remoteRoute.target.world,'frontier-wilds-v1');
    assert.deepEqual([remoteRoute.target.x,remoteRoute.target.z],remoteRoute.expected,'remote target is the exact fixed-scene waypoint anchor');
    assert.deepEqual([remoteRoute.goal.x,remoteRoute.goal.z],remoteRoute.native,'quest metadata retains the native map-qualified anchor');
    assert.ok(remoteRoute.reach<3.8&&remoteRoute.endFree,'route ends in walking clearance within real waypoint interaction reach');
    assert.equal(remoteRoute.endRegion,'frontier-wilds-v1','the route continues into the destination region');
    assert.equal(remoteRoute.failure,null,JSON.stringify(remoteRoute.failure));
    assert.deepEqual(new Set(remoteRoute.regions),new Set(['azure-harbor-v1','frontier-wilds-v1']),'the actual ground ribbon crosses both regions');
    await shot('remote-waypoint-route');
    await activate('.questtrack');await page.evaluate(()=>{delete __frontier.game.ch.progress.quests.f_road;__frontier.game.ch.progress.questJournal.trackedId=null;});
  }
  if(!touch){await page.locator('.questtrack').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.questtrack').getAttribute('aria-pressed'),'true');await page.keyboard.press('Enter');}
  await resume();await check();console.log('PASS create/reload',size,kit);
  // The ordinary empty movement slot must also open every loadout view safely.
  await page.evaluate(()=>__frontier.panels.open('skills'));
  assert.equal(await page.locator('.movement-bar .empty-mark').count(),1);
  assert.equal(await page.locator('.movement-bar b').textContent(),'ว่าง');
  if(height<=width){
    await activate('[data-action="category"][data-id="movement"]');
    assert.equal(await page.locator('.skill-grid .inventory-cell.locked').count(),Object.keys(data.skills.movement).length);
    await activate('[data-action="apply"]');await check();
    await shot('unlearned-movement');
  }
  await page.evaluate(()=>__frontier.panels.open('mods'));await check();
  await page.evaluate(()=>__frontier.panels.close());
  await check();
  if(kit!=='staff'){assert.deepEqual(errors,[]);reports.push({size,kit,ordinaryCreation:true});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));await ctx.close();continue;}
  // Pay two quests in one frame; UI cannot lose or replace either completion.
  const paid=await page.evaluate(()=>{const g=__frontier.game;for(const target of ['salt_slime','reef_crab'])for(let i=0;i<3;i++)g.notify({type:'kill',target});__frontier.save();return {gold:g.ch.gold,skills:{...g.ch.skills},materials:{...g.ch.materials},exp:g.ch.exp,jobExp:g.ch.jobExp,ids:g.ch.progress.questJournal.completions.map(r=>r.id)};});
  assert.deepEqual(paid.ids,['h_slimes','h_crabs']);await page.waitForSelector('.quest-completion[open]');
  assert.match(await page.locator('.quest-completion').innerText(),/รางวัลที่ได้รับแล้ว/);assert.match(await page.locator('.quest-completion').innerText(),/ลูกไฟ/);await shot('completed');
  const receiptId=await page.locator('[data-dismiss-quest]').getAttribute('data-dismiss-quest');
  if(touch)await page.touchscreen.tap(width-4,height-4);else await page.mouse.click(width-4,height-4);
  assert.equal(await page.locator('[data-dismiss-quest]').getAttribute('data-dismiss-quest'),receiptId,'backdrop tap never consumes a receipt');
  await page.evaluate(()=>{__frontier.completion.save=()=>false;});await activate('[data-dismiss-quest]');
  assert.equal(await page.locator('[data-dismiss-quest]').getAttribute('data-dismiss-quest'),receiptId,'failed persistence retains the receipt');
  await page.evaluate(()=>{__frontier.completion.save=__frontier.save;});
  const stopped=await page.evaluate(()=>{__frontier.input.reset();return {time:__frontier.game.time,casts:__frontier.game.player.cast};});
  await page.keyboard.press('1');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__frontier.game.time),stopped.time,'dialog pauses simulation and keyboard casts');
  console.log('PASS popup shown',size,kit);
  await resume();console.log('PASS popup reload',size,kit);assert.equal(await page.locator('[data-dismiss-quest="h_slimes"]').count(),1,'undismissed receipt survives Continue');
  await activate('[data-dismiss-quest="h_slimes"]');assert.equal(await page.locator('[data-dismiss-quest="h_crabs"]').count(),1);
  const savedQueue=await page.evaluate(()=>JSON.parse(localStorage.getItem('frontier.slot.1')).character.progress.questJournal.completions.map(r=>r.id));assert.deepEqual(savedQueue,['h_crabs']);
  if(size==='ipad')await resume();await activate('[data-dismiss-quest="h_crabs"]');assert.equal(await page.locator('.quest-completion[open]').count(),0);
  const same=await page.evaluate(()=>{const g=__frontier.game;g.completeQuests(['h_slimes','h_crabs']);__frontier.save();return {gold:g.ch.gold,skills:{...g.ch.skills},materials:{...g.ch.materials},exp:g.ch.exp,jobExp:g.ch.jobExp,ids:g.ch.progress.questJournal.completions.map(r=>r.id)};});
  assert.deepEqual(same,{...paid,ids:[]});
  if(size==='ipad')await resume();assert.equal(await page.locator('.quest-completion[open]').count(),0,'dismissed receipts stay dismissed');
  await page.evaluate(()=>{const g=__frontier.game;g.ch.progress.quests.s_job={status:'active',objectives:{primary:0},progress:0};g.ch.progress.questJournal.trackedId='s_job';});
  await activate('.questtrack');assert.equal(await page.evaluate(()=>!!__frontier.questRoute.mesh),false,'nonspatial job task invents no ground destination');
  assert.equal(await page.evaluate(()=>__frontier.game.ch.movement),null);assert.deepEqual(errors,[]);
  reports.push({size,kit,touch,ordinaryCreation:true,receiptReload:true,queue:true,route:true,remoteRoute:verifiedRemoteRoute,safeAreas:touch,errors});writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS ordinary opening/rewards/route',engine.name(),size,kit);await ctx.close();
 }
 // Owner-save migration uses a separate synthetic context, never an owner's browser data.
 const old=createCharacter(data,{kit:'staff'});old.version=10;old.opening={stage:'done'};old.skills={arcane_bolt:1,firebolt:3,ward:2};old.slots=[{skill:'firebolt',mods:[]},{skill:'ward',mods:[]},{skill:'arcane_bolt',mods:[]},{skill:null,mods:[]}];old.movementSkills=['roll'];old.movement='roll';old.gold=777;old.progress.questJournal={version:1,trackedId:null};old.progress.quests.h_slimes={status:'done',progress:3,rewardClaimed:true};
 const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true}),p=await ctx.newPage();p.setDefaultTimeout(90000);
 await p.addInitScript(ch=>{if(!localStorage.getItem('frontier.slot.1')){localStorage.setItem('frontier.slot.1',JSON.stringify({version:2,character:ch}));localStorage.setItem('frontier.lastSlot','1');}},old);
 await p.goto(`${base}?quality=low&stream=0`);await enterFullscreenGate(p);await p.locator('[data-act="continue"]').tap();await p.waitForFunction(()=>__frontier.game&&__frontier.modelsReady);
 const migrated=await p.evaluate(()=>__frontier.game.ch);for(const key of ['skills','slots','movementSkills','movement','gold','gear','equipped'])assert.deepEqual(migrated[key],old[key],key);
 assert.deepEqual(migrated.progress.questJournal.completions,[]);assert.equal(await p.locator('.quest-completion[open]').count(),0);
 await p.screenshot({path:out+'old-save.png'});console.log('PASS v10 real Continue preservation',engine.name());await ctx.close();
} finally {await browser?.close();try{process.kill(-server.pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
