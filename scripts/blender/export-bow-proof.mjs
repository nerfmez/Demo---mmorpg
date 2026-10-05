import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const out=process.env.BOW_PROOF_DIR||'/tmp/bow-blender-proof';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage(); page.on('console',m=>console.log(m.text())); await page.goto('http://localhost:5173/data/skills.json');
const result=await page.evaluate(async()=>{
const THREE=await import('/node_modules/three/build/three.module.js');
const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
const {buildHumanoid,HumanoidAnimator,DEFAULT_LOOK}=await import('/src/render/hero.js');
const {loadModels,hasModel}=await import('/src/render/models.js');
const registry=await (await fetch('/data/models.json')).json();
for(const group of Object.values(registry))if(group&&typeof group==='object')for(const m of Object.values(group))if(m?.file)m.file='/'+m.file;
await loadModels({characters:{hero_base:registry.characters.hero_base,hairsample:registry.characters.hairsample}});
console.log('models loaded',hasModel('characters','hairsample'));if(!hasModel('characters','hairsample'))throw Error('real hero missing');
const outputs={};
for(const [id,cast,kind] of [['heavy_draw',.55,'projectile'],['arrow_rain',.3,'ground_area'],['pinning_arrow',.22,'projectile']]){
console.log('baking',id);const rig=buildHumanoid(DEFAULT_LOOK,{weapon:'bow',armor:'tunic',helm:null,bases:{}});
rig.root.rotation.y=-Math.PI/2; const anim=new HumanoidAnimator(rig); anim.idleT=0;
anim.play(id,cast+.28,'bow',0,cast,kind);
let index=0;const nodes=[];rig.root.traverse(o=>{o.name='node_'+index++;nodes.push(o);if(o.isMesh){if(o.material?.isShaderMaterial){o.visible=false;return;} const mats=Array.isArray(o.material)?o.material:[o.material]; const converted=mats.map(m=>new THREE.MeshStandardMaterial({color:m.color||0xffffff,map:m.map,roughness:1,side:m.side,transparent:m.transparent,opacity:m.opacity}));o.material=Array.isArray(o.material)?converted:converted[0];}});
const times=[],tracks=nodes.map(()=>({p:[],q:[],s:[]})), origins=[];
for(let f=0;f<=90;f++){
anim.update(f===0?0:1/30,{speed:0,facing:-Math.PI/2,moving:false,dash:null,dead:false,time:f/30});rig.root.updateMatrixWorld(true);times.push(f/30);
nodes.forEach((o,i)=>{tracks[i].p.push(...o.position);tracks[i].q.push(...o.quaternion);tracks[i].s.push(...o.scale);});
const anchor=rig.bones.weapon||rig.bones.handR; const vec=new THREE.Vector3();(anchor?.getWorldPosition?anchor:rig.bones.handR).getWorldPosition(vec);origins.push(vec.toArray());
}
const ts=[];nodes.forEach((o,i)=>{ts.push(new THREE.VectorKeyframeTrack(o.name+'.position',times,tracks[i].p),new THREE.QuaternionKeyframeTrack(o.name+'.quaternion',times,tracks[i].q),new THREE.VectorKeyframeTrack(o.name+'.scale',times,tracks[i].s));});
console.log('exporting',id,nodes.length);const clip=new THREE.AnimationClip(id,3,ts);const glb=await new GLTFExporter().parseAsync(rig.root,{binary:true,animations:[clip],onlyVisible:true});
console.log('done',id,glb.byteLength);let binary='';const bytes=new Uint8Array(glb);for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));outputs[id]={glb:btoa(binary),origins,realModel:'hairsample-male.glb',cast};
}return outputs;
});
for(const [id,r]of Object.entries(result)){await writeFile(`${out}/${id}-hero.glb`,Buffer.from(r.glb,'base64'));delete r.glb;await writeFile(`${out}/${id}-timing.json`,JSON.stringify(r));}
await browser.close(); console.log('Exported actual HairSample hero + production bow + production animation for all three.');
