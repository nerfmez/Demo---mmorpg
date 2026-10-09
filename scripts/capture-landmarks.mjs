// Actual High game camera evidence. Run a built preview on port 4178 first.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadData} from '../src/core/data-node.js';
const phase=process.argv[2]||'before', only=process.argv.slice(3), data=loadData();
const out=`${process.env.UI_OUT||'work/landmark-review'}/${phase}/`;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const page=await context.newPage();page.setDefaultTimeout(180000);
const errors=[],report={phase,quality:'high',cameraZoom:Number(process.env.REVIEW_ZOOM||1),cameraDistance:Number(process.env.REVIEW_DISTANCE||1.6),cameraSide:Number(process.env.REVIEW_SIDE||1),engine:'Chromium / ANGLE SwiftShader',shots:[],errors};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
async function shot(name){await page.screenshot({path:out+name+'.png'});report.shots.push(name);console.log('SHOT',name);}
try{
 for(const [mapId,map]of Object.entries(data.maps)){
  const list=map.landmarks.filter(l=>!l.builtin&&(!only.length||only.includes(l.id)));if(!list.length)continue;
  await page.setViewportSize({width:1180,height:820});
  await page.goto(`${process.env.CAPTURE_BASE||'http://127.0.0.1:4178'}/?fresh=1&seed=9&quality=high&stream=0&map=${mapId}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading').classList.contains('done'));
  await page.evaluate(()=>{const f=__frontier;f.paused=true;f.input.reset();f.input.disabled=true;f.game.monsters=[];f.game.spawnPoints=[];f.reviewRender=f.view.render.bind(f.view);f.view.render=()=>{};document.querySelector('.banner')?.remove();});
  await page.evaluate(({zoom,distance,side})=>{__frontier.reviewZoom=zoom;__frontier.reviewDistance=distance;__frontier.reviewSide=side;},{zoom:report.cameraZoom,distance:report.cameraDistance,side:report.cameraSide});
  for(const lm of process.env.UI_ONLY?[]:list){
   const at=await page.evaluate(id=>{const f=__frontier,w=f.game.world,l=w.landmarks.find(l=>l.id===id);let at=null;
    const radius=Math.max(...l.parts.map(p=>Math.hypot(p.x-l.x,p.z-l.z)+p.r));
    for(let d=radius+f.reviewDistance;d<l.clear+9&&!at;d+=.5)for(const a of [0,.6,-.6,1.1,-1.1,1.57,-1.57]){const x=l.x+Math.sin(a)*d,z=l.z+Math.cos(a)*d*f.reviewSide;if(w.isFree(x,z,.5)&&!w.isWater(x,z)){at=[x,z];break;}}
    if(!at)return null;Object.assign(f.game.player,{x:at[0],z:at[1],facing:Math.atan2(l.x-at[0],l.z-at[1])});f.view.zoom=f.reviewZoom;f.view.snapCamera();f.reviewRender(0,2,{});f.reviewRender(0,2,{});f.view.renderer.getContext().finish();return at;
   },lm.id);assert.ok(at);await shot(lm.id+'-game');if(process.env.MOTION_SHOTS&&lm.kind==='windmill'){for(let n=1;n<=3;n++){await page.waitForTimeout(500);await page.evaluate(()=>{__frontier.reviewRender(0,2,{});__frontier.view.renderer.getContext().finish();});await shot(lm.id+'-motion-'+n);}}if(process.env.MOBILE_SHOTS){for(const viewport of [{width:844,height:390},{width:390,height:844}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>{__frontier.view.resize();__frontier.view.snapCamera();__frontier.reviewRender(0,2,{});__frontier.view.renderer.getContext().finish();});await shot(lm.id+'-'+viewport.width+'x'+viewport.height);}await page.setViewportSize({width:1180,height:820});}
  }
  if(mapId==='azure-harbor-v1'&&!process.env.NO_UI)for(const viewport of process.env.QUICK?[{width:1180,height:820}]:[{width:1440,height:900},{width:1180,height:820},{width:844,height:390},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.evaluate(()=>__frontier.reviewRender(0,2,{}));
   for(const tab of process.env.QUICK?['menu']:['menu','bag']){
    await page.evaluate(tab=>__frontier.panels.open(tab),tab);await page.waitForTimeout(600);
    await page.locator('#atelier img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode().catch(()=>{})));});
    if(tab==='bag'&&process.env.UI_ONLY){if(viewport.height>viewport.width)await page.locator('[data-action="view-side"][data-id="right"]').tap();await page.locator('.library-window').evaluate(el=>el.scrollTop=0);const filter=page.locator('[data-filter]');await filter.focus();await filter.selectOption('weapon');assert.ok(await filter.evaluate(el=>document.activeElement===el));await filter.selectOption('all');}await shot(`${tab}-${viewport.width}x${viewport.height}`);
    await page.evaluate(()=>__frontier.panels.close());
   }
  }
 }
 assert.deepEqual(errors,[]);await fs.writeFile(out+'report.json',JSON.stringify(report,null,2));console.log('PASS',report.shots.length);
}finally{await browser.close();}
