import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {data} from './helpers.js';
import {RASTER_ICONS,EXPECTED_RASTER_KEYS,rasterIconUrl,rasterIconMarkup} from '../../src/ui/raster-icons.js';
import {art} from '../../src/ui/art.js';
test('raster contract covers every equipment/material/combat/movement ID exactly once, excluding mods',()=>{
 const expected=[...Object.keys(data.items.gearBases).map(id=>'gear/'+id),...Object.keys(data.items.materials).map(id=>'material/'+id),...Object.keys(data.skills.combat).map(id=>'skill/'+id),...Object.keys(data.skills.movement).map(id=>'skill/'+id)];
 assert.equal(expected.length,76);assert.deepEqual([...EXPECTED_RASTER_KEYS].sort(),expected.sort());assert.equal(new Set(EXPECTED_RASTER_KEYS).size,76);assert.deepEqual(Object.keys(RASTER_ICONS).sort(),expected.sort());
});
test('only registered supplied PNGs replace existing illustrations; unknown/mod entries cannot opt in',()=>{
 for(const key of EXPECTED_RASTER_KEYS){const [kind,id]=key.split('/');if(!RASTER_ICONS[key]){assert.equal(rasterIconUrl(kind,id),null);assert.match(art(kind,id),/<svg/);}}
 const fixture={'skill/slash':'assets/icons/skill/slash.png','mod/split':'assets/icons/mod/split.png'};
 assert.equal(rasterIconUrl('skill','slash',fixture,'/demo/'),'/demo/assets/icons/skill/slash.png');
 assert.match(rasterIconMarkup('skill','slash','',fixture),/<img .*alt=""/);assert.equal(rasterIconUrl('mod','split',fixture),null);
 assert.equal(rasterIconUrl('gear','rusty_sword',{}),null);assert.equal(rasterIconMarkup('gear','rusty_sword','',{}),null);assert.equal(rasterIconUrl('gear','missing',{}),null);assert.throws(()=>art('gear','missing'),/Missing authored artwork/);
 assert.throws(()=>rasterIconUrl('skill','slash',{'skill/slash':'https://invalid/icon.png'}),/Invalid raster icon path/);
});
test('every registered image is a real nonempty PNG in public, never a missing or SVG stand-in',()=>{
 for(const[key,path]of Object.entries(RASTER_ICONS)){assert.ok(EXPECTED_RASTER_KEYS.includes(key),key);const file=new URL('../../public/'+path,import.meta.url);assert.ok(existsSync(file),path);const b=readFileSync(file);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);}
});

test('registered supplied PNGs match the retained delivery hashes and coverage',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../docs/icon-assets-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.pending_count,0);assert.equal(new Set(manifest.verified_assets.map(a=>a.sha256)).size,76);assert.equal(Object.keys(RASTER_ICONS).length,manifest.verified_assets.length);
 for(const a of manifest.verified_assets){assert.equal(RASTER_ICONS[a.key],a.path);const bytes=readFileSync(new URL('../../public/'+a.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256,a.key);}
});
