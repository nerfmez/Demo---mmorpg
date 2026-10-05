// Local review: real game, deterministic 60 Hz stepping, unchanged combat data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync,writeFileSync } from 'node:fs';
const out=process.env.V5_OUT||new URL('./out/fireball-v5-origin/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:Number(process.env.WIDTH||1100),height:Number(process.env.HEIGHT||760)},deviceScaleFactor:1});
const errors=[];page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`HTTP ${r.status()} ${r.url()}`)});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text())});
await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__v5Freeze)cb(t)})});
try {
await page.goto('http://localhost:4192/?fresh=1&kit=staff&seed=9&quality=low&dynres=0'+(process.env.LEGACY?'&fireball=legacy':'')+'&reviewZoom='+(process.env.ZOOM||1)+'&reviewPrelude='+(process.env.PRELUDE?'1':'0'),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier?.game?.time>.2,null,{timeout:90000});
textlog(await page.evaluate(()=>{
 const f=__frontier,g=f.game,p=g.player;f.paused=true;f.input.reset();f.hud.setQuestCollapsed(true);window.__v5Freeze=true;
 const m=g.monsters.find(m=>m.type==='salt_slime');
 let spot=null;for(const a of [-Math.PI/2,Math.PI/2,0,Math.PI]){let clear=true;for(let d=0;d<=9;d+=.2){if(!g.world.isFree(m.x-Math.sin(a)*d,m.z-Math.cos(a)*d,p.r)||g.isSafe(m.x-Math.sin(a)*d,m.z-Math.cos(a)*d))clear=false;}if(clear){spot=a;break;}}
 if(spot===null)throw Error('No clear real monster shot');
 p.x=m.x-Math.sin(spot)*8;p.z=m.z-Math.cos(spot)*8;p.facing=spot;g.monsters=[m];g.spawnPoints=[];g.setMove(0,0);g.setAimPoint(m.x,m.z);
 f.view.zoom=Number(new URLSearchParams(location.search).get('reviewZoom'))||1;f.view.snapCamera();f.view.render(0,g.time,{});
 f.reviewEvents=[];f.originSamples=[];f.reviewStep=()=>{g.update(1/60);for(const e of g.drainEvents()){f.reviewEvents.push(e);f.view.handleEvent(e);}f.view.render(1/60,g.time,{});f.hud.update(1/60,{});
 const cast=f.view.vfx.castFlame,pr=g.projectiles.find(pr=>pr.kind==='firebolt'),mesh=pr&&f.view.vfx.projectiles.get(pr.id);
 const b=f.view.hero.bones,vec=b.weapon.position.clone();
 const tip=b.weapon.localToWorld(vec.set(0,0,1.1475)).toArray();
 // The current HairSample body attaches equipment to its real skinned palm.
 // Legacy rigs still use the driver-bone palm used by the source-era probe.
 const rig=f.view.hero,hand=rig.hairsample?rig.skin.body.getObjectByName('J_Bip_R_Hand'):b.handR;
 const palm=hand.localToWorld(rig.gripCenter?vec.copy(rig.gripCenter):vec.set(0,-.07,0)).toArray(),grip=b.weapon.localToWorld(vec.set(0,0,0)).toArray();
 const left=b.handL.localToWorld(vec.set(0,-.07,0)).toArray(),support=b.weapon.localToWorld(vec.set(0,0,.65)).toArray();
 f.originSamples.push({staffTip:tip,rightPalm:palm,weaponGrip:grip,leftPalm:left,supportGrip:support,frame:f.originSamples.length,castT:p.cast?.t,angle:p.facing,player:[p.x,p.z],charge:cast?.mesh.position.toArray(),chargeScale:cast?.mesh.material.uniforms.uScale.value,chargeBuild:cast?.mesh.material.uniforms.uChargeBuild?.value,
 projectile:pr&&{x:pr.x,y:pr.y,z:pr.z,travelled:pr.travelled,speed:pr.speed},visual:mesh?.position.toArray(),tailDistance:mesh?.children[0].material.uniforms.uTravelled?.value,spawn:pr&&(()=>{const x=pr.x-pr.vx/pr.speed*pr.travelled,z=pr.z-pr.vz/pr.speed*pr.travelled;return[x,f.world.surfaceY(x,z)+pr.y,z]})()});};
 f.reviewCast=()=>{g.player.mp=g.player.maxMp;g.player.cooldowns={};g.setAimPoint(m.x,m.z);return g.castSlot(g.skills.findIndex(s=>s?.id==='firebolt'));};
 return {slots:g.skills.map(s=>s?.id),player:[p.x,p.z],monster:[m.x,m.z],cast:new URLSearchParams(location.search).get('reviewPrelude')==='1'?false:f.reviewCast()};
}));
const prelude=process.env.PRELUDE?30:0;
for(let i=0;i<150+prelude;i++){
 if(prelude&&i===prelude)await page.evaluate(()=>__frontier.reviewCast());
 await page.evaluate(()=>__frontier.reviewStep());
 if([0,2,4,6,8,10,12,13,14,16,20,24,32,48,55,63,80,110,149].includes(i-prelude))await page.screenshot({path:`${out}/game-${String(i).padStart(3,'0')}.png`});
 if(process.env.VIDEO && i<Number(process.env.VIDEO_FRAMES||999))await page.screenshot({path:`${out}/frame-${String(i).padStart(3,'0')}.png`});
 if(process.env.CLOSE_VIDEO && i<Number(process.env.VIDEO_FRAMES||999)){
  await page.evaluate(()=>{const v=__frontier.view,c=v.camera,t=v.camTarget;window.__cameraBefore=c.position.clone();c.position.sub(t).multiplyScalar(.55).add(t);c.lookAt(t.x,t.y+.8,t.z);c.updateMatrixWorld();v.renderer.render(v.scene,c);});
  await page.screenshot({path:`${out}/close-${String(i).padStart(3,'0')}.png`});
  await page.evaluate(()=>{const v=__frontier.view;v.camera.position.copy(window.__cameraBefore);v.camera.lookAt(v.camTarget.x,v.camTarget.y+.8,v.camTarget.z);v.camera.updateMatrixWorld();v.renderer.render(v.scene,v.camera);});
 }
 if(process.env.ANGLES && [8,14].includes(i-prelude)){
  for(const [name,angle] of [['three-quarter',-.8],['side',1.57]]){
   await page.evaluate(angle=>{const v=__frontier.view,c=v.camera,t=v.camTarget;window.__cameraBefore=c.position.clone();c.position.sub(t).multiplyScalar(.5).applyAxisAngle({x:0,y:1,z:0},angle).add(t);c.lookAt(t.x,t.y+.8,t.z);c.updateMatrixWorld();v.renderer.render(v.scene,c);},angle);
   await page.screenshot({path:`${out}/${name}-${i-prelude}.png`});
   await page.evaluate(()=>{const v=__frontier.view;v.camera.position.copy(window.__cameraBefore);v.camera.lookAt(v.camTarget.x,v.camTarget.y+.8,v.camTarget.z);v.camera.updateMatrixWorld();v.renderer.render(v.scene,v.camera);});
  }
 }
}
const report=await page.evaluate(()=>({originSamples:__frontier.originSamples,events:__frontier.reviewEvents,info:__frontier.view.renderer.info,damage:__frontier.game.stats.damageDealt,
 cleanup:{cast:!!__frontier.view.vfx.castFlame,projectiles:__frontier.view.vfx.projectiles.size,active:__frontier.view.vfx.active.length,particles:__frontier.view.vfx.flames.count}}));
writeFileSync(`${out}/report.json`,JSON.stringify({errors,...report},null,2));
assert.equal(errors.length,0,errors.join('\n'));assert.ok(report.damage>0,'real monster must take damage');
assert.equal(report.events.filter(e=>e.type==='impact').length,1);assert.deepEqual(report.cleanup,{cast:false,projectiles:0,active:0,particles:0});
if(process.env.ASSERT_ORIGIN){
 const charges=report.originSamples.filter(s=>s.charge),last=charges.at(-1),first=report.originSamples.find(s=>s.projectile);
 const mismatch=Math.hypot(...last.charge.map((v,i)=>v-last.staffTip[i]));
 assert.ok(mismatch<.005,`charge/staff-tip mismatch ${mismatch}`);
 const releaseError=Math.hypot(...first.visual.map((v,i)=>v-last.charge[i]-(i===0?Math.sin(last.angle)*first.projectile.travelled:i===2?Math.cos(last.angle)*first.projectile.travelled:0)));
 assert.ok(releaseError<.03,`continuous socket release error ${releaseError}`);
 assert.equal(first.projectile.speed,9);assert.equal(first.tailDistance,first.projectile.travelled);
 assert.ok(charges[0].chargeScale<.12,'charge starts as small gathering wisps, not a formed ball');
 assert.ok(charges[0].chargeBuild<.1,'core starts unrevealed');
 assert.ok(charges.every((s,i)=>!i||s.chargeScale>=charges[i-1].chargeScale),'core grows continuously');
 assert.ok(last.chargeScale>=1.04&&last.chargeBuild>.95,'complete the approved body before release');
 assert.equal(charges.length,13,'unchanged .22-second cast at 60 Hz');
 assert.equal(first.frame-charges[0].frame,13,'unchanged release frame');
 assert.ok(Math.hypot(...last.rightPalm.map((v,i)=>v-last.weaponGrip[i]))<.005,'right palm holds handle');
 assert.ok(Math.hypot(...last.leftPalm.map((v,i)=>v-last.supportGrip[i]))<.08,'support palm remains near shaft');
 report.originCheck={releaseErrorMeters:releaseError,staffTipMismatchMeters:mismatch,logicalMuzzleOffset:last.charge.map((v,i)=>v-first.spawn[i]),rightGripError:Math.hypot(...last.rightPalm.map((v,i)=>v-last.weaponGrip[i])),leftGripError:Math.hypot(...last.leftPalm.map((v,i)=>v-last.supportGrip[i])),chargeFrames:charges.length,fullCoreFrames:charges.filter(s=>s.chargeScale>=1).length,firstFlightTravel:first.projectile.travelled};
}
writeFileSync(`${out}/report.json`,JSON.stringify({errors,...report},null,2));textlog({errors,damage:report.damage,events:report.events.map(e=>e.type)});
}finally{await browser.close()}
function textlog(o){console.log(JSON.stringify(o));}
