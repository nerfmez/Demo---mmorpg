// Construction-time contours only. Character/foliage materials stay independent.
import * as THREE from 'three';
import { finishSteps } from './build-queue.js';
import { edgeGeometrySteps, mergeGeometrySteps, transformGeometrySteps, finishGeometrySteps } from './geometry-steps.js';
import art from '../../data/art.json' with { type:'json' };
import { outlineMaterial, darker } from './toon.js';
const style=art.architecture;
const edgeMaterial=new THREE.LineBasicMaterial({color:style.edgeColor,transparent:true,opacity:style.edgeOpacity,depthWrite:false});
edgeMaterial.userData.shared=true;
const blackBuildingEdges=new THREE.LineBasicMaterial({color:'#000000',transparent:true,opacity:.85,depthWrite:false});
blackBuildingEdges.userData.shared=true;

/** One depth-tested feature-edge batch per structure; no triangle wireframe. */
export const outlineStructure=root=>finishSteps(outlineStructureSteps(root));
export function* outlineStructureSteps(root,owner){
  if(root.userData.structureOutlined)return root;
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),edges=[];
  function* visit(o){
    yield;
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
      const geometry=yield* edgeGeometrySteps(o.geometry,style.edgeAngle,owner);
      if(geometry.attributes.position.count){
        edges.push(geometry);yield* transformGeometrySteps(geometry,new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
      }else geometry.dispose();
    }
    for(const child of o.children)yield* visit(child);
  }
  let pending=null;
  try {
  yield* visit(root);
  if(edges.length){
    const geometry=yield* mergeGeometrySteps(edges,owner);pending=geometry;yield* finishGeometrySteps(geometry);
    const lines=new THREE.LineSegments(geometry,root.userData.cityBlackContours?blackBuildingEdges:edgeMaterial);lines.name='structure-feature-edges';root.add(lines);pending=null;
  }
  root.userData.structureOutlined=true;return root;
  } finally {if(pending)owner?owner.release(pending):pending.dispose();for(const g of edges)owner?owner.release(g):g.dispose();}
}
