import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const res={};
for(const port of process.argv.slice(2)){const p=await (await b.newContext({viewport:{width:1180,height:820}})).newPage();p.setDefaultTimeout(600000);
await p.goto(`http://127.0.0.1:${port}/?fresh=1&seed=9&quality=high`);await p.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
res[port]=await p.evaluate(()=>__frontier.view.renderer.info.programs.map(pr=>pr.cacheKey.slice(0,120).replace(/\s+/g,' ')));await p.close();}
const [a,c]=Object.values(res);const sa=new Map();for(const k of a){const key=k.split(',').slice(0,3).join(',');sa.set(key,(sa.get(key)||0)+1);}const sc=new Map();for(const k of c){const key=k.split(',').slice(0,3).join(',');sc.set(key,(sc.get(key)||0)+1);}
for(const [k,v] of sa){const w=sc.get(k)||0;if(v!==w)console.log(v-w,k.slice(0,110));}
await b.close();
