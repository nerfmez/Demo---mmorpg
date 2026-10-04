// Delivery export only: keep the approved transparent masters byte-for-byte.
// Requires ImageMagick 7. Do not use this to remove backgrounds or change artwork.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const manifestPath=new URL('docs/icon-assets-manifest.json',root);
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const asset of manifest.verified_assets.filter(a=>a.key.startsWith('skill/'))){
 const master=asset.transparent_master;
 if(!master)throw new Error('Missing retained master: '+asset.key);
 const source=new URL(master.path,root),bytes=readFileSync(source);
 if(hash(bytes)!==master.sha256)throw new Error('Changed approved master: '+asset.key);
 const destination=new URL('public/'+asset.path,root);
 execFileSync('magick',[fileURLToPath(source),'-filter','Lanczos','-resize','512x512','-depth','8','PNG32:'+fileURLToPath(destination)]);
 const output=readFileSync(destination);
 asset.sha256=hash(output);asset.bytes=output.length;asset.dimensions=[output.readUInt32BE(16),output.readUInt32BE(20)];
 asset.mode='RGBA';asset.alpha_extrema=[0,255];
 asset.delivery_export={method:'ImageMagick 7 Lanczos proportional 512px RGBA PNG export; no crop, matte, background removal or art regeneration',source_sha256:master.sha256,source_dimensions:master.dimensions,review:'PREMERGE-WEBKIT-REVIEW-2026-10-04.md'};
 console.log(asset.key+' '+asset.bytes+' bytes');
}
manifest.skill_delivery='512px transparent delivery PNGs; unchanged 1254px approved masters retained outside public/ in assets-source/skills/';
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
