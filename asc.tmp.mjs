import {loadData} from './src/core/data-node.js';
import {createWorld} from './src/core/world.js';
const [drop,box]=process.argv.slice(2);const data=loadData();const map=structuredClone(data.world);
if(drop!=='none'){map.acceptedScenes.connectors=map.acceptedScenes.connectors.filter(c=>c.id!==drop);map.roads=map.roads.filter(r=>r.id!==drop);}
const w=createWorld(map),[x0,x1,z0,z1,st]=box.split(',').map(Number);
const ch=h=>h< -0.45?'~':h<0.3?'.':h<1?':':h<2?'-':h<3?'=':h<4?'+':h<5?'*':h<6?'#':h<7?'%':'@';
const c=data.world.acceptedScenes.connectors.find(c=>c.id===drop)||{points:[]};
const on=(x,z)=>c.points.some(p=>Math.abs(p[0]-x)<st/2+.5&&Math.abs(p[1]-z)<st/2+.5);
for(let z=z0;z<=z1;z+=st){let r=String(z).padStart(5)+' ';for(let x=x0;x<=x1;x+=st)r+=on(x,z)?'o':ch(w.terrainY(x,z));console.log(r);}
