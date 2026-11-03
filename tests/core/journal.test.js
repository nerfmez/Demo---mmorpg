import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {MOD_ART,MOD_GROUPS,MOD_GROUP_COLORS,GEM_TINTS} from '../../src/ui/gemart.js';
import {SIGILS} from '../../src/ui/sigils.js';
import {art,hasArt} from '../../src/ui/art.js';

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
 assert.equal(MOD_GROUPS.frost_shift,'mechanics');assert.equal(MOD_GROUPS.fire_shift,'mechanics');
 assert.equal(MOD_GROUPS.concentrated,'attack');assert.equal(MOD_GROUPS.life_leech,'support');
 for(const[id,group]of Object.entries(MOD_GROUPS)){assert.match(MOD_ART[id],new RegExp('data-mod-group="'+group+'"'));assert.ok(MOD_ART[id].includes(MOD_GROUP_COLORS[group]));}
});
