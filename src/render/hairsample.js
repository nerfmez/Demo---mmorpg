// The live customizer's complete base body and independent, gear-controlled clothes.
// The existing HumanoidAnimator remains the only motion source.
import * as THREE from 'three';
import {attachVrmBody} from './vrm-body.js';
import {bindSkinSync} from './skinned.js';
import {garmentFrame,garmentUniforms,pieceUniforms,garmentMaterial,garmentHull} from './garments.js';
import {bodyShell,skirt} from './base-garments.js';
const v=new THREE.Vector3(),q=new THREE.Quaternion(),p=new THREE.Quaternion();
export function attachHairSampleBody(rig,T,gear,colors){
 attachVrmBody(rig,T);
 const body=rig.skin.body,wardrobe=new THREE.Group();
 body.traverse(o=>{if(o.isSkinnedMesh&&o.material.isMeshToonMaterial)o.receiveShadow=true;});
 wardrobe.name='Runtime equipment';wardrobe.quaternion.copy(body.quaternion);
 rig.root.add(wardrobe);rig.root.updateMatrixWorld(true);
 let skeleton;
 body.traverse(o=>{if(o.isSkinnedMesh&&o.name==='BodySkin')skeleton=o.skeleton;});
 if(!skeleton)throw Error('HairSample: complete base skin missing');
 const armor=gear.armor||'tunic';
 // Outfits by category (base-garments.js): every top, glove and boot shaft is a shell of the
 // body itself, a skirt hangs from the waist; the HairSample trousers and shoes stay as the base
 // legwear. Each garment is cut and painted from its item's data (garments.js).
 const outfit=colors.outfit,flash=rig.material.userData.flash;
 const top=garmentUniforms(outfit);
 let bind=null,frameSource=null;
 const dress=(kind,geometry,uniforms,source=frameSource)=>{
  const frame=T.garmentFrame;
  const make=material=>{
   const m=new THREE.SkinnedMesh(geometry,material);
   m.position.copy(source.position);m.quaternion.copy(source.quaternion);m.scale.copy(source.scale);
   m.bind(skeleton,bind);m.frustumCulled=false;return m;
  };
  const part=make(garmentMaterial(kind,frame,uniforms,flash));
  part.name='Garment-'+kind;part.userData={bodyPart:kind};part.castShadow=true;part.receiveShadow=true;
  const hull=make(garmentHull(kind,frame,uniforms,kind==='gloves'?.006:.01));hull.name=part.name+'-outline';
  wardrobe.add(part,hull);
 };
 T.wardrobe.traverse(source=>{
  if(!source.isSkinnedMesh)return;
  T.garmentFrame||=garmentFrame(source);bind||=source.bindMatrix;frameSource||=source;
  const kind=source.userData.bodyPart;
  if(kind==='pants'||kind==='shoes')dress(kind,source.geometry,top,source);
 });
 const F=T.garmentFrame;
 dress('top',bodyShell(T,F,'top',outfit.base.offset||.012),top);
 if(outfit.skirt)dress('skirt',skirt(T,F,outfit.skirt),top);
 if(outfit.boots.len>0.15)dress('boots',bodyShell(T,F,'boots',.026,outfit.boots.len),pieceUniforms(outfit.boots));
 if(outfit.gloves)dress('gloves',bodyShell(T,F,'gloves',.006,outfit.gloves.len),pieceUniforms(outfit.gloves));
 rig.outfit=colors.outfit;
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
 const center=new THREE.Vector3(.064,-.029,0),bow=gear.weapon==='bow' && !rig.importedWeapon ? .13 : 0,sync=rig.syncSkin;
 const leftHand=rig.importedOffhand?body.getObjectByName('J_Bip_L_Hand'):null;
 const leftCenter=new THREE.Vector3(-.064,-.029,0);
 rig.gripCenter=center;
 rig.offhandGripCenter=leftHand?leftCenter:null;
 rig.syncSkin=()=>{
  sync();rig.root.updateMatrixWorld(true);
  weapon.getWorldQuaternion(q);hand.parent.getWorldQuaternion(p).invert();hand.quaternion.copy(p.multiply(q));
  hand.updateWorldMatrix(false,true);
  v.copy(center);hand.localToWorld(v);
  if(bow){p.copy(q);v.addScaledVector(newDirection.set(0,0,1).applyQuaternion(p),-bow);}
  weapon.parent.worldToLocal(v);weapon.position.copy(v);
  // Imported light offhands also author their grip at zero; retain the existing carry rotation.
  if(leftHand&&rig.bones.offhand){
   v.copy(leftCenter);leftHand.localToWorld(v);
   rig.bones.offhand.parent.worldToLocal(v);rig.bones.offhand.position.copy(v);
  }
 };
 rig.syncSkin();return rig;
}
const newDirection=new THREE.Vector3();
