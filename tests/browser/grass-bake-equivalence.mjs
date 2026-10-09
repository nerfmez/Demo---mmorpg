// Isolated real WebGL proof for the production grass bake, not an FPS benchmark.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4201','--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:4201/')).ok)break;}catch{}if(i>60)throw Error('dev server');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('http://127.0.0.1:4201/',r=>r.fulfill({contentType:'text/html',body:'<canvas id="proof"></canvas>'}));await page.goto('http://127.0.0.1:4201/');
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {data}=await import('/src/data.js'),{createWorld}=await import('/src/core/world.js');
  const {bakeGrassColours,bakeGrassSteps,attachGrassSurface,attachGrassSurfaceSteps,grassMaterial}=await import('/src/render/grass.js');
  const {releaseGroundCaches}=await import('/src/render/ground.js'),{disposeObject}=await import('/src/render/dispose.js');
  const {FrameBuildQueue}=await import('/src/render/build-queue.js');
  const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(64,64);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const rows=[];const maps=Object.values(data.maps);let memory;
  for(const entry of maps){
   const world=createWorld(entry),[x,z]=world.data.playerSpawn;
   const items=Array.from({length:773},(_,i)=>({x:x+(i%17)*.33,z:z+Math.floor(i/17)*.33,s:1}));
   const make=async sliced=>{
    const root=new THREE.Group(),meshes=[];root.position.set(.17,0,-.23);
    let offset=0;
    for(const count of [97,257,419]){
     const chunk=items.slice(offset,offset+count),g=new THREE.PlaneGeometry(.2,.6),m=grassMaterial(world),mesh=new THREE.InstancedMesh(g,m,count);
     mesh.position.set(offset*.0001,0,-offset*.0001);root.add(mesh);meshes.push(mesh);
     for(let i=0;i<count;i++)mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(chunk[i].x,world.groundY(chunk[i].x,chunk[i].z),chunk[i].z));
     if(sliced){const q=new FrameBuildQueue();await q.enqueue(attachGrassSurfaceSteps(mesh,chunk,world)).promise;}else attachGrassSurface(mesh,chunk,world);
     g.dispose();offset+=count;
    }
    return {root,meshes};
   };
   const sync=await make(false),asyncBake=await make(true);
   let inputDifferences=0;for(let m=0;m<sync.meshes.length;m++)for(const k of Object.keys(sync.meshes[m].geometry.attributes)){const a=sync.meshes[m].geometry.attributes[k].array,b=asyncBake.meshes[m].geometry.attributes[k].array;for(let i=0;i<a.length;i++)if(a[i]!==b[i])inputDifferences++;}
   bakeGrassColours(renderer,sync.root,world);const q=new FrameBuildQueue();await q.enqueue(bakeGrassSteps(renderer,asyncBake.root,world,{asyncReadback:true})).promise;
   let colourDifferences=0;for(let m=0;m<sync.meshes.length;m++)for(const k of ['aGrassBase','aGrassLawn']){const a=sync.meshes[m].geometry.attributes[k].array,b=asyncBake.meshes[m].geometry.attributes[k].array;for(let i=0;i<a.length;i++)if(a[i]!==b[i])colourDifferences++;}
   // These attributes feed the identical High blade shader. Compare its actual
   // framebuffer too with a fixed camera/time, avoiding screenshots as a proxy.
   const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x666666,2));const camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,40);camera.position.set(x+2,world.groundY(x,z)+8,z+2);camera.lookAt(x+2,world.groundY(x,z),z+2);
   const target=new THREE.WebGLRenderTarget(64,64),pixels=new Uint8Array(64*64*4),frames=[];
   for(const fixture of [sync,asyncBake]){scene.add(fixture.root);renderer.setRenderTarget(target);renderer.setClearColor(0x345678,1);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);frames.push(pixels.slice());scene.remove(fixture.root);}
   let framebufferDifferences=0;for(let i=0;i<pixels.length;i++)if(frames[0][i]!==frames[1][i])framebufferDifferences++;
   rows.push({map:world.data.id,chunks:sync.meshes.length,clumps:items.length,inputDifferences,colourDifferences,framebufferDifferences,queue:q.stats});
   renderer.setRenderTarget(null);target.dispose();disposeObject(sync.root);disposeObject(asyncBake.root);releaseGroundCaches(world);memory={...renderer.info.memory};
  }
  renderer.dispose();return {rows,memory};
 });
 assert.deepEqual(errors,[]);for(const row of result.rows){assert.equal(row.inputDifferences,0);assert.equal(row.colourDifferences,0);assert.equal(row.framebufferDifferences,0);}console.log(JSON.stringify(result));
}finally{await browser?.close();server.kill();}
