import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,derive,allocateJobNode,jobNodeState,migrateCharacter} from '../../src/core/character.js';
import {modFits,socketMod,computeSkill,unsocketMod} from '../../src/core/skills.js';
import {TAGS,FILTERS,tagsHtml,modRules,modRuleChips,rulesHtml,modStatus,skillMeta} from '../../src/ui/buildmeta.js';
import {clusterNodes,jobView} from '../../src/ui/jobview.js';
import {optionList} from '../../src/ui/progressionview.js';
function fixture(id='venom_mire',mods=[]) {
 const ch=createCharacter(data); for(const k in ch.stats)ch.stats[k]=20;
 ch.skills[id]=1;ch.slots[0]={skill:id,mods:[]};ch.mods=mods.map((id,i)=>({id,uid:100+i,level:1}));
 ch.slots[0].mods=ch.mods.map(m=>m.uid);
 return {ch,skill:()=>computeSkill(ch,data,derive(ch,data),0)};
}
test('every skill, movement and mod has a known visible type and complete rule vocabulary',()=>{
 for(const def of [...Object.values(data.skills.combat),...Object.values(data.skills.movement),...Object.values(data.mods.mods)]) {
  assert.ok(def.tags.length>0,def.name);
  for(const tag of [...def.tags,...(def.requiresAll||[]),...(def.requiresAny||[]),...(def.excludes||[])])assert.ok(TAGS[tag],tag);
 }
 for(const def of Object.values(data.skills.combat))assert.ok(!skillMeta(def).includes('<details'),def.name+' types must not be collapsed');
 assert.ok(data.skills.combat.venom_mire.tags.includes('DoT'));
 assert.ok(!data.skills.combat.healing_spring.tags.includes('DoT'));
 assert.ok(!data.skills.combat.hex.tags.includes('Persistent'));
});
test('constellations cover every node and specialist subviews preserve the four jobs',()=>{
 const t=data.jobtree;assert.equal(t.constellations.length,11);
 for(const [id,n]of Object.entries(t.nodes)){
  assert.ok(t.constellations.some(c=>c.id===n.category),id);
  assert.equal(n.clusterPos.length,2);assert.ok(n.clusterPos.every(Number.isFinite));
 }
 assert.equal(Object.keys(t.nodes).length,225);
 for(const [id,n] of Object.entries(t.nodes)){
  assert.ok(t.sections[n.section],id+' belongs to a major section');
  assert.ok(!('tier' in n)&&!('requiresSpent' in n),id+' has no individual stage gate');
 }
 for(const group of t.groups){const ns=clusterNodes(t,'specialist',group.id);assert.equal(ns.length,37);assert.ok(ns.some(([id])=>id===group.job));}
});
test('new small stat nodes spend Job Points only and retain old saved nodes',()=>{
 const ch=createCharacter(data);ch.jobPoints=20;const before=ch.statPoints;
 assert.ok(allocateJobNode(ch,data,'f_hp').done);assert.equal(ch.statPoints,before);assert.equal(ch.jobPoints,19);
 const base=createCharacter(data);assert.equal(derive(ch,data).maxHp-derive(base,data).maxHp,12);
 const old={...ch,jobNodes:['origin','a1','a2','aj'],jobLevel:8};migrateCharacter(old,data);
 assert.deepEqual(old.jobNodes,['origin','a1','a2','aj']);assert.equal(old.version,4);
 assert.equal(data.jobtree.sections[data.jobtree.nodes.aoe_master.section].tier,4);assert.equal(data.jobtree.sections[data.jobtree.nodes.aoe_master.section].requiresSpent,17);assert.equal(jobNodeState(ch,data,'aoe_master').reason,'tier_points');
});
test('mod compatibility uses all/any/excludes and explanations expose each rule',()=>{
 const S=data.skills.combat,M=data.mods.mods;
 assert.ok(modFits(S.firebolt,M.split).ok);assert.ok(!modFits(S.slash,M.split).ok);
 assert.ok(modFits(S.chain_spark,M.bounce).ok);assert.ok(!modFits(S.slash,M.bounce).ok);
 assert.ok(!modFits(S.ward,M.echo).ok);assert.ok(modRules(M.echo).some(r=>r.includes('ใช้ไม่ได้')));
 assert.ok(modRules(M.cast_on_dodge).some(r=>r.includes('อย่างน้อยหนึ่ง')));
 assert.ok(!modFits(null,M.split).ok);
});
test('type chips match native eligibility and keep physical damage separate from spell type',()=>{
 assert.equal(TAGS.Attack,'กายภาพ');assert.equal(TAGS.Projectile,'โปรเจกไทล์');
 for(const tag of ['Attack','Spell','Projectile','Area'])assert.ok(FILTERS.some(([id])=>id===tag));
 const stone=skillMeta(data.skills.combat.stone_burst);
 assert.match(stone,/data-skill-tag="Spell"/);assert.match(stone,/data-skill-tag="Area"/);
 assert.match(stone,/data-damage-element="physical"/);assert.doesNotMatch(stone,/data-skill-tag="Attack"/);
 for(const mod of Object.values(data.mods.mods)){
  const html=modRuleChips(mod),full=rulesHtml(mod);
  for(const [key,rule] of [['requiresAll','all'],['requiresAny','any'],['excludes','exclude']])for(const tag of mod[key]||[]){
   assert.match(html,new RegExp('data-mod-rule="'+rule+'"'));
   assert.ok(html.includes('data-skill-tag="'+tag+'"'));
  }
  assert.match(full,/data-tag-scope="mod"/);assert.doesNotMatch(full,/<details/);
 }
 assert.match(tagsHtml(['Area'],'added'),/data-tag-scope="added"/);
 const split=data.mods.mods.split;assert.ok(!modFits(data.skills.combat.slash,split).ok,'shown Projectile requirement still cannot be bypassed by an added tag');
});
test('current element chips, crafting options and tree inspection share visible elemental names',()=>{
 for(const tag of ['Physical','Fire','Cold','Lightning','Earth','Poison','Arcane'])assert.ok(FILTERS.some(([id])=>id===tag));
 const f=fixture('firebolt',['frost_shift','burning_ground']),html=skillMeta(data.skills.combat.firebolt,f.skill());
 const current=html.match(/data-tag-scope="element">([\s\S]*?)<\/div>/)[1];
 assert.match(current,/data-element-tag="Cold"/);assert.doesNotMatch(current,/data-element-tag="Fire"/);
 assert.match(html,/data-tag-scope="secondary"/);assert.match(html,/เปลี่ยนจาก ไฟ → น้ำแข็ง/);
 const opts=optionList(data,[{id:'fire_pct',value:5}]);assert.match(opts,/data-element-tag="Fire"/);assert.match(opts,/ดาเมจไฟ/);
 const ui={game:{ch:f.ch,data},sel:{constellation:'elements',node:'element_fire_1'},overlay:{clientWidth:1180}};
 const tree=jobView(ui,{effectText:(key,n)=>key+' '+n});assert.match(tree,/data-tag-scope="node"/);assert.match(tree,/data-element-tag="Fire"/);
 ui.sel.nodeSearch='ไฟ';const found=jobView(ui,{effectText:(key,n)=>key+' '+n});assert.match(found,/data-id="element_fire_1"/);
});
test('Lingering needs an actual lasting field, not just any damage or a curse',()=>{
 const S=data.skills.combat,M=data.mods.mods;
 for(const id of ['slash','firebolt','hex','ward','war_cry'])assert.ok(!modFits(S[id],M.lingering).ok,id);
 for(const id of ['venom_mire','healing_spring'])assert.ok(modFits(S[id],M.lingering).ok,id);
 assert.ok(modFits(S.slash,M.lingering,[M.burning_ground]).ok);
 const {ch,skill}=fixture('firebolt',['burning_ground','lingering']);assert.equal(skill().ground.duration,4.5);
 unsocketMod(ch,100);assert.ok(!skill().mods.find(m=>m.id==='lingering').active);
 assert.ok(!modStatus(ch,data,0,ch.mods[1]).active);
});
test('AoE, field DoT and control passives change supported effects without changing unrelated skills',()=>{
 const {ch,skill}=fixture(),before=skill();ch.jobNodes.push('dot_power','lasting_time','aoe_radius');const after=skill();
 assert.ok(Math.abs(after.damage/before.damage-1.05)<1e-8);assert.ok(Math.abs(after.duration/before.duration-1.06)<1e-8);assert.ok(Math.abs(after.radius/before.radius-1.04)<1e-8);
 const heal=fixture('healing_spring'),h0=heal.skill().heal;heal.ch.jobNodes.push('dot_power');assert.equal(heal.skill().heal,h0);
 const hex=fixture('hex'),t=hex.skill().duration;hex.ch.jobNodes.push('cc_time');assert.equal(hex.skill().duration,t*1.05);
 const buff=fixture('war_cry'),b0=buff.skill().duration;buff.ch.jobNodes.push('cc_time','lasting_time');assert.equal(buff.skill().duration,b0);
});
test('ground duration/radius compilation is independent of socket order and DoT does not double dip',()=>{
 const {ch,skill}=fixture('stone_burst',['burning_ground','concentrated']);const a=skill();ch.slots[0].mods.reverse();const b=skill();assert.equal(a.ground.radius,b.ground.radius);assert.equal(a.damage,b.damage);
 const f=fixture('firebolt',['burning_ground']);const base=f.skill();f.ch.jobNodes.push('dot_power');const inc=f.skill();assert.ok(Math.abs((inc.damage*inc.ground.dpsMult)/(base.damage*base.ground.dpsMult)-1.05)<1e-8);
 for(const id of ['burning_ground','knockback','life_leech','frost_shift'])assert.ok(!modFits(data.skills.combat.venom_mire,data.mods.mods[id]).ok,id+' is on-hit only');
});
test('mod UI distinguishes incompatible type, full sockets and stat-inactive storage',()=>{
 const {ch}=fixture('firebolt',['split']);ch.stats.DEX=1;ch.slots[0].mods=[];
 let state=modStatus(ch,data,0,ch.mods[0]);assert.ok(state.can);assert.ok(!state.req.ok);
 assert.ok(socketMod(ch,data,0,100).ok);state=modStatus(ch,data,0,ch.mods[0]);assert.ok(state.own);assert.ok(!state.active);
 ch.mods.push({id:'pierce',uid:101,level:1},{id:'burning_ground',uid:102,level:1});socketMod(ch,data,0,101);
 state=modStatus(ch,data,0,ch.mods[2]);assert.ok(state.fit.ok);assert.ok(!state.can);assert.match(state.reason,/เต็ม/);
});
