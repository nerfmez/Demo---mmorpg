// Two independent touch pointers: moving joystick and quick item, including cooldown/cancel.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,out=`tests/browser/out/potions-moving-${engine.name()}`;
mkdirSync(out,{recursive:true});
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4242','--strictPort'],{stdio:'ignore',detached:true});
let browser;
try{
 for(let i=0;;i++){try{if((await fetch('http://localhost:4242/')).ok)break;}catch{}if(i>60)throw Error('server');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:engine===chromium?process.env.CHROMIUM_EXECUTABLE:undefined,args:engine===chromium?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4242/?fresh=1&quality=low&seed=5&stream=0');await page.waitForFunction(()=>window.__frontier?.game?.time>.3&&window.__frontier.modelsReady);
 await page.evaluate(()=>{const f=window.__frontier,g=f.game;document.querySelector('.banner')?.remove();g.monsters=[];g.player.hp=g.player.maxHp*.1;g.player.itemCooldowns.hp=0;g.ch.quickItems[0]='hp_potion_s';g.ch.consumables.hp_potion_s=5;});
 const button=page.locator('.qbtn').first(),b=await button.boundingBox(),joy={x:100,y:710,id:1},moved={x:160,y:660,id:1},potion={x:b.x+b.width/2,y:b.y+b.height/2,id:2};
 const cdp=engine===chromium?await page.context().newCDPSession(page):null;
 const pointer=async(selector,type,id,x,y)=>page.locator(selector).first().evaluate((el,a)=>el.dispatchEvent(new PointerEvent(a.type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:a.id,clientX:a.x,clientY:a.y})),{type,id,x,y});
 if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[joy]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});}
 else{await pointer('.joyzone','pointerdown',1,joy.x,joy.y);await pointer('.joyzone','pointermove',1,moved.x,moved.y);}
 const read=()=>page.evaluate(()=>{const f=window.__frontier,g=f.game;return {count:g.ch.consumables.hp_potion_s||0,hp:g.player.hp,cd:g.player.itemCooldowns.hp,joy:{...f.input.joy},x:g.player.x,z:g.player.z};});
 const before=await read();assert.notEqual(before.joy.id,null);assert.ok(Math.hypot(before.joy.dx,before.joy.dz)>.9);
 const tap=async()=>{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moved,potion]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[potion]});}else{await pointer('.qbtn','pointerdown',2,potion.x,potion.y);await pointer('.qbtn','pointerup',2,potion.x,potion.y);}};
 await tap();const after=await read();assert.equal(after.count,4,'one potion consumed by second finger');assert.ok(after.hp>before.hp+10);assert.ok(after.cd>0);assert.deepEqual(after.joy,before.joy,'potion leaves joystick pointer/vector intact');
 await tap();assert.equal((await read()).count,4,'cooldown prevents repeat consumption');
 await page.waitForTimeout(250);const walking=await read();assert.ok(Math.hypot(walking.x-before.x,walking.z-before.z)>.05,'walking continues through drink');assert.equal(walking.joy.id,before.joy.id);
 await page.screenshot({path:`${out}/two-finger-drink.png`});
 if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await pointer('.joyzone','pointerup',1,moved.x,moved.y);
 await page.evaluate(()=>{const g=window.__frontier.game;g.player.itemCooldowns.hp=0;g.player.hp=1;});
 await pointer('.qbtn','pointerdown',42,potion.x,potion.y);await pointer('.qbtn','pointercancel',42,potion.x,potion.y);await pointer('.qbtn','pointerup',42,potion.x,potion.y);assert.equal((await read()).count,4,'cancelled pointer does not drink');
 await pointer('.qbtn','pointerdown',43,potion.x,potion.y);await pointer('.qbtn','pointerup',43,potion.x-200,potion.y);assert.equal((await read()).count,4,'release outside cancels');
 await button.click();assert.equal((await read()).count,3,'mouse pointer plus compatibility click drinks only once');
 await page.evaluate(()=>{const g=window.__frontier.game;g.player.itemCooldowns.hp=0;g.player.hp=1;});await button.focus();await page.keyboard.press('Enter');assert.equal((await read()).count,2,'keyboard activation remains available');
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({engine:engine.name(),input:cdp?'native Chromium two-touch CDP':'WebKit independent pointer events',before,after,walking,cooldown:'passed',cancel:'passed',mouse:'single consumption',keyboard:'passed',errors},null,2));console.log('PASS potions while moving',engine.name());
}finally{await browser?.close();try{process.kill(-server.pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
