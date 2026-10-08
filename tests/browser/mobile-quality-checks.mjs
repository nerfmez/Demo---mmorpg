// Use the already loaded production page; called after the matched walking sample.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function checkMobileQuality(page,out){
 await page.evaluate(()=>{const f=__frontier;f.paused=true;f.input.disabled=false;window.heldRender=f.view.render;f.view.render=()=>{};f.panels.open('settings');});
 await page.locator('[data-act="quality"][data-q="economy"]').tap();
 const state=await page.evaluate(()=>{const f=__frontier,v=f.view;return{quality:v.quality,pref:localStorage.getItem('frontier-demo.quality'),dpr:v.renderer.getPixelRatio(),fraction:v.grassList[0]?.userData.grassCulling.fraction,cssWidth:v.renderer.domElement.getBoundingClientRect().width,width:v.renderer.domElement.width};});
 assert.equal(state.quality,'economy');assert.equal(state.pref,'economy');assert.equal(state.dpr,.85);assert.equal(state.fraction,.35);assert.equal(state.cssWidth,844);assert.equal(state.width,Math.floor(844*.85));
 await page.evaluate(()=>heldRender.call(__frontier.view,0,__frontier.game.time));
 await page.screenshot({path:out+'/phone-settings.png'});
 await page.locator('[data-act="quality"][data-q="low"]').tap();
 assert.equal(await page.evaluate(()=>__frontier.view.grassList.every(m=>m.userData.grassCulling.fraction===1)),true);
 await page.locator('[data-act="quality"][data-q="economy"]').tap();
 await page.setViewportSize({width:1180,height:820});
 await page.evaluate(()=>{__frontier.view.resize();heldRender.call(__frontier.view,0,__frontier.game.time);});
 await page.screenshot({path:out+'/ipad-settings.png'});
 await page.evaluate(()=>{__frontier.view.setRenderScale(.67);});
 assert.ok(await page.evaluate(()=>__frontier.view.renderer.getPixelRatio()<.6),'dynamic resolution still reduces weak-device work');
 await page.evaluate(()=>{__frontier.view.setRenderScale(1);__frontier.panels.close();const f=__frontier;Object.assign(f.game.player,{x:-132,z:80});f.view.snapCamera();f.view.render=heldRender;f.paused=false;});
 const start=await page.evaluate(()=>[__frontier.game.player.x,__frontier.game.player.z]);
 const joy=await page.locator('.joyzone').boundingBox();const x=joy.x+joy.width*.4,y=joy.y+joy.height*.6;
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+38,y}]});
 await page.waitForFunction(([x,z])=>Math.hypot(__frontier.game.player.x-x,__frontier.game.player.z-z)>.1,start);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>__frontier.input.joy.id===null&&__frontier.game.input.moveX===0&&__frontier.game.input.moveZ===0);
 await page.waitForFunction(()=>__frontier.hud.portrait.style.backgroundImage.includes('data:image'));
 await page.evaluate(()=>{__frontier.paused=true;__frontier.view.render=()=>{};});
 await page.screenshot({path:out+'/ipad-walking.png'});
 // Real async readbacks: UI frames progress, caller state is restored and owned
 // geometry returns to the same level across two completions.
 const portrait=await page.evaluate(async()=>{
  const f=__frontier,v=f.view,g=f.game;let frames=0,run=true;function tick(){if(run){frames++;requestAnimationFrame(tick);}}requestAnimationFrame(tick);
  const memory=[];for(let i=0;i<2;i++){const target=v.renderer.getRenderTarget();const url=await v.portrait(g.ch.appearance,g.gearLook());if(!url.startsWith('data:image/png'))throw Error('portrait missing');if(v.renderer.getRenderTarget()!==target)throw Error('borrowed target changed');memory.push({...v.renderer.info.memory});}run=false;
  return {frames,memory,glError:v.renderer.getContext().getError()};
 });
 assert.ok(portrait.frames>0);assert.equal(portrait.glError,0);assert.equal(portrait.memory[0].geometries,portrait.memory[1].geometries);assert.equal(portrait.memory[0].textures,portrait.memory[1].textures);
 writeFileSync(out+'/checks.json',JSON.stringify({state,touch:true,portrait},null,2));console.log('PASS quality, touch, async portrait/resource checks');
}
