// Focused owner review: U-bay overview and original gameplay camera only.
// No stress/leak/full-game capture. Hardware iPad FPS remains unmeasured.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const layoutOnly=process.env.AZURE_LAYOUT_REVIEW==='1';
const finishOnly=process.env.AZURE_FINISH_REVIEW==='1';
const shopOnly=process.env.AZURE_SHOP_REVIEW==='1';
const districtOnly=process.env.AZURE_DISTRICT_REVIEW==='1';
const marketOnly=process.env.AZURE_MARKET_REVIEW==='1';
const worldData=JSON.parse(readFileSync('data/world.json','utf8'));
if(worldData.city?.enabled){await import('./city-review.mjs');process.exit(0);}
const referenceOffset=worldData.town.placement?.referenceOffset||[0,0];
const styleReview=!!worldData.town.styleSlice;
const out=`tests/browser/out/azure-${layoutOnly?'layout':styleReview?'style':'blockout'}-${engine.name()}/`;mkdirSync(out,{recursive:true});
const port=4191,base=`http://localhost:${port}/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
const report={engine:engine.name(),errors:[],hardwareIPadFPS:'not measured',captures:[]};
// Solve the graphic port-crest phase for contact review labels. Beach timing
// remains the previously reviewed swash phase in the renderer.
function nextCrestTime(x,z,now,surf){
  const speed=surf.waveSpacing/surf.period,bend=surf.crestBend??1.0,length=surf.crestLength??12;
  const row=Math.ceil((z+now*speed)/surf.waveSpacing);
  // Shader's cosmetic hash and group coordinates, for capture timing only.
  const hash=(a,b)=>{let px=((a*.1031)%1+1)%1,py=((b*.1031)%1+1)%1,pz=px;
    const dot=px*(py+33.33)+py*(pz+33.33)+pz*(px+33.33);px+=dot;py+=dot;pz+=dot;return ((px+py)*pz)%1;};
  const offset=hash(row,93.7)*length,cell=Math.floor((x-offset)/length),seed=hash(cell,row);
  const centre=(cell+.5)*length+offset+(seed-.5)*length*.12;
  const halfLength=length*(.28+.13*hash(cell+8.3,row)),tip=Math.min(1,Math.max(-1,(x-centre)/halfLength));
  const phase=t=>z+t*speed+bend*(.45*Math.sin(x*.19+t*.15+row*.37)+.12*Math.sin(x*.43-t*.10+row*2.1)-(.65+.20*seed)*(tip*tip-.35));
  let t=row*surf.period-z/speed;
  for(let i=0;i<6;i++)t-=(phase(t)-row*surf.waveSpacing)/(speed+bend*(.0675*Math.cos(x*.19+t*.15+row*.37)-.012*Math.cos(x*.43-t*.10+row*2.1)));
  if(t<now)return nextCrestTime(x,z,now+surf.period*.5,surf);
  return t;
}
let browser;
try {
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>60)throw Error('preview server');await new Promise(r=>setTimeout(r,250));}
  browser=await engine.launch({...(process.env.CHROMIUM_EXECUTABLE&&engine===chromium?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__azureFreeze)cb(t)});});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))report.errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`)});
  await page.goto(base+'?fresh=1&seed=9&quality=medium');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:60000});
  await page.evaluate(()=>{window.__azureFreeze=true;const f=window.__frontier;f.paused=true;f.input.reset();f.input.disabled=false;});
  // Real touch event reaches the existing production joystick handler.
  if(engine===chromium){
    const cdp=await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:680,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:680,id:1}]});
    report.touch=await page.evaluate(()=>{const f=window.__frontier;f.input.update();return f.game.input.moveX;});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  } else {
    report.touch=await page.evaluate(()=>{const f=window.__frontier;for(const [type,x] of [['pointerdown',90],['pointermove',150]])f.input.joyZone.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch',clientX:x,clientY:680}));f.input.update();const x=f.game.input.moveX;f.input.joyZone.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'touch'}));return x;});
  }
  assert.ok(report.touch>.8,'touch joystick drives movement');
  report.walk=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game;f.input.disabled=true;
    for(const [x,z] of g.data.world.roads.find(r=>r.id==='arrival').points.slice(1)){
      let i=0;for(;i<3000&&Math.hypot(x-g.player.x,z-g.player.z)>.25;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);if(!g.isSafe(g.player.x,g.player.z)||g.player.dead)throw Error('unsafe arrival');}
      if(i===3000)throw Error('blocked arrival');
    }
    const wp=g.world.waypoints.find(w=>w.id==='town');
    for(let i=0;i<500&&Math.hypot(wp.x+1.5-g.player.x,wp.z-g.player.z)>.25;i++){g.setMove(wp.x+1.5-g.player.x,wp.z-g.player.z);g.update(1/60);}
    g.setMove(0,0);for(let i=0;i<30;i++)g.update(1/60);
    return {townUnlocked:g.isWaypointUnlocked('town'),quest:g.ch.progress.quests.h_arrival?.status};
  });
  assert.ok(report.walk.townUnlocked&&report.walk.quest==='done');
  if(styleReview){report.marketPierWalk=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game,wd=g.data.world;
    Object.assign(g.player,g.freeSpotNear(...wd.town.centre));
    const ramp=g.world.docks.find(d=>d.id==='market_west_ramp'),deck=g.world.docks.find(d=>d.id==='market_west');
    const land=[ramp.x-Math.sin(ramp.angle)*ramp.hz,ramp.z-Math.cos(ramp.angle)*ramp.hz];
    const quay=wd.roads.find(r=>r.id==='harbor_street').points;
    const front=wd.roads.find(r=>r.id==='market_front');
    let path;
    if(front){
      const nearest=p=>quay.reduce((best,q,i)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(quay[best][0]-p[0],quay[best][1]-p[1])?i:best,0);
      const a=nearest(front.points.at(-1)),b=nearest(land);
      path=[...front.points,...quay.slice(b,a+1).reverse(),land,[ramp.x,ramp.z],[deck.x,deck.z]];
    }else path=[[wd.town.centre[0],-31],[ramp.x,-31],land,[ramp.x,ramp.z],[deck.x,deck.z]];
    for(const [x,z] of path){let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.2;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}if(i===1500)throw Error('market-to-pier route blocked at '+x+','+z);}
    g.setMove(0,0);return {onPier:!!g.world.dockAt(g.player.x,g.player.z),alive:!g.player.dead};
  });assert.ok(report.marketPierWalk.onPier&&report.marketPierWalk.alive);}
  const shot=async(name)=>{await page.screenshot({path:out+name+'.png',timeout:60000});report.captures.push(name);console.log('captured',name);};
  const stage=async(x,z)=>page.evaluate(([x,z])=>{const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.view.zoom=1;f.view.camera.up.set(0,1,0);f.view.snapCamera();f.view.render(.016,f.game.time,{});f.hud.update(.6,f.panels);},[x,z]);
  const frontage=id=>worldData.town.buildings.find(b=>b.id===id).entryPath[0];
  const deckPoint=(id,z=0)=>{const d=worldData.docks.find(d=>d.id===id);return [d.x+Math.sin(d.angle)*z,d.z+Math.cos(d.angle)*z];};
  await page.evaluate(()=>{const f=window.__frontier;f.game.time+=8;f.game.drainEvents();document.querySelector('.banner')?.remove();});
  if(styleReview&&!shopOnly&&!districtOnly&&!finishOnly&&!layoutOnly){
    await stage(-29,-30.5);await shot('09-market-stalls-gameplay');
    await stage(31,-30.5);await shot('10-market-stalls-east-gameplay');
  }
  if(layoutOnly){
    report.marketAisleWalk=await page.evaluate(()=>{
      const g=window.__frontier.game,aisle=g.data.world.town.market.aisle,[a,b]=aisle.points;
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
      for(const offset of [-aisle.width/2+.55,0,aisle.width/2-.55]){
        Object.assign(g.player,{x:a[0]-dz*offset,z:a[1]+dx*offset});
        const x=b[0]-dz*offset,z=b[1]+dx*offset;
        let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.18;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}
        if(i===1500||g.player.dead)throw Error('market aisle lane blocked: '+offset);
      }
      g.setMove(0,0);return {lanes:3,width:aisle.width};
    });
    report.frontages=await page.evaluate(()=>{
      const g=window.__frontier.game;let reached=0;
      for(const b of g.data.world.town.buildings){
        const path=[...b.entryPath].reverse();Object.assign(g.player,{x:path[0][0],z:path[0][1]});
        for(const [x,z] of path.slice(1)){let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.18;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}if(i===1500||g.player.dead)throw Error('blocked frontage '+b.id);}
        reached++;
      }
      g.setMove(0,0);return {reached};
    });assert.equal(report.frontages.reached,worldData.town.buildings.length);
    await stage(...worldData.town.centre);await shot('02-market-square-gameplay');
    const residential=worldData.roads.find(r=>r.id==='residential_cross');
    const [dx,dz]=referenceOffset;
    const junction=residential.points.reduce((best,p)=>Math.hypot(p[0]+39.9-dx,p[1]+64.26-dz)<Math.hypot(best[0]+39.9-dx,best[1]+64.26-dz)?p:best,residential.points[0]);
    await stage(...junction);await shot('03-residential-lanes-gameplay');
    await stage(...frontage('warehouse_4'));await shot('04-warehouse-row-gameplay');
    await stage(...deckPoint('market_west_ramp',-1));await shot('05-quay-pier-join-gameplay');
    await stage(...deckPoint('repair_ramp',-7));await shot('06-shipyard-slipway-gameplay');
    const launch=worldData.harbor.workProps.find(p=>p.id==='launch_hull');
    if(launch)await stage(launch.x+5,launch.z);
    else {const [sx,sz]=frontage('repair_store');await stage(sx-2,sz+2);}
    await shot('08-shipyard-working-yard-gameplay');
    report.townLife=await page.evaluate(()=>{
      const f=window.__frontier,n=f.view.npcs.find(n=>n.root.userData.residentId==='shipwright');
      f.view.render(.016,10,{});const first=n.bones.armR.rotation.x;
      f.view.render(.016,10+f.world.data.town.life.gesturePeriod/4,{});
      return {residents:f.view.npcs.filter(n=>n.scenery).length,shipwrightVisible:n.root.visible,workGestureChanges:Math.abs(first-n.bones.armR.rotation.x)>.01};
    });assert.ok(report.townLife.shipwrightVisible&&report.townLife.workGestureChanges);
    if(launch){
      await page.setViewportSize({width:820,height:1180});
      await page.evaluate(()=>window.__frontier.view.resize());
      await stage(launch.x+4.15,launch.z+4);await shot('15-large-ship-portrait-gameplay');
      report.shipPortraitCamera=await page.evaluate(()=>({fov:window.__frontier.view.camera.fov,zoom:window.__frontier.view.zoom}));
      assert.equal(report.shipPortraitCamera.fov,52);assert.equal(report.shipPortraitCamera.zoom,1);
      await page.setViewportSize({width:1180,height:820});
      await page.evaluate(()=>window.__frontier.view.resize());
    }
    const wash=worldData.harbor.workProps.find(p=>p.id==='west_laundry');
    if(wash){await stage(wash.x,wash.z+3.3);await shot('13-residential-courtyard-life-gameplay');}
    await stage(worldData.town.centre[0],worldData.town.centre[1]+3.3);await shot('14-organised-market-gameplay');
    for(const [id,name] of [['fish_market','10-fish-market-gameplay'],['market_0','11-netter-shop-gameplay'],['market_1','12-sailmaker-shop-gameplay']]){
      const [x,z]=frontage(id);await stage(x,z+2);await shot(name);
    }
    const [lx,lz]=worldData.harbor.lighthouse;await stage(lx+3,lz+6);await shot('07-lighthouse-cape-gameplay');
    await page.evaluate(()=>{const f=window.__frontier;f.game.ch.progress.zones=f.world.zones.map(z=>z.id);f.panels.open('map');});
    await shot('09-revised-local-map');await page.evaluate(()=>window.__frontier.panels.close());
    await stage(...worldData.playerSpawn);await shot('17-original-arrival-beach-gameplay');
  }else if(finishOnly){
    if(process.env.AZURE_WAVE_ONLY!=='1'){
    await stage(-129.62,-18.16);await shot('19-outlined-cottage-gameplay');
    await stage(-42,-48.2);await shot('20-outlined-fish-hall-gameplay');
    await stage(90.70,-38.35);await shot('21-outlined-warehouse-gameplay');
    }
    if(process.env.AZURE_CONTACT_REVIEW==='1'){
      report.waterContacts=await page.evaluate(()=>{
        const f=window.__frontier,sea=f.view.scene.children.flatMap(o=>o.children||[]).find(m=>m.name==='sea-swash');
        return sea.material.userData.waterContact;
      });assert.ok(report.waterContacts.sections>20,'actual waterline sections baked');
      const surf=JSON.parse(readFileSync('data/world.json','utf8')).sea.surf;
      const currentTime=await page.evaluate(()=>window.__frontier.game.time);
      for(const [name,x,z,hitZ] of [['boat-piles',-23.2,-5.2,-3.45],['stone-armour',-119,86,89.6],['quay-wall',0,-24.5,-22.775]]){
        const impactTime=nextCrestTime(x,hitZ,currentTime,surf);
        for(const [phase,delta] of [['incoming',0],['impact',.55],['spread',1.45],...(name==='boat-piles'?[['pile-hit',4.6]]:[])]){
          await page.evaluate(t=>{window.__frontier.game.time=t;},impactTime+delta);
          await stage(x,z);await shot('contact-'+name+'-'+phase);
        }
        if(name==='boat-piles'&&process.env.AZURE_WAVE_SEQUENCE==='1'){
          mkdirSync(out+'contact-frames',{recursive:true});
          const sampledFPS=12,frames=72;
          for(let i=0;i<frames;i++){
            await page.evaluate(t=>{window.__frontier.game.time=t;},impactTime+i/sampledFPS);
            await stage(x,z);await page.screenshot({path:out+`contact-frames/${String(i).padStart(3,'0')}.png`,timeout:60000});
            if(i%15===0)console.log('contact frame',i,frames);
          }
          report.contactSequence={frames,sampledFPS,duration:frames/sampledFPS,hardwareFPS:'not measured'};
        }
      }
    } if(process.env.AZURE_CONTACT_STATIC_ONLY!=='1'){
    if(process.env.AZURE_CONTACT_REVIEW!=='1'){
    await stage(-119,86);await shot('22-outlined-breakwater-foam-gameplay');
    await stage(0,-24.5);await shot('23-quay-foam-gameplay');
    }
    const waveTime=await page.evaluate(()=>window.__frontier.game.time);
    for(const [name,delta] of [['24-beach-foam-advance',0],['25-beach-foam-break',1.9],['26-beach-foam-retreat',3.8]]){
      await page.evaluate(t=>{window.__frontier.game.time=t;},waveTime+delta);
      await stage(-151,99.3);await shot(name);
    }
    report.foamPhases=[waveTime,waveTime+1.9,waveTime+3.8];
    if(process.env.AZURE_WAVE_SEQUENCE==='1'){
      mkdirSync(out+'wave-frames',{recursive:true});
      const period=JSON.parse(readFileSync('data/world.json','utf8')).sea.surf.period,sampledFPS=12,frames=Math.round(period*sampledFPS);
      for(let i=0;i<frames;i++){
        await page.evaluate(t=>{window.__frontier.game.time=t;},waveTime+i/sampledFPS);
        await stage(-151,99.3);
        await page.screenshot({path:out+`wave-frames/${String(i).padStart(3,'0')}.png`,timeout:60000});
        if(i%16===0)console.log('wave frame',i,frames);
      }
      report.waveSequence={frames,sampledFPS,duration:period,hardwareFPS:'not measured'};
    }
    }
    report.staticResources=await page.evaluate(()=>{
      const f=window.__frontier,v=f.view;
      const sample=()=>({geometries:v.renderer.info.memory.geometries,textures:v.renderer.info.memory.textures,programs:v.renderer.info.programs.length});
      const first=sample();for(let i=1;i<=90;i++)v.render(1/30,f.game.time+i/30,{});return {first,last:sample()};
    });assert.deepEqual(report.staticResources.first,report.staticResources.last,'wave phases do not allocate GPU resources');
  } else if(districtOnly){
    report.districtWalk=await page.evaluate(()=>{
      const g=window.__frontier.game,ids=g.data.world.town.districtStyle.buildingIds;
      let reached=0;
      for(const b of g.data.world.town.buildings.filter(b=>ids.includes(b.id))){
        const path=[...b.entryPath].reverse();Object.assign(g.player,{x:path[0][0],z:path[0][1]});
        for(const [x,z] of path.slice(1)){
          let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.18;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}
          if(i===1500||g.player.dead)throw Error('blocked district entry '+b.id);
        }
        reached++;
      }
      g.setMove(0,0);return {frontagesReached:reached};
    });assert.equal(report.districtWalk.frontagesReached,18);
    await stage(-129.62,-18.16);await shot('11-residential-cottage-gameplay');
    await stage(-101.14,-18.32);await shot('12-residential-timber-gameplay');
    await stage(90.70,-38.35);await shot('13-warehouse-gameplay');
    await stage(126,12);await shot('14-loading-yard-gameplay');
    await stage(130,75);await shot('15-shipwright-gameplay');
    await stage(129,84);await shot('16-repair-hull-gameplay');
    await stage(-127.5,77.5);await shot('17-lighthouse-gameplay');
    await stage(-119,86);await shot('18-breakwater-gameplay');
  } else if(shopOnly){
    await stage(-42,-48.2);await shot('02-market-gameplay');
    await stage(-25,-53.3);await shot('05-craft-gameplay');
    await stage(25,-53.3);await shot('08-provisioner-gameplay');
    await stage(45,-48.1);await shot('06-inn-gameplay');
  } else if(marketOnly){
    await stage(-25,-20);await shot('04-market-pier-gameplay');
    await stage(-25,-6);await shot('07-fishing-berth-gameplay');
  } else {
    await stage(styleReview?-42:-37,styleReview?-47.8:-43);await shot('02-market-gameplay');
    if(styleReview){await stage(-25,-51.5);await shot('05-craft-gameplay');await stage(45,-47.8);await shot('06-inn-gameplay');}
    await stage(-25,-20);await shot('04-market-pier-gameplay');
    if(styleReview){await stage(-25,-6);await shot('07-fishing-berth-gameplay');await stage(25,-51.5);await shot('08-provisioner-gameplay');}
    await stage(114,76);await shot('03-rotated-slipway-gameplay');
  }
  if(!shopOnly&&!marketOnly&&!finishOnly){
    await page.setViewportSize(layoutOnly?{width:1012,height:1224}:{width:1440,height:1000});
    await page.evaluate(layoutOnly=>{
      const f=window.__frontier,v=f.view;
      v.resize(); // Set the new aspect before rendering; do not race the resize event.
      for(const element of document.body.children) if(element.tagName!=='CANVAS')element.style.visibility='hidden';
      if(layoutOnly){
        // Register the actual game capture to the supplied plan's rectangle:
        // source pixels [1009,115,1515,727], X=(px-1230)*.42+offsetX,
        // Z=(py-400)*.42+offsetZ. A distant narrow frustum keeps parallax <1 pixel
        // while retaining the real renderer. This camera is review-only.
        const height=257.04,landY=.7,distance=6000;
        v.scene.fog.near=10000;v.scene.fog.far=12000;
        v.camera.near=5800;v.camera.far=6200;
        v.camera.fov=2*Math.atan(height/(2*(distance-landY)))*180/Math.PI;
        const [dx,dz]=f.world.data.town.placement?.referenceOffset||[0,0];
        v.camera.up.set(0,0,-1);v.camera.position.set(13.44+dx,distance,8.82+dz);v.camera.lookAt(13.44+dx,landY,8.82+dz);
      }else{
        v.scene.fog.near=600;v.scene.fog.far=900;
        v.camera.far=900;v.camera.fov=53;v.camera.up.set(0,0,-1);v.camera.position.set(0,285,8);v.camera.lookAt(0,0,8);
      }
      v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();
      v.renderer.render(v.scene,v.camera);
      // Capture the WebGL pixels synchronously before browser compositing can
      // clear a non-preserved drawing buffer; labels remain a review-only overlay.
      const pixels=document.createElement('img');pixels.src=v.renderer.domElement.toDataURL('image/png');
      pixels.dataset.azureReview='pixels';
      pixels.style.cssText='position:fixed;inset:0;width:100%;height:100%;visibility:visible';document.body.append(pixels);
      v.canvasRect=v.renderer.domElement.getBoundingClientRect();
      const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;pointer-events:none;visibility:visible';document.body.append(overlay);
      overlay.dataset.azureReview='labels';
      if(layoutOnly)return;
      for(const [text,x,z] of [['บ้าน / ซอยวน',-110,-20],['ตลาด · คราฟต์ · วาร์ป',0,-49],['ทางออกสู่พื้นที่ล่า',0,-105],['โกดัง / ลานสินค้า',115,-26],['อู่เรือ / ทางลาด',128,76],['ประภาคาร / กันคลื่น',-125,82],['ปากอ่าวเปิดทางใต้',0,106]]){
        const p=v.project(x,2,z);const label=document.createElement('div');label.textContent=text;label.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);font:18px Mitr,sans-serif;padding:5px 10px;background:#163b41de;color:white;border-radius:4px`;overlay.append(label);
      }
    },layoutOnly);
    await shot('01-u-bay-overview');
    if(layoutOnly){
      report.planRegistration={sourcePixelRect:[1009,115,1515,727],metresPerSourcePixel:.42,originPixel:[1230,400],worldOffset:referenceOffset,camera:'review only; original gameplay camera retained'};
      await page.setViewportSize({width:1480,height:1200});
      report.worldPlacement=await page.evaluate(()=>{
        const f=window.__frontier,v=f.view,wd=f.world.data,b=wd.bounds;
        for(const e of document.querySelectorAll('[data-azure-review]'))e.remove();
        v.resize();
        v.canvasRect=v.renderer.domElement.getBoundingClientRect();
        const x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,height=b.maxZ-b.minZ+40,landY=.7,distance=6000;
        v.camera.fov=2*Math.atan(height/(2*(distance-landY)))*180/Math.PI;
        v.camera.position.set(x,distance,z);v.camera.lookAt(x,landY,z);
        v.camera.updateProjectionMatrix();v.camera.updateMatrixWorld();v.renderer.render(v.scene,v.camera);
        const pixels=document.createElement('img');pixels.src=v.renderer.domElement.toDataURL('image/png');
        pixels.dataset.azureReview='pixels';pixels.style.cssText='position:fixed;inset:0;width:100%;height:100%;visibility:visible';document.body.append(pixels);
        const overlay=document.createElement('div');overlay.dataset.azureReview='labels';
        overlay.style.cssText='position:fixed;inset:0;pointer-events:none;visibility:visible';document.body.append(overlay);
        for(const [text,px,pz] of [['Original arrival beach',...wd.playerSpawn],['Azure Coast / original town (62, 22)',...wd.town.centre],['Original forest',-110,-70],['Original grove',-110,12]]){
          const p=v.project(px,2,pz),label=document.createElement('div');label.textContent=text;
          label.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-110%);font:17px Mitr,sans-serif;padding:4px 9px;background:#163b41e8;color:white;border-radius:4px`;
          overlay.append(label);
          const marker=document.createElement('div');marker.style.cssText=`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);width:8px;height:8px;border:2px solid white;border-radius:50%;background:#dcab5e`;
          overlay.append(marker);
        }
        return {sourceCommit:wd.town.placement?.sourceCommit,townCentre:wd.town.centre,playerSpawn:wd.playerSpawn,bounds:wd.bounds,reviewViewport:[v.canvasRect.width,v.canvasRect.height],camera:'review only; actual game renderer'};
      });
      assert.deepEqual(report.worldPlacement.townCentre,[62,22]);
      assert.deepEqual(report.worldPlacement.playerSpawn,[-132,80]);
      assert.deepEqual(report.worldPlacement.reviewViewport,[1480,1200]);
      await shot('16-original-beach-map-placement');
    }
  }
  assert.deepEqual(report.errors,[],'no runtime/asset/shader errors');
  report.passed=true;writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {if(!report.passed){writeFileSync(out+'report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}await browser?.close();try{process.kill(-server.pid)}catch{}}
