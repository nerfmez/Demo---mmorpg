import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {data} from './helpers.js';
import {art,atlasMonsterArt,atlasRegionArt} from '../../src/ui/art.js';
import {MONSTER_PORTRAITS,SHARED_MONSTER_PORTRAITS,REGION_PORTRAITS,rasterIconUrl} from '../../src/ui/raster-icons.js';

test('Atlas portraits cover every live spawn, boss and map-qualified region',()=>{
 const monsters=new Set(),regions=[];
 for(const map of Object.values(data.maps)){
  for(const spawn of [...map.spawns,...map.bosses])monsters.add('monster/'+spawn.monster);
  for(const zone of map.zones)regions.push('region/'+map.id+'/'+zone.id);
 }
 assert.equal(monsters.size,21);assert.equal(regions.length,22); // + Moonroot Grove: 3 monsters, 5 regions
 assert.deepEqual(Object.keys(MONSTER_PORTRAITS).sort(),[...monsters].sort());
 assert.deepEqual(Object.keys(REGION_PORTRAITS).sort(),regions.sort());
 assert.deepEqual(Object.keys(SHARED_MONSTER_PORTRAITS).sort(),['salt_slime','tusk_boar','thornback_wolf','greyfang','reed_viper','marsh_wisp'].map(id=>'monster/'+id).sort());
 for(const key of monsters){const id=key.slice(8);assert.match(atlasMonsterArt(id),/<img /);assert.match(art('monster',id),SHARED_MONSTER_PORTRAITS[key]?/<img /:/<svg/,'shared art follows approved identity scope');}
 for(const key of regions){const[,map,id]=key.split('/');assert.match(atlasRegionArt(map,id),/<img /);}
 assert.notEqual(atlasRegionArt('azure-harbor-v1','forest'),atlasRegionArt('frontier-wilds-v1','forest'));
});
test('Atlas opt-in paths support hosting prefixes and authored fallback',()=>{
 assert.match(atlasMonsterArt('moss_beetle',{}),/<svg/);
 assert.match(atlasMonsterArt('tusk_boar',{}),/<img /,'approved shared identity remains consistent when Atlas registry falls back');
 assert.match(atlasRegionArt('azure-harbor-v1','forest',{}),/<svg/);
 assert.equal(rasterIconUrl('monster','tusk_boar',MONSTER_PORTRAITS,'/demo/'),'/demo/assets/icons/monster/tusk_boar.png');
 assert.equal(rasterIconUrl('region','azure-harbor-v1/forest',REGION_PORTRAITS,'/demo/'),'/demo/assets/icons/region/azure-harbor-v1/forest.png');
 assert.equal(rasterIconUrl('monster','tusk_boar'),null,'global art has no portrait opt-in');
});
test('Atlas assets match deterministic source manifests and contain real RGBA PNGs',()=>{
 for(const [folder,registry] of [['atlas-monsters',MONSTER_PORTRAITS],['atlas-regions',REGION_PORTRAITS]]){
  const manifest=JSON.parse(readFileSync(new URL('../../assets/'+folder+'/manifest.json',import.meta.url)));
  for(const sheet of manifest.sheets){
   const source=readFileSync(new URL('../../'+sheet.path,import.meta.url));
   assert.equal(createHash('sha256').update(source).digest('hex'),sheet.sha256);
   for(const cell of sheet.cells){
    const kind=cell.map?'region':'monster',id=cell.map?cell.map+'/'+cell.id:cell.id,key=kind+'/'+id;
    assert.equal(registry[key],'assets/icons/'+key+'.png');
    const png=readFileSync(new URL('../../'+cell.path,import.meta.url));
    assert.equal(createHash('sha256').update(png).digest('hex'),cell.sha256,key);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[256,256]);assert.equal(png[25],6);
    assert.equal(cell.alpha_extrema[0],0);assert.ok(cell.alpha_extrema[1]>240);
   }
  }
 }
});
