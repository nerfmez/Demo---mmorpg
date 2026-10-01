// Ground-only owner review, from the actual game camera. Fixed PR24 seed, pose and clock.
// Before/after builds use this exact harness. Software GL statistics are not iPad FPS.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const before=process.env.GROUND_BEFORE==='1',out=process.env.GROUND_OUT||'tests/browser/out/ground-chromium/';
mkdirSync(out,{recursive:true});
const report={source:process.env.GROUND_SOURCE,before,clock:12,seed:9,quality:'medium',hardwareIPadFPS:'not measured',captures:[],errors:[]};
const base='http://localhost:4194/';let browser;
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--port','4194','--strictPort'],{stdio:'ignore',detached:true});
try{
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>80)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const ctx=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__groundFreeze)cb(t)});});
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.location().url?.endsWith('/favicon.ico'))report.errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`)});
  await page.goto(base+'?fresh=1&seed=9&quality=medium');
  await page.waitForFunction(()=>window.__frontier?.modelsReady&&window.__frontier.game.time>.2,null,{timeout:90000});
  await page.evaluate(async()=>{
    await document.fonts.ready;window.__groundFreeze=true;
    const f=window.__frontier;f.paused=true;f.input.reset();f.input.disabled=true;
    // Reset simulation from the existing constructor: initial monster placement is also deterministic.
    const game=new f.game.constructor(f.game.data,{seed:9,world:f.world});f.game=game;f.view.attachGame(game);f.hud.game=game;f.input.game=game;f.panels.game=game;
    game.time=12;game.player.facing=2.8;game.drainEvents();
    document.querySelector('.banner')?.remove();
  });
  const scenes=[['01-glade',-110,8],['02-forest',-100,-70],['03-worn-earth',-95,31],['04-beach',-132,80],['05-market-stone',62,25.3],['06-pier-wood',34.55,49.3],['07-shipyard',120,91.8],['08-pond-bank',-70,-73]];
  for(const [name,x,z] of scenes){
    const state=await page.evaluate(([name,x,z])=>{
      const f=window.__frontier,g=f.game,v=f.view;
      Object.assign(g.player,g.freeSpotNear(x,z));g.player.facing=2.8;
      v.zoom=1;v.camera.up.set(0,1,0);v.snapCamera();
      for(let i=0;i<3;i++){v.render(0,12,{});for(const mv of v.monsterViews.values())mv.spawnT=1;}
      f.hud.update(.6,f.panels);
      return {name,x:g.player.x,z:g.player.z,fov:v.camera.fov,zoom:v.zoom,drawCalls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,textures:v.renderer.info.memory.textures};
    },[name,x,z]);
    assert.equal(state.fov,36);assert.equal(state.zoom,1);
    await page.screenshot({path:out+name+'.png',timeout:60000});report.captures.push(state);console.log('CAPTURE',JSON.stringify(state));
    assert.deepEqual(report.errors,[],'shader or asset errors');
  }
  // A focused route plus existing native touch handler; not a full-game walkthrough.
  const cdp=await ctx.newCDPSession(page);
  await page.evaluate(()=>{const f=window.__frontier;f.input.disabled=false;});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:680,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:150,y:680,id:1}]});
  report.touch=await page.evaluate(()=>{const f=window.__frontier;f.input.update();return f.game.input.moveX;});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.ok(report.touch>.8);
  report.walk=await page.evaluate(()=>{
    const f=window.__frontier,g=f.game;f.input.disabled=true;Object.assign(g.player,{x:34.3,z:37.5});
    const ramp=g.world.docks.find(d=>d.id==='market_west_ramp'),deck=g.world.docks.find(d=>d.id==='market_west');
    for(const [x,z] of [[ramp.x,ramp.z],[deck.x,deck.z]]){
      let i=0;for(;i<1500&&Math.hypot(x-g.player.x,z-g.player.z)>.2;i++){g.setMove(x-g.player.x,z-g.player.z);g.update(1/60);}if(i===1500)throw Error('pier approach blocked');
    }
    g.setMove(0,0);return {onPier:!!g.world.dockAt(g.player.x,g.player.z),alive:!g.player.dead};
  });assert.ok(report.walk.onPier&&report.walk.alive);
  if(!before){
    report.planting=await page.evaluate(()=>{
      const f=window.__frontier,w=f.world,p=new f.view.hero.root.position.constructor(),m=new f.view.hero.root.matrix.constructor();let count=0,town=0;
      f.view.scene.traverse(mesh=>{if(mesh.name!=='ground-blended-grass')return;
        for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);count++;
          if(w.isWater(p.x,p.z,.4)||w.dockAt(p.x,p.z)||w.roadDist(p.x,p.z)<0)throw Error('grass obstructs an authored water/deck/path mask');
          if(Math.abs(p.y-(w.groundY(p.x,p.z)-.018))>.001)throw Error('grass root floats above terrain');
          if(w.zoneAt(p.x,p.z).safe)town++;
        }
      });return {instances:count,townInstances:town};
    });assert.ok(report.planting.instances>1000&&report.planting.townInstances>100);
  }
  report.ok=true;console.log('PASS GROUND REVIEW',before?'before':'after');
}finally{writeFileSync(out+'report.json',JSON.stringify(report,null,2));await browser?.close();try{process.kill(-server.pid);}catch{}}
