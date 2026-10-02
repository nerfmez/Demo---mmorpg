import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,allocateJobNode,derive,jobNodeState} from '../../src/core/character.js';
import {clusterNodes,jobView} from '../../src/ui/jobview.js';
import {MOD_ART} from '../../src/ui/gemart.js';
import {SIGILS} from '../../src/ui/sigils.js';
import {art,hasArt} from '../../src/ui/art.js';

test('rebalance retains legacy content IDs and optional chapter navigation',()=>{
 const originals=Object.entries(data.jobtree.nodes).filter(([id])=>!/_t[2-6]_/.test(id));
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
test('opening a chapter gives no bonus and opens neither permanent inspector nor all-node view',()=>{
 const ch=createCharacter(data),ui={game:{ch,data},sel:{},overlay:{clientWidth:1180}};
 const before=JSON.stringify(ch);const format=(k,v)=>k+' '+v;
 const over=jobView(ui,{effectText:format});
 assert.equal((over.match(/class="seeker-constellation /g)||[]).length,10);
 assert.ok(!over.includes('class="journal-inspector'));
 ui.sel.constellation='area';const sub=jobView(ui,{effectText:format});
 assert.equal((sub.match(/class="seeker-node /g)||[]).length,8);
 assert.ok(!sub.includes('class="journal-inspector'));assert.equal(JSON.stringify(ch),before);
 assert.ok(sub.includes('journal-gateway'),'cross-chapter prerequisites stay reachable');
});
test('all fifteen mod item drawings share the gem engraving renderer, not raster illustrations',()=>{
 assert.equal(Object.keys(MOD_ART).length,15);
 assert.deepEqual(Object.keys(MOD_ART).sort(),Object.keys(data.mods.mods).sort());
 assert.equal(new Set(Object.keys(MOD_ART).map(k=>SIGILS[k])).size,15);
 for(const id of Object.keys(data.mods.mods)){
  assert.ok(hasArt('mod',id));const svg=art('mod',id);
  assert.ok(svg.includes(`data-gem="${id}"`));
  assert.ok(!/<image|<img|https:|filter=/.test(svg));
  assert.ok(svg.includes('stroke="currentColor"'));assert.ok(svg.includes(MOD_ART[id]));
 }
});

