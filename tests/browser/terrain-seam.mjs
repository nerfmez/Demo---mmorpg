// Built-game seam regression at the actual touch camera, medium shadows/post.
// Run after build with a production preview at SEAM_URL (default localhost:4177).
// Fixed-time stills and geometry probes are not normal-speed or iPad testing.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.SEAM_OUT||`tests/browser/out/terrain-seam-${process.env.BROWSER||'chromium'}`;mkdirSync(out,{recursive:true});
const report={source:process.env.SEAM_SOURCE||null,captures:[],errors:[]};
const engine=process.env.BROWSER==='webkit'?webkit:chromium;const browser=await engine.launch({executablePath:process.env.BROWSER_EXECUTABLE,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await(await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true})).newPage();
 await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__seamFreeze)cb(t);});});
 page.on('pageerror',e=>report.errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))report.errors.push(m.text());});
 await page.goto((process.env.SEAM_URL||'http://localhost:4177/')+'?fresh=1&seed=9&quality=medium&map=frontier-wilds-v1&streamBudget=100');
 await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.game.time>.3&&document.getElementById('loading').classList.contains('done'),null,{timeout:120000});
 await page.evaluate(()=>{window.__seamFreeze=true;const f=__frontier;f.paused=true;f.input.disabled=true;f.input.reset();document.querySelector('.banner')?.remove();f.__placeGlobal=(x,z)=>{const [ox,oz]=f.world.data.atlas.offset;Object.assign(f.game.player,{x:x-ox,z:z-oz});f.view.snapCamera();};f.__draw=()=>{for(const m of f.view.monsterViews.values())m.spawnT=1;f.view.render(0,12,{});f.hud.update(.6,f.panels);};});
 await page.evaluate(async()=>{const f=__frontier,v=f.view;f.__placeGlobal(-175,-200);f.__draw();for(let i=0;i<5000&&v.neighbours.get('azure-harbor-v1')?.region?.importedState!=='imported-ready';i++){v.buildQueue.budgetMs=100;v.buildQueue.drain();await new Promise(r=>setTimeout(r,0));}if(v.neighbours.get('azure-harbor-v1')?.region?.importedState!=='imported-ready')throw Error('Azure import not ready');});
 for(const[name,x,z]of[['01-north-gap',-162,-200],['02-skirt-end',-162,-165],['03-skirt-face',-162,-140],['04-gate',-166,-92],['05-coast',-166,80]]){
  const result=await page.evaluate(([name,x,z])=>{const f=__frontier,v=f.view;f.__placeGlobal(x,z);f.__draw();f.__draw();v.scene.updateMatrixWorld(true);const V=v.camera.position.constructor,R=v.raycaster.constructor,offset=f.world.data.atlas.offset;const regions=[v.region,...[...v.neighbours.values()].map(n=>n.region).filter(Boolean)];const samples=[];
   for(const gx of[-175.25,-160.01,-159.99,-150.25,-130.25])for(const gz of[-200.25,-170.25,-160.01,-159.99,-150.25,-140.25,-120.25,0.25,80.25,115.25,155.01,160.25]){const rc=new R(new V(gx-offset[0],200,gz-offset[1]),new V(0,-1,0));const hits=regions.flatMap(r=>rc.intersectObject(r.terrain.group,true).map(h=>({map:r.world.data.id,y:h.point.y,object:h.object.uuid})));samples.push({x:gx,z:gz,hits});}
   return{name,global:{x,z},local:{x:f.game.player.x,z:f.game.player.z},map:f.world.data.id,regions:regions.map(r=>({id:r.world.data.id,shift:r.root.position.toArray(),bounds:r.world.bounds})),samples,lost:v.renderer.getContext().isContextLost(),glError:v.renderer.getContext().getError(),target:!!v.renderer.getRenderTarget(),textures:v.renderer.info.memory.textures,geometries:v.renderer.info.memory.geometries};},[name,x,z]);
  report.captures.push(result);assert.equal(result.lost,false);assert.equal(result.glError,0);assert.equal(result.target,false);for(const point of result.samples){assert.ok(point.hits.length,`terrain missing at ${point.x},${point.z}`);assert.equal(new Set(point.hits.map(h=>h.map)).size,1,'terrain has one owner');}assert.deepEqual(report.errors,[]);await page.screenshot({path:out+'/'+name+'.png'});console.log(JSON.stringify({name,...result.global,holes:result.samples.filter(p=>!p.hits.length).map(({x,z})=>[x,z]),lost:result.lost,glError:result.glError}));
 }
 report.ok=report.errors.length===0;
}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
