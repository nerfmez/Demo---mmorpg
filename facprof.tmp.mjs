import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext();const p=await ctx.newPage();await p.goto('http://127.0.0.1:4179/lab.html');
await p.evaluate(async()=>{for(const n of ['beach','forest','shell-beach','hill-windmill','azure-meadow','rose-garden'])await import(`/src/render/accepted-scenes/${n}.js`);});
const cdp=await ctx.newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:200});await cdp.send('Profiler.start');
const t=await p.evaluate(async()=>{const out={};for(const n of ['beach','forest','shell-beach','hill-windmill','azure-meadow','rose-garden']){const m=await import(`/src/render/accepted-scenes/${n}.js`);const t=performance.now();m.createAcceptedScene({clipBounds:[-65,65,-65,30]});out[n]=Math.round(performance.now()-t);}return out;});
const {profile}=await cdp.send('Profiler.stop');console.log(JSON.stringify(t));
const byId=new Map(profile.nodes.map(n=>[n.id,n]));const self=new Map();profile.samples.forEach((id,i)=>{const n=byId.get(id);const k=n.callFrame.functionName+' '+n.callFrame.url.split('/').slice(-1)[0].split('?')[0]+':'+n.callFrame.lineNumber;self.set(k,(self.get(k)||0)+(profile.timeDeltas[i]||0));});
console.log([...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>(v/1000|0)+'ms '+k).join('\n'));await b.close();
