// Focused real-GPU ownership probe; no combat stress or quality downgrade.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const out=process.env.UI_OUT||'work/landmark-review/resources';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1180,height:820}});
page.setDefaultTimeout(180000);
try{
 await page.goto((process.env.UI_ORIGIN||'http://127.0.0.1:4177')+'/?fresh=1&quality=high&seed=9&stream=0');
 await page.waitForFunction(()=>window.__frontier?.modelsReady&&document.querySelector('#loading').classList.contains('done'));
 const result=await page.evaluate(async()=>{
  const f=__frontier,v=f.view;f.paused=true;v.render=()=>{};
  // Finish the normal initial frame's asynchronous hero/monster/portrait work
  // before attributing buffers to this landmark-only owner.
  await v.cityReady;await v.readyModels;
  await new Promise(resolve=>setTimeout(resolve,1500));
  const {loadLandmarkAssets}=await import('/src/render/landmark-assets.js');
  const original=f.game.world.landmarks.find(l=>l.kind==='cliff_shrine');
  const x=f.game.player.x,z=f.game.player.z-6,dx=x-original.x,dz=z-original.z;
  const lm={...original,x,z,parts:original.parts.map(p=>({...p,x:p.x+dx,z:p.z+dz}))};
  const world={landmarks:[lm],groundY:f.game.world.groundY.bind(f.game.world)};
  // Borrow the game's context, lights and camera, but render only this owner's
  // meshes so unrelated lazily-uploaded scenery cannot contaminate the samples.
  const scene=v.scene.clone(false);for(const o of v.scene.children)if(o.isLight)scene.add(o.clone());
  const draw=()=>{v.renderer.render(scene,v.camera);v.renderer.getContext().finish();};
  const samples=[];
  for(let i=0;i<3;i++){
   const asset=await loadLandmarkAssets(world);scene.add(asset.root);draw();
   const loaded={...v.renderer.info.memory};scene.remove(asset.root);asset.dispose();asset.dispose();draw();
   samples.push({loaded,disposed:{...v.renderer.info.memory}});
  }
  return {quality:v.quality,model:'cliff_shrine.glb',warmup:1,cycles:2,samples};
 });
 await fs.writeFile(out+'/report.json',JSON.stringify(result,null,2));
 assert.equal(result.quality,'high');
 for(const s of result.samples)assert.ok(s.loaded.geometries>s.disposed.geometries,'authored buffers uploaded and released');
 assert.deepEqual(result.samples[2].disposed,result.samples[1].disposed);
 await fs.writeFile(out+'/report.json',JSON.stringify(result,null,2));console.log('PASS landmark GPU geometry/texture counts stabilize after disposal',result);
}finally{await browser.close();}
