import {chromium} from 'playwright';
const [scene,target]=process.argv.slice(2);
const b=await chromium.launch({args:['--no-sandbox']});const ctx=await b.newContext();const p=await ctx.newPage();await p.goto('http://127.0.0.1:4179/lab.html');
await p.evaluate(async(n)=>{await import(`/src/render/accepted-scenes/${n}.js`);},scene);
const cdp=await ctx.newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start');
await p.evaluate(async(n)=>{const m=await import(`/src/render/accepted-scenes/${n}.js`);m.createAcceptedScene({clipBounds:[-65,65,-65,30]});},scene);
const {profile}=await cdp.send('Profiler.stop');const byId=new Map(profile.nodes.map(n=>[n.id,n]));const parent=new Map();for(const n of profile.nodes)for(const c of n.children||[])parent.set(c,n.id);
const agg=new Map();profile.samples.forEach((id,i)=>{const chain=[];let cur=id;while(cur!==undefined){chain.push(byId.get(cur));cur=parent.get(cur);}const idx=chain.findIndex(n=>n.callFrame.functionName===target);if(idx<0)return;
 // first ancestor that is a direct child of build
 const bi=chain.findIndex(n=>n.callFrame.functionName==='build');const top=bi>0?chain[bi-1].callFrame.functionName:'?';const caller=chain[idx+1]?.callFrame.functionName;const k=top+' > '+caller;agg.set(k,(agg.get(k)||0)+(profile.timeDeltas[i]||0));});
console.log([...agg].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([k,v])=>(v/1000|0)+'ms '+k).join('\n'));await b.close();
