// node tests/browser/movement-stutter-summary.mjs <probe.json> > summary.json
import { readFileSync } from 'node:fs';
const q=JSON.parse(readFileSync(process.argv[2],'utf8'));
const stats=values=>{
 const a=[...values].sort((x,y)=>x-y),round=n=>Math.round(n*100)/100;
 return a.length?{count:a.length,p50:round(a[Math.floor(a.length*.5)]),p95:round(a[Math.floor(a.length*.95)]),max:round(a.at(-1))}:null;
};
const phases=[...new Set(q.rows.map(r=>r.phase))].filter(p=>/^(dash|roll|blink|leap)-/.test(p));
const report={renderer:q.renderer,cases:q.cases,errors:q.errors,resources:q.resources,cleanup:q.cleanup,pools:q.pools,echoPool:q.echoPool,route:q.route,phases:{}};
for(const phase of phases){
 const rows=q.rows.filter(r=>r.phase===phase),frames=q.frames.filter(r=>r.phase===phase);
 const input=rows.find(r=>r.key==='game.useMovement');
 report.phases[phase]={frameMs:stats(frames.map(r=>r.ms)),longTasks:q.long.filter(r=>r.phase===phase),inputToNextFrameMs:input?Math.round((frames.find(f=>f.start>=input.start)?.start-input.start)*100)/100:null,
  geometries:frames.length&&frames[0].geometries!==undefined?{min:Math.min(...frames.map(f=>f.geometries)),max:Math.max(...frames.map(f=>f.geometries)),end:frames.at(-1).geometries}:null,
  cpu:Object.fromEntries([...new Set(rows.map(r=>r.key))].map(key=>[key,stats(rows.filter(r=>r.key===key).map(r=>r.ms))]))};
}
console.log(JSON.stringify(report,null,2));
