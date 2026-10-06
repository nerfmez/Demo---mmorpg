// node scripts/review-encounter-farming.mjs progression-review.json recipe-decisions.json
import fs from 'node:fs';import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {createRng} from '../src/core/rng.js';
import {rollDrops} from '../src/core/crafting.js';
import {encounterLayout} from '../src/core/encounters.js';
const data=loadData(),sources={},defs=data.monsters.monsters;
const worlds=Object.fromEntries(Object.entries(data.maps).map(([k,w])=>[k,createWorld(w)]));
function addSpawn(map,spawn,kind){const wd=data.maps[map];const drops=[...defs[spawn.monster].drops,...wd.zoneDrops?.[spawn.zone]||[],...data.items.upgradeMaterialDrops];
 const source={key:[map,spawn.zone,spawn.monster].join('/'),map,zone:spawn.zone,monster:spawn.monster,level:spawn.level,count:spawn.count,kind,respawn:spawn.respawn||wd.respawnSeconds};
 for(const drop of drops)if(drop.item!=='gold'&&drop.chance>0&&drop.max>0){const row={...source,chance:drop.chance,quantity:[drop.min,drop.max],yield:drop.chance*(drop.min+drop.max)/2};(sources[drop.item]||=[]).push(row);}}
for(const [map,wd]of Object.entries(data.maps)){const layout=encounterLayout(worlds[map],data);for(const [index,s]of wd.spawns.entries())addSpawn(map,{...s,count:layout.points.filter(p=>p.group===index).length},'normal');for(const b of wd.bosses||[])addSpawn(map,{monster:b.monster,zone:worlds[map].zoneAt(...b.pos).id,level:[b.level,b.level],count:1,respawn:b.respawnSeconds},'boss');}
for(const list of Object.values(sources))list.sort((a,b)=>a.level[1]-b.level[1]||a.level[0]-b.level[0]||b.yield-a.yield||a.key.localeCompare(b.key));
const tested=JSON.parse(fs.readFileSync(process.argv[2] || 'progression-review.json')),monTimes={};for(const r of tested.results.filter(r=>r.won)){(monTimes[r.monster]||=[]).push(r.time);}const trialCount=1000,rows=[];
const percentile=(v,q)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(q*v.length))];
for(const [id,recipe]of Object.entries(data.recipes.recipes)){
 if(recipe.type!=='gear')continue;
 const itemLevel=recipe.itemLevel??data.items.gearBases[recipe.result].itemLevel;
 const materials=Object.entries(recipe.cost).filter(([m])=>m!=='gold').map(([m,n])=>({id:m,quantity:n,firstLevel:Math.min(...(sources[m]||[]).map(s=>s.level[0])),chosen:sources[m]?.[0]}));
 if(!materials.some(m=>m.firstLevel>itemLevel))continue;
 const groups={};for(const m of materials){if(!m.chosen)throw Error('No source: '+m.id);const group=groups[m.chosen.key]||={...m.chosen,wants:{}};group.wants[m.id]=m.quantity;}
 const kills=[],gold=[],seconds=[];let allTimesKnown=true;
 for(let trial=0;trial<trialCount;trial++){
  const rng=createRng((20261006^(trial*2654435761))>>>0);let totalKills=0,totalGold=0,totalSeconds=0;
  for(const group of Object.values(groups)){
   const got={},wd=data.maps[group.map],times=monTimes[group.monster],maxTime=times?Math.max(...times):null;if(maxTime===null)allTimesKnown=false;
   let n=0;while(Object.entries(group.wants).some(([m,qty])=>(got[m]||0)<qty)){
    if(++n>10000)throw Error('Sampling budget exceeded '+id+'/'+group.key);
    for(const d of rollDrops({...data,world:wd},group.monster,group.zone,rng))if(d.item==='gold')totalGold+=d.qty;else got[d.item]=(got[d.item]||0)+d.qty;
   }totalKills+=n;totalSeconds+=n*(maxTime||0);
  }kills.push(totalKills);gold.push(totalGold);seconds.push(totalSeconds);
 }
 const boss=Object.values(groups).filter(s=>s.kind==='boss').map(s=>s.monster);const relevantTypes=[...new Set(Object.values(groups).map(s=>s.monster))];
 rows.push({id,name:data.items.gearBases[recipe.result].nameTh,itemLevel,gold:recipe.cost.gold,boss,
  verdict:boss.length?'คงเป็นรางวัลหลังบอส; มีชุดก่อนบอสที่ไม่ใช้ชิ้นส่วนบอส':'คงสูตรเดิมในแพตช์; ตรวจเส้นทางอุปกรณ์ก่อนหน้าและคู่ต่อสู้แล้ว',
  caveat:boss.length?'ผลสู้บางกรณียังไม่ผ่าน; ไม่รับรองทุกบิลหรือทุกจังหวะ':'ผลสู้เป็นการแยกคู่ต่อสู้; ยังไม่ใช่การฟาร์มทั้งฝูงต่อเนื่อง',
  materials,sources:Object.values(groups),trials:trialCount,
  sampledMeanKills:+(kills.reduce((a,b)=>a+b,0)/trialCount).toFixed(1),medianKills:percentile(kills,.5),p90Kills:percentile(kills,.9),
  meanGoldDropped:+(gold.reduce((a,b)=>a+b,0)/trialCount).toFixed(1),
  combatOnlyMinutesUpperProxy:allTimesKnown?+(percentile(seconds,.9)/60).toFixed(1):null,
  fightCases:tested.results.filter(r=>relevantTypes.includes(r.monster)).map(r=>({level:r.level,kit:r.kit,monster:r.monster,seed:r.seed,won:r.won,time:r.time}))});
}
if(rows.length!==32)throw Error('Expected original 32 flagged recipes, found '+rows.length);
const report={method:'1,000 seeded samples per recipe using the unchanged rollDrops function, actual source maps and zones, no material-find bonus. Earliest bounded-level source chosen per material. Shared monster drops counted together. Kill counts are simulated farming effort, not observed player sessions. Timing proxy uses the slowest successful sampled duel for each monster and excludes walking, respawn waits and failures. Gold drops may not cover the entire preparation budget. Not a balance pass.',recipes:rows};
fs.writeFileSync(process.argv[3] || 'recipe-decisions.json',JSON.stringify(report,null,2));console.log(JSON.stringify({recipes:rows.length,normal:rows.filter(r=>!r.boss.length).length,boss:rows.filter(r=>r.boss.length).length,examples:rows.filter(r=>['gale_boots','greyfang_sabre','ancient_staff'].includes(r.id)).map(r=>({id:r.id,mean:r.sampledMeanKills,p90:r.p90Kills,gold:r.gold,goldDropped:r.meanGoldDropped,time:r.combatOnlyMinutesUpperProxy}))},null,2));
