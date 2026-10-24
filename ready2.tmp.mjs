import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const port of process.argv.slice(2)){const p=await (await b.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true})).newPage();p.setDefaultTimeout(600000);const t=Date.now();
await p.goto(`http://127.0.0.1:${port}/?fresh=1&seed=9&quality=high`);await p.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
const d=await p.evaluate(()=>{const v=__frontier.view,r=x=>Math.round(x);const deps=Object.fromEntries(Object.entries(v.startupDependencies??{}).map(([k,e])=>[k,[r(e.startedMs),r(e.elapsedMs)]]));
const regs=[...(v.regions??[])].map(([id,g])=>[id,Object.fromEntries(Object.entries(g.stats?.construction??{}).map(([k,s])=>[k,[r(s.startedMs),r(s.elapsedMs),r(s.cpuMs),r(s.waitingMs),r(s.maxStepMs)]])),g.warmStats&&[r(g.warmStats.elapsedMs),r(g.warmStats.submitMs)]]);return {now:r(performance.now()),deps,regs};});
console.log(port,'ready',Date.now()-t,JSON.stringify(d));await p.close();}
await b.close();
