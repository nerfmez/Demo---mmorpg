import {chromium} from 'playwright';
const b=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1180,height:820}});const p=await ctx.newPage();p.setDefaultTimeout(900000);
const cdp=await ctx.newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
await p.goto(`http://127.0.0.1:${process.argv[2]}/?fresh=1&seed=9&quality=high`);await p.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.3&&document.querySelector('#loading')?.classList.contains('done'));
const {profile}=await cdp.send('Profiler.stop');
const byId=new Map(profile.nodes.map(n=>[n.id,n]));const self=new Map();const dt=profile.timeDeltas;const cnt=new Map();
profile.samples.forEach((id,i)=>{cnt.set(id,(cnt.get(id)||0)+(dt[i]||0));});
// total time per function (inclusive) via parent map
const parent=new Map();for(const n of profile.nodes)for(const c of n.children||[])parent.set(c,n.id);
const incl=new Map();for(const [id,t] of cnt){const n=byId.get(id);const k0=n.callFrame.functionName+' '+n.callFrame.url.split('/').slice(-1)[0]+':'+n.callFrame.lineNumber;self.set(k0,(self.get(k0)||0)+t);let cur=id;const seen=new Set();while(cur!==undefined){const m=byId.get(cur);const k=m.callFrame.functionName+' '+m.callFrame.url.split('/').slice(-1)[0]+':'+m.callFrame.lineNumber;if(!seen.has(k)){incl.set(k,(incl.get(k)||0)+t);seen.add(k);}cur=parent.get(cur);}}
const top=(m,n)=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>(v/1000|0)+'ms '+k).join('\n');
console.log('SELF\n'+top(self,25));console.log('INCL\n'+top(incl,400));const target=process.argv[3];if(target){const callers=new Map();for(const [id,t] of cnt){let cur=id,child=null;const chain=[];while(cur!==undefined){chain.push(byId.get(cur));cur=parent.get(cur);}const idx=chain.findIndex(n=>n.callFrame.functionName===target);if(idx<0)continue;const path=chain.slice(idx+1,idx+4).map(n=>n.callFrame.functionName+':'+n.callFrame.url.split('/').slice(-1)[0].split('?')[0]+':'+n.callFrame.lineNumber).join(' < ');callers.set(path,(callers.get(path)||0)+t);}console.log('CALLERS of',target);console.log(top(callers,15));}
const under=process.argv[4];if(under){const kids=new Map();for(const [id,t] of cnt){const chain=[];let cur=id;while(cur!==undefined){chain.push(byId.get(cur));cur=parent.get(cur);}const idx=chain.findIndex(n=>n.callFrame.functionName===under);if(idx<1)continue;const c=chain[idx-1];const k=c.callFrame.functionName+':'+c.callFrame.url.split('/').slice(-1)[0].split('?')[0]+':'+c.callFrame.lineNumber;kids.set(k,(kids.get(k)||0)+t);}console.log('CHILDREN of',under);console.log(top(kids,30));}
await b.close();
