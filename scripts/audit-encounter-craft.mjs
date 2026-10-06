// Read-only report: node scripts/audit-encounter-craft.mjs [output-directory]
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadData} from '../src/core/data-node.js';
import {createWorld} from '../src/core/world.js';
import {Game} from '../src/core/game.js';
import {Game as Baseline} from '../src/core/game-simulation.js';
import {encounterCraftAudit} from '../src/core/encounter-audit.js';
import {compareCraftRecipes,recipeEquipmentLevel,skillCraftGuide} from '../src/core/craft-order.js';
const data=loadData(),out=resolve(process.argv[2]||'tests/browser/out/encounter-audit');mkdirSync(out,{recursive:true});
const worlds=Object.fromEntries(Object.entries(data.maps).map(([id,w])=>[id,createWorld(w)]));
const audit=encounterCraftAudit(data,worlds),csv=rows=>'\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
const write=(name,value)=>writeFileSync(resolve(out,name),value);
const layouts=Object.entries(worlds).map(([id,world])=>{
 const d={...data,world:world.data};
 const points=g=>g.spawnPoints.map(p=>({monster:p.monster,zone:p.zone,x:p.x,z:p.z,level:p.level,boss:!!p.boss}));
 return {map:id,seed:12345,before:points(new Baseline(d,{world,seed:12345})),after:points(new Game(d,{world,seed:12345}))};
});
write('audit.json',JSON.stringify(audit,null,2));write('before-after-points.json',JSON.stringify(layouts,null,2));
const monsters=[['map','zone','monster','name','level_min','level_max','before_seed12345','after','habitat','drops','recipe_consumers']];
for(const m of audit.monsters){const l=layouts.find(l=>l.map===m.map),mats=Object.keys(audit.sources).filter(k=>audit.sources[k].some(s=>s.map===m.map&&s.zone===m.zone&&s.monster===m.monster));monsters.push([m.map,m.zone,m.monster,data.monsters.monsters[m.monster].nameTh,...m.level,l.before.filter(p=>p.zone===m.zone&&p.monster===m.monster).length,m.points,m.habitats.join(' | '),mats.join(' | '),[...new Set(mats.flatMap(k=>audit.consumers[k]))].join(' | ')]);}
write('monsters-before-after.csv',csv(monsters));
const ingredients=[['recipe','type','equipment_level','material','quantity','first_monster_level','sources','review_only']];
for(const r of audit.recipes)for(const m of r.materials)ingredients.push([r.id,r.type,r.equipmentLevel,m.material,m.quantity,m.firstMonsterLevel,m.sources.map(s=>`${s.map}/${s.zone}/${s.monster} Lv.${s.level.join('-')}`).join(' | '),m.laterThanEquipment||m.noMonsterSource]);
write('recipe-material-access.csv',csv(ingredients));
const order=[['type','order','recipe','result','equipment_level','stage','role','condition']];
for(const type of ['gear','skill','movement'])Object.entries(data.recipes.recipes).filter(([,r])=>r.type===type).sort((a,b)=>compareCraftRecipes(data,a,b)).forEach(([id,r],i)=>{const g=type==='gear'?null:skillCraftGuide(data,r);order.push([type,i+1,id,r.result,type==='gear'?recipeEquipmentLevel(data,r):'',g?g.stage+1:'',g?.roleName,g?.condition]);});
write('craft-order.csv',csv(order));console.log(JSON.stringify({out,...audit.summary,populations:layouts.map(l=>({map:l.map,before:l.before.length,after:l.after.length}))},null,2));
