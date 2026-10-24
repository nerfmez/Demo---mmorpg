import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const port of process.argv.slice(2)){const p=await (await b.newContext({viewport:{width:1180,height:820}})).newPage();p.setDefaultTimeout(600000);const t=Date.now();
await p.goto(`http://127.0.0.1:${port}/?fresh=1&seed=9&quality=high`);await p.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
const st=await p.evaluate(()=>{const f=__frontier;const q=f.buildQueue||f.view?.buildQueue;return {q:q?.stats,keys:Object.keys(f).slice(0,60)}});console.log(port,'ready ms',Date.now()-t,JSON.stringify(st.q));await p.close();}
await b.close();
