// The live customizer's complete base body and independent, gear-controlled clothes.
// The existing HumanoidAnimator remains the only motion source.
import * as THREE from 'three';
import {attachVrmBody,toonCopy} from './vrm-body.js';
import {bindSkinSync} from './skinned.js';
const v=new THREE.Vector3(),q=new THREE.Quaternion(),p=new THREE.Quaternion();
export function attachHairSampleBody(rig,T,gear,colors){
 attachVrmBody(rig,T);
 const body=rig.skin.body,wardrobe=new THREE.Group();
 wardrobe.name='Runtime equipment';wardrobe.quaternion.copy(body.quaternion);
 rig.root.add(wardrobe);rig.root.updateMatrixWorld(true);
 let skeleton;
 body.traverse(o=>{if(o.isSkinnedMesh&&o.name==='BodySkin')skeleton=o.skeleton;});
 if(!skeleton)throw Error('HairSample: complete base skin missing');
 const armor=gear.armor||'tunic';
 const color={hoodie:colors.vest||colors.tunic,pants:colors.pants,shoes:colors.boots};
 T.wardrobe.traverse(source=>{
  if(!source.isSkinnedMesh)return;
  const material=toonCopy(source.material,rig.material.userData.flash,.3,false);
  const part=new THREE.SkinnedMesh(source.geometry,material);
  part.name=source.name;part.userData={...source.userData};
  part.position.copy(source.position);part.quaternion.copy(source.quaternion);part.scale.copy(source.scale);
  part.bind(skeleton,source.bindMatrix);part.frustumCulled=false;part.castShadow=true;part.receiveShadow=true;
  wardrobe.add(part);
   // Game palettes, independently of the immutable body/face/hair textures.
  material.map=null;material.color.set(color[part.userData.bodyPart]);
 });
 rig.hairsample=true;rig.wardrobe=wardrobe;rig.armorKind=armor;
 // Static attachment grip, not new animation keys. The legacy weapon +Z socket
 // remains the aiming/trail source, while the actual hand encloses its handle.
 const hand=body.getObjectByName('J_Bip_R_Hand'),weapon=rig.bones.weapon;
 if(!hand||!weapon||gear.weapon==='none')return rig;
 for(const name of ['Index','Middle','Ring','Little']){
  for(let i=1;i<=3;i++)body.getObjectByName('J_Bip_R_'+name+i)?.rotation.set(0,0,-[.9,1.15,.8][i-1]);
 }
 const thumb=body.getObjectByName('J_Bip_R_Thumb1');if(thumb)thumb.rotation.set(0,.65,-.35);
 for(const i of [2,3]){const b=body.getObjectByName('J_Bip_R_Thumb'+i);if(b)b.rotation.z=-.45;}
 bindSkinSync(rig,body,T); // capture this rig's static grip as the finger rest basis
 const center=new THREE.Vector3(.064,-.029,0),bow=gear.weapon==='bow'?.13:0,sync=rig.syncSkin;
 rig.gripCenter=center;
 rig.syncSkin=()=>{
  sync();rig.root.updateMatrixWorld(true);
  weapon.getWorldQuaternion(q);hand.parent.getWorldQuaternion(p).invert();hand.quaternion.copy(p.multiply(q));
  hand.updateWorldMatrix(false,true);
  v.copy(center);hand.localToWorld(v);
  if(bow){p.copy(q);v.addScaledVector(newDirection.set(0,0,1).applyQuaternion(p),-bow);}
  weapon.parent.worldToLocal(v);weapon.position.copy(v);
 };
 rig.syncSkin();return rig;
}
const newDirection=new THREE.Vector3();
