// Town exterior owner review: buildings, timber, boats and town ground from the game camera.
// Same frozen seed/clock as ground-surfaces.mjs. Usage: npm run build && TOWN_OUT=dir/ node tests/browser/town-art.mjs
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.TOWN_OUT||'tests/browser/out/town/';mkdirSync(out,{recursive:true});
const report={captures:[],errors:[]},base='http://localhost:4196/';let browser;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4196','--strictPort'],{stdio:'ignore',detached:true});
try{
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>80)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await (await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:1})).newPage();
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__freeze)cb(t)});});
  page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(base+'?fresh=1&seed=9&quality=medium');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:90000});
  await page.evaluate(()=>{window.__freeze=true;const f=window.__frontier;f.paused=true;f.input.disabled=true;f.game.time=12;
    document.querySelector('.banner')?.remove();for(const s of ['#hud','.hud','#ui'])document.querySelectorAll(s).forEach(e=>e.style.opacity=0);});
  const scenes=[['01-homes',24,21,1.25],['02-fish-hall',49,27.5,1.25],['03-warehouses',139,-13,1.4],['04-shipyard-hull',136,90,1.4],['05-boats',43,47,1.25],['06-inn-street',98,-6,1.25],['07-gable-row',20,6.5,1.25],['08-overview',60,14,2.1],['09-overview-west',28,12,2.1]];
  for(const [name,x,z,zoom] of scenes){
    const state=await page.evaluate(([x,z,zoom])=>{
      const f=window.__frontier,g=f.game,v=f.view;Object.assign(g.player,g.freeSpotNear(x,z));g.player.facing=2.8;
      v.zoom=zoom;v.camera.up.set(0,1,0);v.snapCamera();for(let i=0;i<3;i++)v.render(0,12,{});
      return {x:g.player.x,z:g.player.z,calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
    },[x,z,zoom]);
    await page.screenshot({path:out+name+'.png',timeout:60000});report.captures.push({name,...state});console.log('CAPTURE',name,JSON.stringify(state));
  }
  assert.deepEqual(report.errors,[]);report.ok=true;console.log('PASS TOWN ART');
}finally{writeFileSync(out+'report.json',JSON.stringify(report,null,2));await browser?.close();try{process.kill(-server.pid);}catch{}}
