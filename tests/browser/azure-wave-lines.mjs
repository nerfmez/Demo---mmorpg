// Focused anime crest review with the production camera/HUD. Optional BEFORE_ROOT
// captures an isolated built revision at the identical camera, seed and clock.
// Sampled animation time is evidence of motion, not measured hardware FPS.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out=resolve('tests/browser/out/azure-wave-lines');mkdirSync(out,{recursive:true});
const servers=[],pages=[],report={errors:[],captures:[],hardwareIPadFPS:'not measured',baselineSource:process.env.BASELINE_SHA||null,reviewParent:process.env.REVIEW_PARENT||null,cachedBaseline:process.env.CACHED_BASELINE||null};
let browser;
try {
  browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const [revision,root,port] of [...(process.env.BEFORE_ROOT?[['before',resolve(process.env.BEFORE_ROOT),4192]]:[]),['after',process.cwd(),4193]]){
    const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore',detached:true});servers.push(server);
    const url=`http://localhost:${port}/`;
    for(let i=0;;i++){try{if((await fetch(url)).ok)break;}catch{}if(i>60)throw Error('preview startup');await new Promise(r=>setTimeout(r,250));}
    const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,deviceScaleFactor:1});
    const page=await ctx.newPage();
    await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__azureFreeze)cb(t)});});
    page.on('pageerror',e=>report.errors.push(`${revision}: ${e}`));
    page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))report.errors.push(`${revision}: ${m.text()}`);});
    page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`${revision}: HTTP ${r.status()} ${r.url()}`);});
    // Model readiness below is the real gate. Do not wait for the page-wide
    // load event while software WebGL is compiling the scene's shaders.
    await page.goto(url+'?fresh=1&seed=9&quality=medium',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:60000});
    await page.evaluate(()=>{window.__azureFreeze=true;const f=window.__frontier;f.paused=true;f.input.reset();f.input.disabled=true;document.querySelector('.banner')?.remove();});
    if(revision==='after')report.portCrest=await page.evaluate(()=>{const f=window.__frontier,m=f.view.scene.children.flatMap(o=>o.children||[]).find(o=>o.name==='sea-swash').material;return {style:m.userData.waterStyle,settings:m.uniforms.uCrest.value.toArray()};});
    pages.push({page,revision});
  }
  const stage=async(page,x,z,time)=>page.evaluate(([x,z,time])=>{
    const f=window.__frontier;Object.assign(f.game.player,f.game.freeSpotNear(x,z));f.game.time=time;
    f.view.zoom=1;f.view.camera.up.set(0,1,0);f.view.snapCamera();f.view.render(1/60,time,{});f.hud.update(.6,f.panels);
    return {player:[f.game.player.x,f.game.player.z],camera:f.view.camera.matrixWorld.elements.slice()};
  },[x,z,time]);
  for(const [name,x,z] of [['pier',-23.2,-5.2],['beach',-151,99.3]]){
    let reference;
    for(const {page,revision} of pages){
      const frame=await stage(page,x,z,30);
      if(reference)assert.deepEqual(frame,reference,'matched player/camera');else reference=frame;
      await page.screenshot({path:`${out}/${name}-${revision}.png`,timeout:60000});
      report.captures.push(`${name}-${revision}.png`);
    }
    console.log(pages.length>1?'matched static':'captured static',name);
    if(process.env.WAVE_SEQUENCE==='1'&&name==='pier'){
      // One full port-crest period. Six clock samples/sec keep the review short.
      const frames=45,sampledFPS=6;
      for(const {page,revision} of pages){
        const dir=`${out}/${name}-${revision}`;mkdirSync(dir,{recursive:true});
        for(let i=0;i<frames;i++){
          await stage(page,x,z,30+i/sampledFPS);
          await page.screenshot({path:`${dir}/${String(i).padStart(3,'0')}.png`,timeout:60000});
          if(i%15===0)console.log(name,revision,'frame',i,frames);
        }
      }
      report[name]={frames,sampledFPS,duration:frames/sampledFPS};
    }
  }
  assert.deepEqual(report.errors,[],'no asset/runtime/shader errors');report.passed=true;
} finally {
  writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  await browser?.close();for(const s of servers)try{process.kill(-s.pid)}catch{}
}
