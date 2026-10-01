// Fixed-scene frame cost, timed through to GPU completion (one-pixel readback after each render).
// SwiftShader runs the GPU work on the CPU, so this ranks shader/fill/draw-call costs; it is a
// relative before/after measure, not iPad FPS. Usage: npm run build && node tests/browser/gpu-bench.mjs
// BENCH_SPLIT=1 also reports the share of grass, terrain, water and shadows per scene.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=4201,base=`http://localhost:${port}/`,frames=+(process.env.BENCH_FRAMES||12);
const quality=process.env.BENCH_QUALITY||'medium',split=process.env.BENCH_SPLIT==='1',scale=+(process.env.BENCH_SCALE||1);
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;
try{
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>80)throw Error('preview');await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await (await browser.newContext({viewport:{width:1180,height:820},deviceScaleFactor:2})).newPage();
  const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__freeze)cb(t)});});
  await page.goto(base+`?fresh=1&seed=9&quality=${quality}`);
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:120000});
  await page.evaluate(()=>{window.__freeze=true;const f=window.__frontier;f.paused=true;f.input.disabled=true;document.querySelector('.banner')?.remove();});
  const scenes=[['glade',-110,8],['town',40,15],['market',60,22],['beach',-132,80],['harbour',43,47],['forest',-100,-70]];
  const only=(process.env.BENCH_SCENES||'').split(',').filter(Boolean);
  const results=[];
  for(const [name,x,z] of scenes.filter(s=>!only.length||only.includes(s[0]))){
    const r=await page.evaluate(async([x,z,frames,split,scale])=>{
      const f=window.__frontier,g=f.game,v=f.view,gl=v.renderer.getContext(),px=new Uint8Array(4);
      Object.assign(g.player,g.freeSpotNear(x,z));v.zoom=1;v.snapCamera();
      if(scale!==1)v.setRenderScale(scale);
      const time=()=>{const a=[];for(let i=0;i<frames;i++){const t0=performance.now();v.render(1/60,12+i/60,{});gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);a.push(performance.now()-t0);}a.sort((p,q)=>p-q);return a[Math.floor(a.length/2)];};
      for(let i=0;i<3;i++)v.render(1/60,12,{});
      // CPU side only: scene traversal, culling, uniform upload and draw submission
      const cpu=[];for(let i=0;i<frames;i++){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const t0=performance.now();v.render(1/60,12+i/60,{});cpu.push(performance.now()-t0);}cpu.sort((p,q)=>p-q);
      const out={ms:time(),cpuMs:+cpu[Math.floor(cpu.length/2)].toFixed(2),calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
      if(split){
        const groups={grass:[],terrain:[],water:[]};
        v.scene.traverse(o=>{if(o.name==='ground-blended-grass')groups.grass.push(o);else if(o.name==='terrain')groups.terrain.push(o);else if(o.name==='sea-swash'||o.userData.water)groups.water.push(o);});
        for(const [k,list] of Object.entries(groups)){list.forEach(o=>o.visible=false);out['-'+k]=time();list.forEach(o=>o.visible=true);}
        const s=v.renderer.shadowMap.enabled;v.renderer.shadowMap.enabled=false;out['-shadow']=time();v.renderer.shadowMap.enabled=s;
      }
      return out;
    },[x,z,frames,split,scale]);
    results.push({name,...r});console.log(name,JSON.stringify(r));
  }
  const total=results.reduce((s,r)=>s+r.ms,0);
  console.log('TOTAL_MS',total.toFixed(1),'quality',quality);
  if(errors.length)throw Error('render errors (a shader may not have compiled, making timings invalid): '+errors.join(' | '));
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
