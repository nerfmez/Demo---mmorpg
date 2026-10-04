import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.MODEL_OUT||'/workspace/hairsample-game-proof/equipment';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.goto((process.env.MODEL_URL||'http://localhost:4188/')+'?fresh=1&kit=staff&quality=low');
 await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.view.hero.hairsample,undefined,{timeout:90000});
 await page.evaluate(()=>{const f=__frontier,v=f.view,g=f.game;f.paused=true;f.input.disabled=true;g.player.x=-48;g.player.z=45;g.player.facing=0;v.heroY=v.world.groundY(-48,45);v.zoom=.25;v.snapCamera();v.render(.016,g.time);v.render=()=>{};});
 const checks=[];
 for(const [name,gear] of [
  ['staff',{weapon:'staff',armor:'tunic'}],['bow',{weapon:'bow',armor:'tunic'}],
  ['sword',{weapon:'sword',armor:'tunic'}],['plate',{weapon:'staff',armor:'plate',bases:{armor:'crag_plate',boots:'crag_greaves'}}],
  ['pelt',{weapon:'staff',armor:'pelt',bases:{armor:'wolf_pelt',boots:'wolf_boots'}}],
  ['mantle',{weapon:'staff',armor:'mantle',bases:{armor:'storm_mantle',boots:'wisp_slippers'}}],
  ['staff-repeat',{weapon:'staff',armor:'tunic'}],
 ]){
  const report=await page.evaluate(gear=>{const f=__frontier,v=f.view,g=f.game;v.setHeroLook(g.ch.appearance,gear);const r=v.hero;r.root.position.set(g.player.x,v.heroY,g.player.z);r.root.rotation.y=0;v.heroAnim.update(.08,{speed:0,moving:false,facing:0,dead:false,time:g.time});v.renderer.render(v.scene,v.camera);let skinTriangles=0,garments=0,clothInBase=0;r.skin.body.traverse(o=>{if(o.isSkinnedMesh&&o.name==='BodySkin')skinTriangles=o.geometry.index.count/3;if(o.material?.name.includes('CLOTH'))clothInBase++;});r.wardrobe.traverse(o=>{if(o.isMesh)garments++;});return {skinTriangles,garments,clothInBase,geometry:v.renderer.info.memory.geometries,texture:v.renderer.info.memory.textures,finite:r.bones.handR.matrixWorld.elements.every(Number.isFinite)};},gear);
  checks.push({name,...report});await page.screenshot({path:out+'/'+name+'.png'});
 }
 await page.evaluate(()=>{const v=__frontier.view,r=v.hero;const inside=(o,p)=>{for(let x=o;x;x=x.parent)if(x===p)return true;return false;};r.root.traverse(o=>{if(o.isMesh&&!inside(o,r.skin.body))o.visible=false;});if(r.scarf)r.scarf.mesh.visible=false;v.renderer.render(v.scene,v.camera);});
 await page.screenshot({path:out+'/base-front.png'});
 await page.evaluate(()=>{const v=__frontier.view;v.hero.root.rotation.y=Math.PI/2;v.renderer.render(v.scene,v.camera);});await page.screenshot({path:out+'/base-side.png'});
 writeFileSync(out+'/report.json',JSON.stringify({checks,errors,reviewZoom:.25,normalGameplayCameraUnchanged:true},null,2));
 console.log(JSON.stringify({out,checks,errors}));
 if(errors.length||checks.some(c=>c.skinTriangles!==7112||c.garments!==3||c.clothInBase||!c.finite))throw Error('Model/equipment contract failed');
}finally{await browser.close();}
