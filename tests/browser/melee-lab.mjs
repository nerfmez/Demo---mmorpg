// Focused attack phases using the real rig, blade trail and Vfx; no full-map video.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT=new URL('./out/melee-lab/',import.meta.url).pathname;mkdirSync(OUT,{recursive:true});
const server=spawn('npx',['vite','preview','--port','4188','--strictPort'],{stdio:'ignore',detached:true});let browser;
try{
  for(let i=0;;i++){try{if((await fetch('http://localhost:4188/lab.html')).ok)break;}catch{}
    if(i>60)throw Error('preview did not start');await new Promise(r=>setTimeout(r,300));}
  const engine=process.env.BROWSER==='webkit'?webkit:chromium;
  browser=await engine.launch(engine===chromium?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
  const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:4188/lab.html?skill=slash');await page.waitForFunction(()=>window.__lab);await page.waitForLoadState('networkidle');
  await page.evaluate(()=>{
    const L=window.__lab;L.state.paused=true;L.state.zoom=.4;L.state.comboMode=0;
    window.__cuts=[];window.__hits=[];
    const slash=L.vfx.slash.bind(L.vfx),hit=L.vfx.hitSpark.bind(L.vfx);
    L.vfx.slash=(e,w)=>{window.__cuts.push(e);slash(e,w);};L.vfx.hitSpark=e=>{window.__hits.push(e);hit(e);};
    L.preview('full');L.state.paused=true;
    if (L.tuning.get('slash').fx.cast.trailStart === 0 && !L.vfx.trail.on) throw Error('zero-delay blade trail must start immediately');
  });
  const shot=async name=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:OUT+name});};
  const tick=async n=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__lab.step(1/60);},n);
  await tick(9);assert.equal(await page.evaluate(()=>window.__hits.length),0,'no contact before authored hit time');await shot('windup.png');
  await tick(5);assert.equal(await page.evaluate(()=>window.__hits.length),1);await shot('contact.png');
  const sequence=[];
  await page.evaluate(()=>{const L=window.__lab;L.preview('full');L.state.paused=true;});
  for(let i=0;i<24;i++){await tick(2);const sample=await page.evaluate(()=>({contacts:window.__lab.vfx.contacts.count,trail:window.__lab.vfx.trail.mesh.visible,active:window.__lab.vfx.active.length}));sequence.push(sample);await shot('frame-'+String(i).padStart(3,'0')+'.png');}
  assert(sequence.some(s=>s.trail),'the real blade must leave a moving trail');
  assert(sequence.some(s=>s.contacts>0));assert.equal(sequence.at(-1).contacts,0);assert.equal(sequence.at(-1).active,0);
  const combo=[];
  for(let step=0;step<3;step++){
    await page.evaluate(step=>{const L=window.__lab;L.state.comboMode=step;L.preview('full');L.state.paused=true;},step);await tick(15);
    combo.push(await page.evaluate(()=>{const L=window.__lab,u=L.vfx.active.find(a=>a.obj.material?.uniforms?.uArc)?.obj.material.uniforms;
      return {reverse:u.uRev.value,width:u.uWidth.value,heavy:window.__hits.at(-1).heavy};}));await shot('combo-'+(step+1)+'.png');
  }
  assert.equal(combo[0].reverse,0);assert.equal(combo[1].reverse,1);assert(combo[2].width>combo[0].width);assert(combo[2].heavy);
  const miss=await page.evaluate(()=>{const L=window.__lab;L.view.dummy.position.x=-4;const before=window.__hits.length;L.preview('full');L.state.paused=true;for(let i=0;i<18;i++)L.step(1/60);return {hits:window.__hits.length-before,particles:L.vfx.contacts.count};});
  assert.equal(miss.hits,0);assert.equal(miss.particles,0);await shot('range-miss.png');
  const arcMiss=await page.evaluate(()=>{const L=window.__lab;L.view.dummy.position.set(1.5,0,0);const before=window.__hits.length;L.preview('full');L.state.paused=true;for(let i=0;i<18;i++)L.step(1/60);return window.__hits.length-before;});assert.equal(arcMiss,0);
  await page.evaluate(()=>window.__lab.view.dummy.position.set(-2,0,0));
  await page.getByRole('button',{name:'ปรับเอฟเฟกต์',exact:true}).click();
  const input=page.locator('input[type=number][data-field="fx.swing.width"]');await input.fill('.34');await input.press('Tab');await page.waitForTimeout(250);
  const tuned=await page.evaluate(()=>{const L=window.__lab;L.state.comboMode=0;L.preview('swing');L.state.paused=true;for(let i=0;i<15;i++)L.step(1/60);return {width:L.vfx.active.find(a=>a.obj.material?.uniforms?.uArc).obj.material.uniforms.uWidth.value,contacts:L.vfx.contacts.count};});
  assert.equal(tuned.width,.34);assert.equal(tuned.contacts,0);await page.locator('#panel').evaluate(n=>n.scrollTop=0);await shot('editor-swing.png');
  await page.getByRole('button',{name:'คืนค่าทั้งสกิล',exact:true}).click();
  await page.getByLabel('สกิลที่ปรับ',{exact:true}).selectOption('whirl_blade');
  const whirl=await page.evaluate(()=>{const L=window.__lab;L.preview('full');L.state.paused=true;for(let i=0;i<18;i++)L.step(1/60);return {cuts:L.vfx.active.filter(a=>a.obj.material?.uniforms?.uArc).length,hits:window.__hits.at(-1).skill};});
  assert.equal(whirl.cuts,2);assert.equal(whirl.hits,'whirl_blade');await shot('whirl.png');
  await page.getByLabel('สกิลที่ปรับ',{exact:true}).selectOption('slash');
  await page.setViewportSize({width:768,height:1024});
  await page.evaluate(()=>{const L=window.__lab;L.preview('impact');L.state.paused=true;L.step(1/60);});await shot('portrait-impact.png');
  const impact=await page.evaluate(()=>({active:window.__lab.vfx.active.length,contacts:window.__lab.vfx.contacts.count}));assert.equal(impact.active,0);assert(impact.contacts>0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const cancelled=await page.evaluate(()=>{const L=window.__lab;const before=window.__hits.length;L.preview('full');L.state.paused=true;L.step(1/60);L.clear();for(let i=0;i<30;i++)L.step(1/60);return {hits:window.__hits.length-before,contacts:L.vfx.contacts.count,trail:L.vfx.trail.mesh.visible};});
  assert.equal(cancelled.hits,0);assert.equal(cancelled.contacts,0);assert.equal(cancelled.trail,false);
  const probe=async cycles=>page.evaluate(async cycles=>{const L=window.__lab,paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    for(let i=0;i<cycles;i++){L.preview('full',false);L.state.paused=true;for(let j=0;j<16;j++)L.step(1/60);await paint();L.clear();await paint();}
    return L.stats().geometries;},cycles);
  const warm=await probe(1),repeated=await probe(8);assert.equal(repeated,warm);
  const report={ok:!errors.length,browser:process.env.BROWSER||'chromium',combo,miss,arcMiss,tuned,whirl,impact,cleanup:{warm,repeated},cancelled,sequence,errors};
  writeFileSync(OUT+'report.json',JSON.stringify(report,null,2));assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({ok:true,combo,cleanup:{warm,repeated},browser:report.browser}));
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
