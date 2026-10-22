// Delivery export only: copy the retained square/round approvals without repainting.
import {readFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('docs/icon-assets-manifest.json',root),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const asset of manifest.verified_assets.filter(a=>a.key.startsWith('skill/'))){
 for(const [variant,delivery]of [['square',asset],['round',asset.round_variant]]){
  const master=delivery?.source_master;
  if(!master)throw new Error('Missing retained '+variant+' master: '+asset.key);
  const source=new URL(master.path,root),bytes=readFileSync(source);
  if(hash(bytes)!==master.sha256||master.sha256!==delivery.sha256)throw new Error('Changed approved '+variant+' master: '+asset.key);
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==512||bytes.readUInt32BE(20)!==512||bytes[24]!==8||bytes[25]!==6)throw new Error('Expected a 512px RGBA PNG: '+asset.key);
  const destination=new URL('public/'+delivery.path,root);
  mkdirSync(new URL('./',destination),{recursive:true});
  copyFileSync(source,destination);
  console.log(asset.key+' '+variant+' '+bytes.length+' bytes');
 }
}
