import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {data} from './helpers.js';
import {RASTER_ICONS,EXPECTED_RASTER_KEYS,rasterIconUrl,rasterIconMarkup} from '../../src/ui/raster-icons.js';
import {art,arrowArt} from '../../src/ui/art.js';
const manifest=JSON.parse(readFileSync(new URL('../../docs/icon-assets-manifest.json',import.meta.url),'utf8'));
const assets=new Map(manifest.verified_assets.map(a=>[a.key,a]));
function alphaPixels(png){
 // The delivery contract is non-interlaced, 8-bit RGBA. Decode the real alpha
 // rather than trusting a manifest claim or the PNG color-type field alone.
 assert.equal(png[24],8);assert.equal(png[25],6);assert.equal(png[28],0);
 const w=png.readUInt32BE(16),h=png.readUInt32BE(20),chunks=[];
 for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=w*4;let previous=Buffer.alloc(stride),offset=0,clear=0,partial=0,min=255,max=0;
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<h;y++){
  const filter=raw[offset++],row=Buffer.allocUnsafe(stride);assert.ok(filter<=4);
  for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0,p=filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0;row[x]=(raw[offset++]+p)&255;if((x&3)===3){const v=row[x];min=Math.min(min,v);max=Math.max(max,v);if(v===0)clear++;else if(v<255)partial++;}}
  previous=row;
 }
 return {extrema:[min,max],clear,partial};
}
test('raster contract covers the 122 supplied equipment/material/ammunition/combat/movement IDs exactly once, excluding mods',()=>{
 const all=[...Object.keys(data.items.gearBases).map(id=>'gear/'+id),...Object.keys(data.items.materials).map(id=>'material/'+id),...Object.keys(data.items.arrows.types).map(id=>'arrow/'+id),...Object.keys(data.skills.combat).map(id=>'skill/'+id),...Object.keys(data.skills.movement).map(id=>'skill/'+id)];
 assert.equal(new Set(EXPECTED_RASTER_KEYS).size,122);assert.deepEqual(Object.keys(RASTER_ICONS).sort(),[...EXPECTED_RASTER_KEYS].sort());
 assert.deepEqual([...EXPECTED_RASTER_KEYS].sort(),all.sort());
 for(const id of Object.keys(data.items.arrows.types))assert.match(arrowArt(id),/<img /,id+' uses supplied raster');
 for(const id of Object.keys(data.items.gearBases))assert.match(art('gear',id),/<img /,id+' uses supplied raster');
 // Content added after the approved set keeps its authored SVG until a PNG is supplied.
 for(const key of all.filter(k=>!EXPECTED_RASTER_KEYS.includes(k))){const [kind,id]=key.split('/');assert.equal(rasterIconUrl(kind,id),null,key);assert.match(art(kind,id),/<svg/,key);}
});
test('only registered supplied PNGs replace existing illustrations; unknown/mod entries cannot opt in',()=>{
 for(const key of EXPECTED_RASTER_KEYS){const [kind,id]=key.split('/');if(!RASTER_ICONS[key]){assert.equal(rasterIconUrl(kind,id),null);assert.match(art(kind,id),/<svg/);}}
 const fixture={'skill/slash':'assets/icons/skill/slash.png','mod/split':'assets/icons/mod/split.png'};
 assert.equal(rasterIconUrl('skill','slash',fixture,'/demo/'),'/demo/assets/icons/skill/slash.png');
 assert.match(rasterIconMarkup('skill','slash','',fixture),/<img .*alt=""/);assert.equal(rasterIconUrl('mod','split',fixture),null);
 assert.equal(rasterIconUrl('gear','rusty_sword',{}),null);assert.equal(rasterIconMarkup('gear','rusty_sword','',{}),null);assert.equal(rasterIconUrl('gear','missing',{}),null);assert.throws(()=>art('gear','missing'),/Missing authored artwork/);
 assert.throws(()=>rasterIconUrl('skill','slash',{'skill/slash':'https://invalid/icon.png'}),/Invalid raster icon path/);
});
test('every registered image is a real PNG with its recorded native dimensions, never a missing or SVG stand-in',()=>{
 for(const[key,path]of Object.entries(RASTER_ICONS)){assert.ok(EXPECTED_RASTER_KEYS.includes(key),key);const file=new URL('../../public/'+path,import.meta.url);assert.ok(existsSync(file),path);const b=readFileSync(file),a=assets.get(key);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.deepEqual([b.readUInt32BE(16),b.readUInt32BE(20)],a.dimensions,key);assert.deepEqual(a.dimensions,[512,512],key);if(key.startsWith('skill/')){const alpha=alphaPixels(b);assert.deepEqual(alpha.extrema,[0,255],key);assert.ok(alpha.clear>0&&alpha.partial>0,key+' transparent and soft edge pixels');const master=readFileSync(new URL('../../'+a.transparent_master.path,import.meta.url));assert.equal(createHash('sha256').update(master).digest('hex'),a.local_edit.output_sha256,key+' unchanged approved master');assert.deepEqual([master.readUInt32BE(16),master.readUInt32BE(20)],[1254,1254],key);assert.equal(a.delivery_export.source_sha256,a.transparent_master.sha256,key);}}
});

test('registered supplied PNGs match the retained delivery hashes and coverage',()=>{
 assert.equal(manifest.pending_count,0);assert.equal(new Set(manifest.verified_assets.map(a=>a.sha256)).size,122);assert.equal(Object.keys(RASTER_ICONS).length,manifest.verified_assets.length);
 for(const a of manifest.verified_assets){assert.equal(RASTER_ICONS[a.key],a.path);const bytes=readFileSync(new URL('../../public/'+a.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256,a.key);}
});
