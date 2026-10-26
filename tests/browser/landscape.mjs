// Focused production-build landscape review. Native touch input and actual 40-degree frames.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {enterFullscreenGate} from './fullscreen-entry.mjs';

const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=process.env.LANDSCAPE_OUT||'tests/browser/out/landscape';mkdirSync(out,{recursive:true});
const base=process.env.LANDSCAPE_URL||'http://127.0.0.1:4310/';
const server=process.env.LANDSCAPE_URL?null:spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4310','--strictPort','--host','127.0.0.1'],{stdio:'ignore',cwd:process.env.LANDSCAPE_ROOT||process.cwd()});
const report={browser:engine.name(),base,captures:[],errors:[],physicalDeviceFPS:'not measured; software GL'};
const startup=()=>{const f=window.__frontier,v=f?.view;return {modelsReady:f?.modelsReady,worldPrepared:v?.worldPrepared,dependencies:v?.startupDependencies,jobs:v?.buildQueue.jobs.map(j=>[j.label,j.state]),regions:[...(v?.regions||[])].map(([id,r])=>({id,imported:r.importedState,grassReady:r.grassReady,error:String(r.error||r.grassError||'')}))};};
let browser,page;
try{
  for(let i=0;server;i++){
    try{if((await fetch(base)).ok)break;}catch{}
    if(i>80)throw Error('preview server unavailable');await new Promise(r=>setTimeout(r,250));
  }
  browser=await engine.launch({...(engine===chromium&&process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',...JSON.parse(process.env.CHROMIUM_EXTRA_ARGS||'[]')]:[]});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push('HTTP '+r.status()+' '+r.url());});
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,2000));});
  const started=Date.now();await page.goto(base+'?fresh=1&seed=9&quality=high&dynres=0');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.view?.worldPrepared&&document.querySelector('#loading')?.classList.contains('done'),null,{timeout:240000});
  report.startup={elapsedMs:Date.now()-started,...await page.evaluate(startup)};
  await enterFullscreenGate(page);
  await page.evaluate(()=>{
    const f=__frontier;f.paused=true;f.input.disabled=true;
    f.game.ch.opening.stage='done';f.questRoute?.hide?.();
    // Keep the real frame/input loop alive; only suppress redundant software-GL draws between captures.
    f.__landscapeRender=f.view.render.bind(f.view);
    f.view.render=(...args)=>{if(!window.__landscapeFreeze)return f.__landscapeRender(...args);};
    window.__landscapeFreeze=true;
  });
  const stage=async(name,id,x,z,zoom=1)=>{
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(()=>__frontier.__landscapeRender(0,1,{}));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const stats=await page.evaluate(([id,x,z,zoom])=>{
      const f=__frontier,g=f.game,v=f.view,[sx,sz]=g.scenePoint(id,x,z);
      Object.assign(g.player,g.freeSpotNear(sx,sz));g.player.hp=g.derived.maxHp;
      g.activateRegion(id);v.switchRegion(id);v.zoom=zoom;v.heroY=g.world.groundY(g.player.x,g.player.z);v.snapCamera();
      f.hud.update(.5,f.panels);v.renderer.info.autoReset=false;v.renderer.info.reset();
      f.__landscapeRender(0,1,{});
      const info=v.renderer.info;
      const result={position:[g.player.x,g.player.z],camera:v.camera.position.toArray(),calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures};
      info.autoReset=true;return result;
    },[id,x,z,zoom]);
    await page.screenshot({path:out+'/'+name+'.png',timeout:90000});report.captures.push({name,region:id,native:[x,z],zoom,...stats});
    console.log('captured '+name);
  };
  const locations=[
    ['beach','azure-harbor-v1',-125,60],['forest','frontier-wilds-v1',89,-65],['ruins','frontier-wilds-v1',-194,-5],
    ['highlands','frontier-wilds-v1',-145,-95],['wetland','frontier-wilds-v1',-92,3],['moonroot','moonroot-grove-v1',-13,-29],
    ['fern','moonroot-grove-v1',110,-28],['headland','azure-harbor-v1',177,-65],
  ].filter(p=>!process.env.LANDSCAPE_LOCATIONS||process.env.LANDSCAPE_LOCATIONS.split(',').includes(p[0]));
  await page.setViewportSize({width:1194,height:834});
  for(const[name,id,x,z]of locations){await stage(name+'-normal',id,x,z);if(['beach','forest','ruins'].includes(name))await stage(name+'-wide',id,x,z,1.45);}
  if(!process.env.LANDSCAPE_CAPTURE_ONLY){
    await stage('forest-rear-visibility','frontier-wilds-v1',100,-84);
    await stage('forest-touch-start','frontier-wilds-v1',80,-70.4);
    const before=await page.evaluate(()=>{const f=__frontier;f.paused=false;f.input.disabled=false;return[f.game.player.x,f.game.player.z];});
    const rect=await page.locator('.joyzone').boundingBox().catch(()=>null)||await page.locator('.joy').boundingBox();
    const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
    if(engine===chromium){
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:7}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+rect.width*.3,y,id:7}]});
      await page.waitForFunction(([x,z])=>Math.hypot(__frontier.game.player.x-x,__frontier.game.player.z-z)>.3,before,{timeout:10000});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    }else{
      await page.evaluate(({x,y,width})=>{const el=__frontier.input.joyZone;for(const[type,px]of[['pointerdown',x],['pointermove',x+width*.3]])el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,pointerType:'touch',clientX:px,clientY:y}));},{x,y,width:rect.width});
      await page.waitForFunction(([x,z])=>Math.hypot(__frontier.game.player.x-x,__frontier.game.player.z-z)>.3,before,{timeout:10000});
      await page.evaluate(()=>__frontier.input.joyZone.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,pointerType:'touch'})));
    }
    report.touch=await page.evaluate(before=>{const f=__frontier;f.input.update();f.paused=true;f.input.disabled=true;return{distance:Math.hypot(f.game.player.x-before[0],f.game.player.z-before[1]),released:Math.hypot(f.game.input.moveX,f.game.input.moveZ)===0};},before);
    assert.ok(report.touch.distance>.3&&report.touch.released,'touch moves and releases');
    for(const[label,width,height]of[['phone',844,390],['portrait',834,1194],['desktop',1440,900]]){
      await page.setViewportSize({width,height});await stage(label+'-forest','frontier-wilds-v1',89,-65);
    }
  }
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){
  report.status='failed';report.failure=error.stack;report.runtime=await page?.evaluate(startup).catch(()=>null);
  await page?.screenshot({path:out+'/failure.png',timeout:30000}).catch(()=>{});throw error;
}finally{
  writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser?.close();server?.kill();
}
