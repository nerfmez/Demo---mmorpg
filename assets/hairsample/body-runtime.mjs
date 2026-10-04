/** SHA-pinned, pre-GLTFLoader body deformation. Source is never mutated.
 * Controls are absolute [-1, 1]. Default: real BodySkin plus protected scalp,
 * with hoodie/pants/shoes omitted. Face/hair indices, UVs, materials, morphs and
 * skin weights remain unchanged. Read README.md before integration.
 */
export const VERSION = '1.0.0';
export const SOURCE_SHA256 = '4af2194f90ba846f3b13c00b50b14262419062d2171d17de922bcce2f89979c7';
export const PARAMETERS = Object.freeze({ centerX: 0.0005088425, shoulderInner: 0.103, shoulderOuter: 0.1477751759547579, shoulderMeters: 0.020, torsoFraction: 0.08 });
const enc = new TextEncoder(), dec = new TextDecoder();
function ss(a,b,x) { const v=Math.max(0,Math.min(1,(x-a)/(b-a))); return v*v*(3-2*v); }
function ds(a,b,x) { if(x<=a||x>=b)return 0;const v=(x-a)/(b-a);return 6*v*(1-v)/(b-a); }
function control(x) { if(typeof x !== 'number'||!Number.isFinite(x))throw new TypeError('Body controls must be finite numbers');return Math.max(-1,Math.min(1,x)); }
function evalField(p,s,t) {
 const [x,y,z]=p, u=x-PARAMETERS.centerX, r=Math.abs(u), sign=Math.sign(u);
 const sx=ss(.103,PARAMETERS.shoulderOuter,r), a=ss(1.12,1.32,y), b=1-ss(1.46,1.496,y), sy=a*b;
 const syD=ds(1.12,1.32,y)*b-a*ds(1.46,1.496,y);
 const tx=1-ss(.20,.32,r), c=ss(1.03,1.12,y), e=1-ss(1.23,1.36,y), ty=c*e;
 const tyD=ds(1.03,1.12,y)*e-c*ds(1.23,1.36,y);
 const dx=s*.020*sign*sx*sy+t*.08*u*tx*ty;
 const jxx=1+s*.020*ds(.103,PARAMETERS.shoulderOuter,r)*sy+t*.08*(tx-r*ds(.20,.32,r))*ty;
 const jxy=s*.020*sign*sx*syD+t*.08*u*tx*tyD;
 return {position:[x+dx,y,z],jxx,jxy};
}
export function deformPoint(position,shoulderWidth=0,torsoWidth=0) { return evalField(position,control(shoulderWidth),control(torsoWidth)).position; }
export function deformNormal(position,normal,shoulderWidth=0,torsoWidth=0) {
 const s=control(shoulderWidth),t=control(torsoWidth);if(!s&&!t)return [...normal];
 const {jxx,jxy}=evalField(position,s,t);const x=normal[0]/jxx,y=normal[1]-jxy*x,z=normal[2],length=Math.hypot(x,y,z);
 return length?[x/length,y/length,z/length]:[0,1,0];
}
function parse(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw new Error('Invalid GLB v2');
 const chunks=[];for(let off=12;off<bytes.length;) { const n=view.getUint32(off,true),type=view.getUint32(off+4,true);if(off+8+n>bytes.length)throw new Error('Invalid GLB chunk');chunks.push({type,data:bytes.slice(off+8,off+8+n)});off+=8+n; }
 const jsonChunk=chunks.find(c=>c.type===0x4e4f534a),binChunk=chunks.find(c=>c.type===0x004e4942);
 if(!jsonChunk||!binChunk)throw new Error('GLB must contain JSON and BIN');return {json:JSON.parse(dec.decode(jsonChunk.data).trim()),bin:binChunk.data,chunks};
}
function serialize(json,bin,chunks) {
 const raw=enc.encode(JSON.stringify(json)),jsonBytes=new Uint8Array((raw.length+3)&~3);jsonBytes.fill(32);jsonBytes.set(raw);
 const updated=chunks.map(c=>({type:c.type,data:c.type===0x4e4f534a?jsonBytes:c.type===0x004e4942?bin:c.data}));
 const out=new Uint8Array(12+updated.reduce((n,c)=>n+8+c.data.length,0)),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);
 let off=12;for(const c of updated){v.setUint32(off,c.data.length,true);v.setUint32(off+4,c.type,true);out.set(c.data,off+8);off+=8+c.data.length;}return out.buffer;
}
function floatAccessor(json,bin,index,type) {
 const a=json.accessors[index],b=json.bufferViews[a.bufferView];const dim={VEC3:3,MAT4:16}[type];
 if(a.componentType!==5126||a.type!==type||a.sparse||b.buffer!==0)throw new Error(`Unexpected accessor ${index}`);
 const base=(b.byteOffset||0)+(a.byteOffset||0),stride=b.byteStride||dim*4,view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 return {a,count:a.count,get(i){return Array.from({length:dim},(_,k)=>view.getFloat32(base+i*stride+k*4,true));},set(i,value){value.forEach((x,k)=>view.setFloat32(base+i*stride+k*4,x,true));}};
}
function restWorld(nodes) {
 const parents=Array(nodes.length).fill(null);nodes.forEach((n,i)=>{if(n.matrix||(n.rotation||[0,0,0,1]).some((x,k)=>x!==[0,0,0,1][k])||(n.scale||[1,1,1]).some(x=>x!==1))throw new Error('Source rest transform contract changed');(n.children||[]).forEach(c=>parents[c]=i);});
 const world=Array(nodes.length);function calc(i){if(world[i])return world[i];const p=parents[i]===null?[0,0,0]:calc(parents[i]);return world[i]=(nodes[i].translation||[0,0,0]).map((x,k)=>x+p[k]);}nodes.forEach((_,i)=>calc(i));return {world,parents};
}
function splitParts(json,wardrobe) {
 const original=json.meshes[1].primitives,bodyNode=json.nodes[1];
 if(original.length!==7||bodyNode.mesh!==1||bodyNode.skin!==1)throw new Error('Body primitive contract changed');
 json.meshes[1]={...json.meshes[1],name:'BodySkin',primitives:original.slice(0,3)};bodyNode.name='BodySkin';bodyNode.extras={...bodyNode.extras,bodyPart:'bodySkin'};
 const output={bodySkin:{mesh:1,node:1,sourcePrimitives:[0,1,2]}};
 const defs=[['scalp',3,'ScalpProtected'],['hoodie',4,'OptionalHoodie'],['pants',5,'OptionalPants'],['shoes',6,'OptionalShoes']];
 for(const [key,index,name] of defs) {
   if(key!=='scalp'&&!wardrobe.has(key))continue;
   const mesh=json.meshes.length,node=json.nodes.length;
   json.meshes.push({name,primitives:[original[index]]});json.nodes.push({name,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],mesh,skin:1,extras:{bodyPart:key}});
   for(const scene of json.scenes)if(scene.nodes.includes(1))scene.nodes.push(node);
   output[key]={mesh,node,sourcePrimitives:[index]};
 }
 return output;
}
/**
 * @param {ArrayBuffer|Uint8Array} sourceBytes Exact ORIGINAL VRM bytes, every call.
 * @param {{shoulderWidth?:number,torsoWidth?:number,layout?:'separate'|'original',wardrobe?:Array<'hoodie'|'pants'|'shoes'>}} options
 * @returns {Promise<{buffer:ArrayBuffer,report:object}>} Pass buffer to GLTFLoader.parseAsync before three-vrm initializes.
 */
export async function createBodyVariant(sourceBytes,options={}) {
 const source=sourceBytes instanceof Uint8Array?new Uint8Array(sourceBytes):new Uint8Array(sourceBytes);
 if(!(sourceBytes instanceof ArrayBuffer)&&!(sourceBytes instanceof Uint8Array))throw new TypeError('Expected original ArrayBuffer or Uint8Array');
 if(!globalThis.crypto?.subtle)throw new Error('Web Crypto required for immutable source SHA-256 guard');
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',source))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(sha!==SOURCE_SHA256)throw new Error('Wrong source or already-deformed input. Always use original HairSample_Male.vrm bytes.');
 const s=control(options.shoulderWidth??0),t=control(options.torsoWidth??0),layout=options.layout??'separate';
 if(!['separate','original'].includes(layout))throw new Error('layout must be separate or original');
 const wardrobeOption=options.wardrobe??[];if(!Array.isArray(wardrobeOption)||wardrobeOption.some(x=>!['hoodie','pants','shoes'].includes(x)))throw new Error('wardrobe must be an array of hoodie, pants, shoes');
 if(layout==='original'&&options.wardrobe!==undefined)throw new Error('wardrobe selection requires separate layout; original retains every original primitive');
 const report={version:VERSION,sourceSha256:sha,shoulderWidth:s,torsoWidth:t,layout,wardrobe:layout==='original'?['hoodie','pants','shoes']:[...new Set(wardrobeOption)],byteIdenticalSource:false,changedVertices:0,changedRestNodes:[],colliderCentersFitted:0,colliderRadii:'unchanged source sphere approximations'};
 if(s===0&&t===0&&layout==='original'){report.byteIdenticalSource=true;return {buffer:source.slice().buffer,report};}
 const {json,bin,chunks}=parse(source);if(json.extensions?.VRM?.specVersion!=='0.0'||json.meshes[0].name!=='Face.baked'||json.meshes[2].name!=='Hair001.baked')throw new Error('Source structure contract changed');
 if(s!==0||t!==0) {
   const pos=floatAccessor(json,bin,123,'VEC3'),norm=floatAccessor(json,bin,124,'VEC3');const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<pos.count;i++){const p=pos.get(i),f=evalField(p,s,t),q=f.position;for(let k=0;k<3;k++){min[k]=Math.min(min[k],q[k]);max[k]=Math.max(max[k],q[k]);}if(q.some((x,k)=>x!==p[k])){pos.set(i,q);report.changedVertices++;}if(f.jxx!==1||f.jxy!==0)norm.set(i,deformNormal(p,norm.get(i),s,t));}
   // Bounds must be computed from the FLOAT32 bytes actually stored, not doubles.
   min.fill(Infinity);max.fill(-Infinity);for(let i=0;i<pos.count;i++){const p=pos.get(i);p.forEach((x,k)=>{min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);});}pos.a.min=min;pos.a.max=max;
   const {world,parents}=restWorld(json.nodes),fitted=world.map(p=>evalField(p,s,t).position),delta=fitted.map((p,i)=>p.map((x,k)=>x-world[i][k]));
   // Adjust original local translations by world delta differences; preserve unchanged bytes/values.
   json.nodes.forEach((node,i)=>{const p=parents[i],dp=p===null?[0,0,0]:delta[p],localDelta=delta[i].map((x,k)=>x-dp[k]);if(localDelta.some(x=>x!==0)){node.translation=(node.translation||[0,0,0]).map((x,k)=>x+localDelta[k]);report.changedRestNodes.push(i);}});
   json.skins.forEach(skin=>{const ibm=floatAccessor(json,bin,skin.inverseBindMatrices,'MAT4');skin.joints.forEach((node,j)=>{if(delta[node].some(x=>x!==0)){const m=ibm.get(j);for(let k=0;k<3;k++)m[12+k]-=delta[node][k];ibm.set(j,m);}});});
   // VRM0 offsets use opposite Z to glTF. Radius stays unchanged; spheres cannot encode nonuniform deformation.
   (json.extensions.VRM.secondaryAnimation?.colliderGroups||[]).forEach(group=>group.colliders.forEach(c=>{const o=c.offset||{},local=[o.x||0,o.y||0,-(o.z||0)],center=world[group.node].map((x,k)=>x+local[k]),q=evalField(center,s,t).position;const localDelta=q.map((x,k)=>x-center[k]-delta[group.node][k]);if(localDelta.some(x=>Math.abs(x)>1e-15)){c.offset={x:(o.x||0)+localDelta[0],y:(o.y||0)+localDelta[1],z:(o.z||0)-localDelta[2]};report.colliderCentersFitted++;}}));
 }
 report.parts=layout==='separate'?splitParts(json,new Set(wardrobeOption)):{originalBody:{mesh:1,node:1,sourcePrimitives:[0,1,2,3,4,5,6]}};
 return {buffer:serialize(json,bin,chunks),report};
}

