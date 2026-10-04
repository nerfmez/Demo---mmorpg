// Build a game GLB from the SHA-pinned live customizer master, without body deformation.
// Face/hair/skin vertex, normal, UV and weight bytes remain unchanged.
// Garments are independent nodes; merge only identical-material primitive index lists.
// Usage: node scripts/prep-hairsample.mjs ORIGINAL.vrm OUTPUT.glb
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createBodyVariant,SOURCE_SHA256} from '../assets/hairsample/body-runtime.mjs';
const [, ,src,dest]=process.argv;
if(!src||!dest)throw Error('usage: node scripts/prep-hairsample.mjs ORIGINAL.vrm OUTPUT.glb');
const original=readFileSync(src);
if(createHash('sha256').update(original).digest('hex')!==SOURCE_SHA256)throw Error('Wrong immutable source');
const {buffer}=await createBodyVariant(new Uint8Array(original),{wardrobe:['hoodie','pants','shoes']});
const input=Buffer.from(buffer),len=input.readUInt32LE(12);
const j=JSON.parse(input.toString('utf8',20,20+len));
const garments=j.nodes.flatMap((n,i)=>['hoodie','pants','shoes'].includes(n.extras?.bodyPart)?[i]:[]);
for(const s of j.scenes)s.nodes=s.nodes.filter(i=>!garments.includes(i));
j.scenes.push({name:'RuntimeWardrobe',nodes:garments});
let bin=input.subarray(28+len),vrm=j.extensions.VRM;
const humanBones=Object.fromEntries(vrm.humanoid.humanBones.map(b=>[b.bone,{node:b.node}]));
const preset={},names={blink:'blink',angry:'angry',joy:'happy',sorrow:'sad',fun:'relaxed'};
for(const g of vrm.blendShapeMaster.blendShapeGroups){
 const name=names[g.presetName];if(!name)continue;
 preset[name]={morphTargetBinds:(g.binds||[]).map(b=>({node:j.nodes.findIndex(n=>n.mesh===b.mesh),index:b.index,weight:b.weight/100}))};
}
j.asset.extras={...j.asset.extras,hairsample:{sourceSha256:SOURCE_SHA256,model:'HairSample_Male-beta',humanoid:{humanBones},expressions:{preset},meta:vrm.meta}};
delete j.extensions.VRM;j.extensionsUsed=j.extensionsUsed.filter(x=>x!=='VRM');
if(j.extensionsRequired)j.extensionsRequired=j.extensionsRequired.filter(x=>x!=='VRM');
const keep=new Map();
for(const e of Object.values(preset))for(const b of e.morphTargetBinds){
 const mi=j.nodes[b.node].mesh;if(!keep.has(mi))keep.set(mi,new Set());keep.get(mi).add(b.index);
}
const remap=new Map();
j.meshes.forEach((m,mi)=>{
 if(!m.primitives[0].targets?.length)return;
 const indices=[...(keep.get(mi)||[])].sort((a,b)=>a-b);
 remap.set(mi,new Map(indices.map((a,b)=>[a,b])));
 for(const p of m.primitives){p.targets=indices.map(i=>p.targets[i]);if(!p.targets.length)delete p.targets;}
 if(m.extras?.targetNames)m.extras.targetNames=indices.map(i=>m.extras.targetNames[i]);
 if(m.weights)m.weights=indices.map(i=>m.weights[i]);
});
for(const e of Object.values(preset))for(const b of e.morphTargetBinds)b.index=remap.get(j.nodes[b.node].mesh).get(b.index);
function accessorBytes(i){
 const a=j.accessors[i],v=j.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0);
 const size={5121:1,5123:2,5125:4}[a.componentType];
 if(a.type!=='SCALAR'||!size||v.byteStride)throw Error('Unexpected index accessor');
 return {a,data:bin.subarray(start,start+a.count*size)};
}
for(const m of j.meshes){
 const groups=new Map();
 for(const p of m.primitives){
  const key=JSON.stringify([p.material,p.attributes,p.targets,p.mode]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
 }
 m.primitives=[...groups.values()].map(ps=>{
  if(ps.length===1)return ps[0];
  const parts=ps.map(p=>accessorBytes(p.indices));
  if(parts.some(p=>p.a.componentType!==parts[0].a.componentType))throw Error('Index format mismatch');
  const data=Buffer.concat(parts.map(p=>p.data)),pad=Buffer.alloc((4-bin.length%4)%4),offset=bin.length+pad.length;
  const bv=j.bufferViews.length,ai=j.accessors.length;
  j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target:34963});
  j.accessors.push({bufferView:bv,componentType:parts[0].a.componentType,type:'SCALAR',count:parts.reduce((n,p)=>n+p.a.count,0)});
  bin=Buffer.concat([bin,pad,data]);return {...ps[0],indices:ai};
 });
}
// Only referenced material images; never resample/repaint the accepted textures.
const usedTextures=new Map(),usedImages=new Map();
function texture(i){if(!usedTextures.has(i))usedTextures.set(i,usedTextures.size);return usedTextures.get(i);}
function material(o){for(const [key,value] of Object.entries(o)){if(!value||typeof value!=='object')continue;if(key.endsWith('Texture')&&Number.isInteger(value.index))value.index=texture(value.index);else material(value);}}
j.materials.forEach(material);
const textures=[...usedTextures.keys()].map(i=>({...j.textures[i]}));
for(const t of textures){if(!usedImages.has(t.source))usedImages.set(t.source,usedImages.size);t.source=usedImages.get(t.source);}
j.textures=textures;j.images=[...usedImages.keys()].map(i=>j.images[i]);
const accs=new Map(),views=new Map();
const use=(map,i)=>{if(!map.has(i))map.set(i,map.size);return map.get(i);};
for(const m of j.meshes)for(const p of m.primitives){
 for(const k of Object.keys(p.attributes))p.attributes[k]=use(accs,p.attributes[k]);
 p.indices=use(accs,p.indices);
 for(const t of p.targets||[])for(const k of Object.keys(t))t[k]=use(accs,t[k]);
}
for(const s of j.skins)s.inverseBindMatrices=use(accs,s.inverseBindMatrices);
const oldAcc=j.accessors;j.accessors=[...accs.keys()].map(i=>{
 const a={...oldAcc[i]};if(a.bufferView!==undefined)a.bufferView=use(views,a.bufferView);
 if(a.sparse)a.sparse={...a.sparse,indices:{...a.sparse.indices,bufferView:use(views,a.sparse.indices.bufferView)},values:{...a.sparse.values,bufferView:use(views,a.sparse.values.bufferView)}};
 return a;
});
for(const im of j.images)im.bufferView=use(views,im.bufferView);
const oldViews=j.bufferViews,chunks=[];let size=0;
j.bufferViews=[...views.keys()].map(i=>{
 const v=oldViews[i],pad=Buffer.alloc((4-size%4)%4);chunks.push(pad);size+=pad.length;
 const data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),out={...v,byteOffset:size};
 chunks.push(data);size+=data.length;return out;
});
bin=Buffer.concat(chunks);j.buffers=[{byteLength:bin.length}];
const json=Buffer.from(JSON.stringify(j)),jp=Buffer.alloc((4-json.length%4)%4,32),bp=Buffer.alloc((4-bin.length%4)%4);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+jp.length+bin.length+bp.length,8);
const chunk=(n,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(n);h.write(t,4);return h;};
const output=Buffer.concat([header,chunk(json.length+jp.length,'JSON'),json,jp,chunk(bin.length+bp.length,'BIN\0'),bin,bp]);
writeFileSync(dest,output);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA256,outputSha256:createHash('sha256').update(output).digest('hex'),bytes:output.length,triangles:j.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0),0),primitives:j.meshes.reduce((n,m)=>n+m.primitives.length,0)}));
