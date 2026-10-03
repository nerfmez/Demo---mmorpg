// Construction-time contours only. Character/foliage materials stay independent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import art from '../../data/art.json' with { type:'json' };
import { outlineMaterial, darker } from './toon.js';
const style=art.architecture;
const edgeMaterial=new THREE.LineBasicMaterial({color:style.edgeColor,transparent:true,opacity:style.edgeOpacity,depthWrite:false});
edgeMaterial.userData.shared=true;
const blackBuildingEdges=new THREE.LineBasicMaterial({color:'#000000',transparent:true,opacity:.85,depthWrite:false});
blackBuildingEdges.userData.shared=true;

/** One depth-tested feature-edge batch per structure; no triangle wireframe. */
export function outlineStructure(root){
  if(root.userData.structureOutlined)return root;
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),edges=[];
  function visit(o){
    if(o.userData.skipStructureOutline)return;
    if(o!==root&&o.userData.structureOutlined)return;
    if(o.isMesh&&!o.isInstancedMesh){
      const main=o.parent?.userData.mesh;
      if(main&&main!==o)return; // inverted hull shares the main geometry
      if(main===o){
        const material=outlineMaterial(root.userData.cityBlackContours?'#000000':darker('#'+o.material.color.getHexString(),style.hullDarkness),style.hullWidth);
        material.userData.shared=true;
        for(const sibling of o.parent.children)if(sibling!==o&&sibling.isMesh&&sibling.geometry===o.geometry)sibling.material=material;
      }
      const geometry=new THREE.EdgesGeometry(o.geometry,style.edgeAngle);
      if(geometry.attributes.position.count){
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));edges.push(geometry);
      }else geometry.dispose();
    }
    for(const child of o.children)visit(child);
  }
  visit(root);
  if(edges.length){
    const geometry=mergeGeometries(edges);edges.forEach(g=>g.dispose());geometry.computeBoundingSphere();
    const lines=new THREE.LineSegments(geometry,root.userData.cityBlackContours?blackBuildingEdges:edgeMaterial);lines.name='structure-feature-edges';root.add(lines);
  }
  root.userData.structureOutlined=true;return root;
}
