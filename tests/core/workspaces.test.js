import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {CHARACTER_VERSION,createCharacter,derive,allocateJobNode,jobNodeState,migrateCharacter} from '../../src/core/character.js';
import {modFits,socketMod,computeSkill,unsocketMod} from '../../src/core/skills.js';
import {TAGS,modRules,modStatus,skillMeta} from '../../src/ui/buildmeta.js';
import {clusterNodes} from '../../src/ui/jobview.js';
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
 const t=data.jobtree;assert.equal(t.constellations.length,10);
 for(const [id,n]of Object.entries(t.nodes)){
  assert.ok(t.constellations.some(c=>c.id===n.category),id);
  assert.equal(n.clusterPos.length,2);assert.ok(n.clusterPos.every(Number.isFinite));
 }
 // 242 original nodes plus the generated build lines (scripts/journal-lines.mjs).
 assert.equal(Object.keys(t.nodes).length,242+Object.values(t.nodes).filter(n=>n.line).length);
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
 assert.deepEqual(old.jobNodes,['origin','a1','a2','aj']);assert.equal(old.version,CHARACTER_VERSION);
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

