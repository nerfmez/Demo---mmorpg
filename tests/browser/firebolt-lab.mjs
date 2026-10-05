// Focused Firebolt review and resource probe in Skill Lab, not the full map.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT=new URL('./out/firebolt-lab/',import.meta.url).pathname;
mkdirSync(OUT,{recursive:true});
const server=spawn('npx',['vite','preview','--port','4186','--strictPort'],{stdio:'ignore',detached:true});
let browser;
try {
  for(let i=0;;i++){
    try { if((await fetch('http://localhost:4186/lab.html')).ok)break; }catch{}
    if(i>60)throw new Error('preview server did not start');
    await new Promise(r=>setTimeout(r,300));
  }
  const engine=process.env.BROWSER==='webkit'?webkit:chromium;
  browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  const page=await browser.newPage({viewport:{width:1000,height:750}});
  const screenshot=async(name)=>{
    // WebKit may return the previous composited WebGL frame without this barrier.
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:`${OUT}${name}`});
  };
  const errors=[];page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`HTTP ${r.status()} ${r.url()}`)});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});
  await page.goto('http://localhost:4186/lab.html?skill=firebolt');
  await page.waitForFunction(()=>window.__lab);
  await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{
    const L=window.__lab;L.state.paused=true;L.state.zoom=0.4;L.state.speed=1;
    window.__impacts=0;const impact=L.vfx.impact.bind(L.vfx);
    L.vfx.impact=e=>{window.__impacts++;impact(e);};
    L.cast();
  });
  const sample=[];
  for(let i=0;i<66;i++){
    await page.evaluate(()=>{window.__lab.step(1/60);window.__lab.step(1/60);});
    await screenshot(`frame-${String(i).padStart(3,'0')}.png`);
    sample.push(await page.evaluate(()=>{
      const L=window.__lab;let smoke=0;
      for(let k=0;k<L.vfx.flames.count;k++)if(L.vfx.flames.info[k*4+2]>1.5)smoke++;
      return {cast:!!L.vfx.castFlame,projectiles:L.vfx.projectiles.size,particles:L.vfx.flames.count,active:L.vfx.active.length,smoke,hits:window.__impacts};
    }));
  }
  assert(sample.some(s=>s.cast),'charge phase never appeared');
  assert(sample.some(s=>s.projectiles>0),'projectile never appeared');
  assert.equal(sample.at(-1).hits,1,'single shot must impact once');
  assert.equal(sample.at(-1).particles,0,'legacy particles should finish');
  assert.equal(sample.at(-1).active,0,'V5 contact flakes and wake should finish');
  assert(sample.every(s=>s.smoke===0),'Firebolt impact must not emit smoke');
  // Warm up once, then compare two batches after expiry and an actual GPU render.
  const drain=async(count,options={})=>{
    await page.evaluate(({count,options})=>{
      const L=window.__lab;Object.assign(L.state,options);
      for(let i=0;i<count;i++){L.cast();for(let f=0;f<120;f++)L.step(1/60);}
    },{count,options});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    return page.evaluate(()=>({geometries:window.__lab.stats().geometries,casts:!!window.__lab.vfx.castFlame,projectiles:window.__lab.vfx.projectiles.size,particles:window.__lab.vfx.flames.count,active:window.__lab.vfx.active.length}));
  };
  const warm=await drain(6), repeated=await drain(12);
  assert.equal(repeated.geometries,warm.geometries,'GPU geometry count must plateau');
  for(const s of [warm,repeated]){
    assert.equal(s.casts,false);assert.equal(s.projectiles,0);assert.equal(s.particles,0);assert.equal(s.active,0);
  }
  // Reference contrast check: the same rendered effect against the Lab's dark floor.
  await page.getByRole('button',{name:'⚙ ตั้งค่า',exact:true}).click();
  await page.getByRole('button',{name:'มืด',exact:true}).click();
  await page.getByRole('button',{name:'▾ ซ่อน',exact:true}).click();
  await page.evaluate(()=>{window.__lab.cast();for(let i=0;i<10;i++)window.__lab.step(1/60);});
  await screenshot('dark-charge.png');
  await page.evaluate(()=>{for(let i=0;i<24;i++)window.__lab.step(1/60);});
  await screenshot('dark-travel.png');
  await page.evaluate(()=>{for(let i=0;i<12;i++)window.__lab.step(1/60);});
  await screenshot('dark-impact.png');
  await page.evaluate(()=>{for(let i=0;i<12;i++)window.__lab.step(1/60);});
  await screenshot('dark-sparks.png');
  const sparks=await page.evaluate(()=>{
    const f=window.__lab.vfx.flames;let count=0;
    for(let i=0;i<f.count;i++)if(f.info[i*4+2]===1)count++;
    return {embers:count,active:window.__lab.vfx.active.length,v5:window.__lab.vfx.active.some(a=>a.obj.userData.v5)};
  });
  assert(sparks.v5 || sparks.embers>0,'warm flakes should remain after compression');
  if(!sparks.v5)assert.equal(sparks.active,0,'legacy contact flash should expire');
  await page.evaluate(()=>{for(let i=0;i<120;i++)window.__lab.step(1/60);});
  await page.getByRole('button',{name:'⚙ ตั้งค่า',exact:true}).click();
  await page.getByRole('button',{name:'ทราย',exact:true}).click();
  await page.getByRole('button',{name:'▾ ซ่อน',exact:true}).click();
  await drain(1,{count:5,weapon:'none'});
  await screenshot('split-expired.png');
  // Converted element takes the normal element renderer and does not retain fire.
  await page.evaluate(()=>{
    const L=window.__lab;L.state.count=1;L.state.element='cold';L.cast();
    for(let i=0;i<19;i++)L.step(1/60);
    if(L.vfx.castFlame || L.vfx.flames.count)throw new Error('cold conversion retained fire');
    const pr=[...L.vfx.projectiles.values()][0];
    if(pr?.children.length!==2)throw new Error('cold projectile did not use element sprites');
  });
  await screenshot('cold-conversion.png');
  const report={browser:process.env.BROWSER||'chromium',warm,repeated,errors,sample};
  writeFileSync(`${OUT}report.json`,JSON.stringify(report,null,2));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({ok:true,browser:report.browser,warm,repeated}));
}finally{
  await browser?.close();try{process.kill(-server.pid);}catch{}
}
