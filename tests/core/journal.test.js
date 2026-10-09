import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,allocateJobNode,derive,jobNodeState} from '../../src/core/character.js';
import {clusterNodes,jobView} from '../../src/ui/jobview.js';
import {journalProgress,startingEntries,chapterSpreads} from '../../src/ui/skill-journal/model.js';
import {MOD_ART,MOD_GROUPS,MOD_GROUP_COLORS,GEM_TINTS} from '../../src/ui/gemart.js';
import {SIGILS} from '../../src/ui/sigils.js';
import {art,hasArt} from '../../src/ui/art.js';

test('rebalance retains legacy content IDs and optional chapter navigation',()=>{
 const originals=Object.entries(data.jobtree.nodes).filter(([id])=>!/_t[2-6]_/.test(id)&&!data.jobtree.nodes[id].stage);
 assert.equal(originals.length,87);
 for(const [id,n] of originals){assert.ok(data.jobtree.sections[n.section],id);assert.ok(n.links.every(id=>data.jobtree.nodes[id]));}
 for(const group of data.jobtree.groups){assert.equal(data.jobtree.nodes[group.job].type,'job');assert.equal(data.jobtree.nodes[group.job].branch,group.id);}
});
test('themed chapters have mixed investments rather than renamed single-stat categories',()=>{
 for(const c of data.jobtree.constellations){
  assert.ok(c.nameTh.length>4);assert.ok(!['ต่อเนื่อง','ประชิด','วงกว้าง','กระสุน','ควบคุม','ป้องกัน','เคลื่อนที่'].includes(c.nameTh));
  assert.ok(SIGILS[c.icon]);assert.ok(c.mapPos.every(Number.isFinite));
  const ns=Object.values(data.jobtree.nodes).filter(n=>n.category===c.id);
  assert.ok(new Set(ns.flatMap(n=>Object.keys(n.effects))).size>=3,c.id+' has mixed effects');
 }
 const camp=clusterNodes(data.jobtree,'melee');
 assert.ok(camp.some(([,n])=>'maxHpPct' in n.effects));
 assert.ok(camp.some(([,n])=>'meleeDamagePct' in n.effects));
});
test('players invest selectively across chapters without completing any chapter',()=>{
 const ch=createCharacter(data);ch.jobLevel=18;ch.jobPoints=12;const stat=ch.statPoints;
 for(const id of ['v1','a1','r1','f_hp'])assert.ok(allocateJobNode(ch,data,id).done,id);
 assert.equal(ch.jobPoints,8);assert.equal(ch.statPoints,stat);
 assert.ok(!ch.jobNodes.includes('v2'));assert.ok(!ch.jobNodes.includes('a2'));assert.ok(!ch.jobNodes.includes('r2'));
 assert.ok(!jobNodeState(ch,data,'aoe_master').can,'cannot skip the path to an endpoint');
 assert.ok(derive(ch,data).maxHp>derive(createCharacter(data),data).maxHp);
});
test('journal starts at real shared links and indexes every current node without mutation',()=>{
 const ch=createCharacter(data),before=JSON.stringify({ch,tree:data.jobtree});
 const ui={game:{ch,data},sel:{},overlay:{clientWidth:1180}};
 assert.match(jobView(ui),/skill-journal/);assert.ok(!jobView(ui).includes('seeker-constellation'));
 const start=startingEntries(data.jobtree).map(([id])=>id);
 assert.equal(start.length,6);assert.ok(start.includes(data.jobtree.origin));
 assert.ok(start.includes('lesson.prepare'));
 for(const leafSize of [4,6]){
  const indexes=journalProgress(ch,data).stages.flatMap(s=>chapterSpreads(data.jobtree,s.tier,leafSize).flatMap(p=>p.flatMap(l=>l.entries.map(([id])=>id))));
  const active=data.jobtree.presentation.stages.flatMap(s=>s.nodes||s.paths.flatMap(p=>p.nodes));
  assert.equal(indexes.length,active.length);
  assert.equal(new Set(indexes).size,indexes.length);
  assert.deepEqual([...indexes].sort(),active.sort());
 }
 assert.equal(JSON.stringify({ch,tree:data.jobtree}),before);
});
test('all journal chapters are open while retained legacy eligibility remains compatible',()=>{
 const ch=createCharacter(data);ch.jobLevel=18;ch.jobPoints=17;
 assert.deepEqual(journalProgress(ch,data).stages.map(s=>s.requiresSpent),[0,0,0,0,0]);
 assert.equal(journalProgress(ch,data).current.tier,5);
 for(const id of ['v1','a1','r1'])assert.ok(allocateJobNode(ch,data,id).done);
 assert.equal(journalProgress(ch,data).current.tier,5);
 // Existing tier-I section gates remain independent from a chapter's minimum.
 const gated=Object.entries(data.jobtree.nodes).find(([,n])=>data.jobtree.sections[n.section].tier===1&&data.jobtree.sections[n.section].requiresSpent===3);
 const fresh=createCharacter(data);fresh.jobPoints=17;fresh.jobLevel=18;
 assert.equal(jobNodeState(fresh,data,gated[0]).reason,'tier_points');
 assert.equal(journalProgress(fresh,data).stages[0].unlocked,true);
});
test('all mod items use distinct engravings on coins, not gems',()=>{
 assert.equal(Object.keys(MOD_ART).length,Object.keys(data.mods.mods).length);
 assert.deepEqual(Object.keys(MOD_ART).sort(),Object.keys(data.mods.mods).sort());
 assert.equal(new Set(Object.keys(MOD_ART).map(k=>SIGILS[k])).size,Object.keys(data.mods.mods).length);
 for(const id of Object.keys(data.mods.mods)){
  assert.ok(hasArt('mod',id));const svg=art('mod',id);
  assert.ok(svg.includes(`data-mod-symbol="${id}"`));
  assert.ok(svg.includes(`data-mod-coin="${id}"`));
  assert.ok(!/<image|<img|https:|filter=/.test(svg));
  assert.ok(!svg.includes('data-gem='));assert.ok(svg.includes(MOD_ART[id]));
 }
});

test('mod coin classification is ability-based with exactly three colors',()=>{
 assert.deepEqual(Object.keys(MOD_GROUPS).sort(),Object.keys(data.mods.mods).sort());
 assert.deepEqual([...new Set(Object.values(MOD_GROUPS))].sort(),['attack','mechanics','support']);
 assert.equal(new Set(Object.values(GEM_TINTS)).size,3);
 assert.equal(MOD_GROUPS.frost_shift,'mechanics');assert.equal(MOD_GROUPS.burning_ground,'mechanics');
 assert.equal(MOD_GROUPS.concentrated,'attack');assert.equal(MOD_GROUPS.life_leech,'support');
 for(const[id,group]of Object.entries(MOD_GROUPS)){assert.match(MOD_ART[id],new RegExp('data-mod-group="'+group+'"'));assert.ok(MOD_ART[id].includes(MOD_GROUP_COLORS[group]));}
});
