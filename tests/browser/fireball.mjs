// Focused real-game Firebolt capture and GPU geometry stability probe.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT=new URL('./out/fireball/',import.meta.url).pathname;
mkdirSync(OUT,{recursive:true});
const port=4194;
const server=spawn('npx',['vite','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;
try {
  for(let i=0;;i++) {
    try { if((await fetch(`http://localhost:${port}`)).ok)break; } catch {}
    if(i>100)throw Error('preview did not start');
    await new Promise(r=>setTimeout(r,200));
  }
  const name=process.env.BROWSER==='webkit'?'webkit':'chromium';
  const engine=name==='webkit'?webkit:chromium;
  browser=await engine.launch({args:name==='chromium'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true,deviceScaleFactor:1});
  page.setDefaultTimeout(90000);
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
  await page.goto(`http://localhost:${port}/?fresh=1&kit=staff&seed=9&quality=low`);
  await page.waitForFunction(()=>window.__frontier?.game?.time>0.3);
  const setup=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game,p=g.player;
    f.paused=true;f.input.disabled=true;
    window.requestAnimationFrame=()=>0; // stop background rendering; frames below advance real game deterministically
    const m=g.monsters.find(m=>!m.dead&&!m.boss&&m.type==='salt_slime')||g.monsters.find(m=>!m.dead&&!m.boss);
    if(!m)throw Error('no target');
    const spot=g.freeSpotNear(m.x-6,m.z+0.5);
    p.x=spot.x;p.z=spot.z;p.hp=p.maxHp;p.mp=p.maxMp;
    g.monsters=[m];m.hp=m.maxHp=1000000;
    g.ch.stats.INT=30;g.ch.skills.firebolt=1;g.ch.slots[0]={skill:'firebolt',mods:[]};g.refresh();
    f.view.zoom=0.55;f.view.snapCamera();
    f.captureTarget={x:m.x,z:m.z,id:m.id};
    f.captureHits=0;f.captureTime=0;
    return {player:[p.x,p.z],target:[m.x,m.z],type:m.type,skill:g.skills[0].id};
  });
  await page.waitForTimeout(150);
  const step=async (steps)=>page.evaluate(steps=>{
    const f=window.__frontier,g=f.game,m=g.monsters[0];
    for(let i=0;i<steps;i++) {
      m.x=f.captureTarget.x;m.z=f.captureTarget.z;m.state='idle';m.windup=null;m.stateT=0;
      g.update(1/60);f.captureTime+=1/60;
      for(const e of g.drainEvents()){ if(e.type==='impact'&&e.kind==='firebolt')f.captureHits++;f.view.handleEvent(e); }
      f.view.render(1/60,f.captureTime);
    }
    return {hits:f.captureHits,projectiles:g.projectiles.length,charge:!!f.view.vfx.fireCharge};
  },steps);
  await step(30); // let pooled target rig grow to normal size
  await page.evaluate(()=>{
    const f=window.__frontier,g=f.game;
    g.player.mp=g.player.maxMp;g.player.cooldowns.fill(0);
    if(!g.castSlot(0,f.captureTarget))throw Error('cast failed');
    for(const e of g.drainEvents())f.view.handleEvent(e);
    f.view.render(0,f.captureTime);
  });
  let result;
  for(let i=0;i<36;i++) {
    result=await step(3);
    await page.screenshot({path:`${OUT}${name}-${String(i).padStart(2,'0')}.png`,timeout:90000});
  }
  assert.ok(result.hits>0,'real Firebolt reaches target');
  assert.equal(result.charge,false,'charge releases after cast');
  const probe=await page.evaluate(()=>{
    const f=window.__frontier,v=f.view.vfx,g=f.game;
    const samples=[];
    for(let batch=0;batch<3;batch++) {
      for(let i=0;i<12;i++) {
        const p={id:99000+i,kind:'firebolt',owner:'player',element:'fire',x:g.player.x,z:g.player.z,y:1.05,vx:10,vz:0,speed:10};
        v.syncProjectiles({player:{cast:null},projectiles:[p]},1/60,i);
        v.impact({kind:'firebolt',element:'fire',x:p.x+3,z:p.z});
        f.view.renderer.render(f.view.scene,f.view.camera);
        v.syncProjectiles({player:{cast:null},projectiles:[]},1/60,i);
        v.update(1);
        f.view.renderer.render(f.view.scene,f.view.camera);
      }
      samples.push(f.view.renderer.info.memory.geometries);
    }
    return {samples,active:v.active.length,projectiles:v.projectiles.size};
  });
  assert.equal(probe.samples[2],probe.samples[1],'GPU geometry count stabilises after warm-up');
  assert.equal(probe.projectiles,0,'projectile cleanup');
  assert.equal(probe.active,0,'impact cleanup');
  assert.deepEqual(errors,[],'no shader/runtime errors');
  const report={browser:name,setup,result,probe,errors};
  writeFileSync(`${OUT}${name}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {
  await browser?.close();try{process.kill(-server.pid);}catch{}
}
