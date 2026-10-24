import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const port of process.argv.slice(2)){const p=await (await b.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true})).newPage();p.setDefaultTimeout(600000);const t=Date.now();
await p.goto(`http://127.0.0.1:${port}/?fresh=1&seed=9&quality=high`);await p.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
const r=await p.evaluate(()=>{const v=__frontier.view;const progs=v.renderer.info.programs;const names={};for(const pr of progs){const k=pr.name||'?';names[k]=(names[k]||0)+1;}return {n:progs.length,world:Math.round(v.startupDependencies.world.elapsedMs),names};});
console.log(port,'ready',Date.now()-t,JSON.stringify(r));await p.close();}
await b.close();
