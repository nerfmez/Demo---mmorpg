import {chromium} from 'playwright';
const [base,mode,...rest]=process.argv.slice(2);
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await (await b.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true})).newPage();page.setDefaultTimeout(600000);
await page.goto(base+'/?fresh=1&seed=9&quality=high',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
const [gx,gz]=mode.split(',').map(Number);const px=rest.map(s=>s.split(',').map(Number));
const out=await page.evaluate(([gx,gz,px])=>{const f=__frontier,p=f.game.player,v=f.view;f.paused=true;f.game.monsters=[];p.x=gx;p.z=gz;p.y=f.game.world.terrainY(gx,gz);v.zoom=1;v.snapCamera();v.render(.016,3,{});
 const rc=v.raycaster,res=[];rc.layers.enableAll();
 for(const [x,y] of px){rc.setFromCamera({x:x/1180*2-1,y:-(y/820*2-1)},v.camera);
  const hits=rc.intersectObjects(v.scene.children,true).filter(h=>h.object.visible!==false).slice(0,4);
  res.push([x,y,hits.map(h=>{let o=h.object,path=[];while(o&&path.length<5){path.push((o.name||o.type)+(o.userData?.kind?'['+o.userData.kind+']':''));o=o.parent;}const m=Array.isArray(h.object.material)?h.object.material[0]:h.object.material;return {d:+h.distance.toFixed(1),pt:[+h.point.x.toFixed(1),+h.point.y.toFixed(1),+h.point.z.toFixed(1)],path:path.join('<'),mat:m?.type+':'+(m?.name||'')+' op'+m?.opacity+' tr'+m?.transparent+' dw'+m?.depthWrite+' col'+(m?.color?.getHexString?.()||'')};})]);}
 return res;},[gx,gz,px]);
console.log(JSON.stringify(out,null,1));await b.close();
