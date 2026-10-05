// Bounded two-pose afterimages of the real rig, never preview mannequins.
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
export function poseEcho(root,color){
 const echo=clone(root);echo.visible=true;const materials=[];
 echo.traverse(o=>{
  if(o.geometry){o.geometry=o.geometry.clone();o.geometry.userData.shared=false;}
  if(o.material){const old=o.material;const convert=()=>new THREE.MeshBasicMaterial({color,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide});o.material=Array.isArray(old)?old.map(convert):convert();materials.push(...(Array.isArray(o.material)?o.material:[o.material]));}
 });
 echo.userData.echoMaterials=materials;return echo;
}
export function echoOpacity(root,value){for(const m of root.userData.echoMaterials)m.opacity=value;}
