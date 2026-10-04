import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.MODEL_OUT||'/workspace/bodyx-model-proof/v1';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const mobile=process.env.MODEL_PHONE==='1',page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:960,height:600},hasTouch:mobile,isMobile:mobile});const errors=[],baselineWarnings=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'){if(m.location().url.endsWith('/favicon.ico'))baselineWarnings.push(m.text());else errors.push(m.text());}});
 await page.goto((process.env.MODEL_URL||'http://localhost:4188/')+'?fresh=1&kit=staff&quality=low',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier.view.hero.hairsample,undefined,{timeout:90000});
 await page.evaluate(()=>{const f=__frontier,g=f.game;f.paused=true;f.input.disabled=true;g.player.x=-48;g.player.z=45;for(const m of g.monsters){m.x+=250;m.z+=250;}f.view.heroY=f.view.world.groundY(g.player.x,g.player.z);f.view.zoom=.40;f.view.snapCamera();f.view.render(0,g.time);const render=f.view.render.bind(f.view);f.view.render=(dt,...a)=>{if(dt>0||!f.paused)return render(dt,...a);};});
 const trace=[];
 for(let i=0;i<75;i++){
  const row=await page.evaluate(({i,mobile})=>{
   const f=__frontier,g=f.game,v=f.view,t=i/15;let x=0,z=0;if(t>=.4&&t<1.2)x=.25;else if(t>=1.45&&t<2.6||t>=3.0&&t<4.2){x=1;if(t>=1.95){const a=(Math.min(t,2.6)-1.95)*1.5;x=Math.cos(a);z=-Math.sin(a);}}
   if(mobile){const zone=f.input.joyZone,r=zone.getBoundingClientRect(),cx=r.left+70,cy=r.bottom-85,ev=(type,dx,dy)=>zone.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:7,isPrimary:true,bubbles:true,clientX:cx+dx,clientY:cy+dy}));if(x||z){if(f.input.joy.id===null)ev('pointerdown',0,0);ev('pointermove',x*60,z*60);}else if(f.input.joy.id!==null)ev('pointerup',0,0);f.input.disabled=false;f.input.update();f.input.disabled=true;}else g.setMove(x,z);
   if(i===38){g.setAimAngle(Math.PI/2,true);g.castSlot(0);}
   for(let sub=0;sub<2;sub++){g.update(1/30);for(const e of g.drainEvents()){v.handleEvent(e);f.hud.handleEvent(e);}v.render(1/30,g.time);f.hud.update(1/30,f.sessionUI||{});}
   const r=v.hero,h=r.skin.body.getObjectByName('J_Bip_R_Hand');r.root.updateMatrixWorld(true);const center=h.localToWorld(r.gripCenter.clone()),socket=r.bones.weapon.getWorldPosition(center.clone());const error=center.distanceTo(socket);
   return {t,position:[g.player.x,g.player.z],animator:v.heroAnim.constructor.name,gait:v.heroAnim.gaitU,action:v.heroAnim.action?.name||null,gripError:error,finite:h.matrixWorld.elements.every(Number.isFinite)};
  },{i,mobile});trace.push(row);await page.screenshot({path:out+`/frame-${String(i).padStart(3,'0')}.png`});
  if(i===0||i===16||i===35||i===59)console.log('FRAME',i);
 }
 const extra=await page.evaluate(()=>{const f=__frontier,g=f.game,v=f.view,models=[];for(const weapon of ['sword','bow','staff','none']){v.setHeroLook(g.ch.appearance,{weapon});v.heroAnim.play('slash',.6,weapon,0,.3,'melee_arc');v.heroAnim.update(.1,{speed:0,moving:false,facing:0,dead:false,dash:null,time:g.time});v.renderer.render(v.scene,v.camera);models.push({weapon,finite:v.hero.bones.handR.matrixWorld.elements.every(Number.isFinite),geometry:v.renderer.info.memory.geometries});}return {models,saveVersion:g.snapshot().version,speed:g.derived.moveSpeed,radius:g.player.r,separateWardrobe:!!v.hero.wardrobe,baseModel:v.hero.hairsample};});
 writeFileSync(out+'/report.json',JSON.stringify({errors,baselineWarnings,trace,extra,viewport:mobile?'844x390 landscape touch emulation':'960x600 desktop',fps:15,normalSimulationSpeed:true},null,2));console.log(JSON.stringify({out,errors,extra,maxGripError:Math.max(...trace.map(r=>r.gripError))}));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
