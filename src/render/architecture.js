// Construction-time contours only. Character/foliage materials stay independent.
import * as THREE from 'three';
import { drainSteps } from './city-work.js';
import { featureEdgesSteps, transformCityGeometrySteps, mergeCityGeometriesSteps, cityBoundsSteps } from './city-geometry.js';
import art from '../../data/art.json' with { type:'json' };
import { outlineMaterial, darker } from './toon.js';
const style=art.architecture;
const edgeMaterial=new THREE.LineBasicMaterial({color:style.edgeColor,transparent:true,opacity:style.edgeOpacity,depthWrite:false});
edgeMaterial.userData.shared=true;
const blackBuildingEdges=new THREE.LineBasicMaterial({color:'#000000',transparent:true,opacity:.85,depthWrite:false});
blackBuildingEdges.userData.shared=true;

/** One depth-tested feature-edge batch per structure; no triangle wireframe. */
export function outlineStructure(root){return drainSteps(outlineStructureSteps(root));}
export function* outlineStructureSteps(root){
  if(root.userData.structureOutlined)return root;
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),edges=[];
  let merged=null;
  try {
    function* visit(o){
      yield 'edges: ' + o.name;
      if(o.userData.skipStructureOutline)return;
      if(o!==root&&o.userData.structureOutlined)return;
      if(o.isMesh&&!o.isInstancedMesh){
        const main=o.parent?.userData.mesh;
        if(main&&main!==o)return;
        if(main===o){
          const material=outlineMaterial(root.userData.cityBlackContours?'#000000':darker('#'+o.material.color.getHexString(),style.hullDarkness),style.hullWidth);
          material.userData.shared=true;
          for(const sibling of o.parent.children)if(sibling!==o&&sibling.isMesh&&sibling.geometry===o.geometry)sibling.material=material;
        }
        const geometry=yield* featureEdgesSteps(o.geometry,style.edgeAngle);
        if(geometry.attributes.position.count){
          edges.push(geometry); // own before a transform can suspend
          yield* transformCityGeometrySteps(geometry,new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
        }else geometry.dispose();
      }
      for(const child of o.children)yield* visit(child);
    }
    yield* visit(root);
    if(edges.length){
      merged=yield* mergeCityGeometriesSteps(edges);
      yield* cityBoundsSteps(merged);
      const lines=new THREE.LineSegments(merged,root.userData.cityBlackContours?blackBuildingEdges:edgeMaterial);
      lines.name='structure-feature-edges';root.add(lines);merged=null;
    }
    root.userData.structureOutlined=true;return root;
  } finally { edges.forEach(g=>g.dispose());merged?.dispose(); }
}
