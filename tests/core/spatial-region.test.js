import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {prepareSpatialRegion,updateSpatialRegion,restoreSpatialRegion} from '../../src/render/spatial-region.js';
import {disposeObject} from '../../src/render/dispose.js';

const makeRegion = () => ({root:new THREE.Group(),npcs:[],npcMarkers:[],fires:[],waypointStones:new Map()});
function mesh(x, z, shadow = false) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),new THREE.MeshBasicMaterial());
  object.position.set(x,.5,z);object.castShadow = shadow;return object;
}
function cameraAt(x = 0, z = 0) {
  const camera = new THREE.OrthographicCamera(-6,6,6,-6,.1,100);
  camera.position.set(x,20,z);camera.up.set(0,0,-1);camera.lookAt(x,0,z);camera.updateMatrixWorld();return camera;
}
function sunAt(x, z) {
  const sun = new THREE.DirectionalLight();sun.castShadow = true;
  Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.1,far:60});
  sun.shadow.camera.updateProjectionMatrix();sun.position.set(x,20,z);sun.target.position.set(x,0,z);return sun;
}
function assertMatrix(actual,expected) {
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(actual.elements[i] - expected.elements[i]) < 1e-9, `matrix component ${i}`);
}

test('resident cells attach the camera and shadow union, and detach unseen matrix/render branches',()=>{
  const region = makeRegion(),source = new THREE.Group();source.name = 'whole-map-environment';region.root.add(source);
  const near = mesh(0,0),shadow = mesh(30,0,true),offscreen = mesh(60,0,true),noncaster = mesh(30,0);
  source.add(near,shadow,offscreen,noncaster);
  const stats = prepareSpatialRegion(region,{cellSize:8,margin:0}),camera = cameraAt(),sun = sunAt(30,0);
  assert.equal(stats.objects,4);assert.equal(source.parent,null,'empty original grouping tree does not traverse every frame');
  updateSpatialRegion(region,camera,sun);
  assert.equal(near.parent.parent,region.root);
  assert.equal(shadow.parent.parent,region.root,'off-camera caster remains available to the light');
  assert.equal(offscreen.parent.parent,null);assert.equal(noncaster.parent.parent,null);
  assert.equal(offscreen.userData.residentCell.attached,false,'grass/CPU consumers can skip detached cells');
  assert.equal(stats.attachedObjects,2);
  const retained = region.spatial.cells.map(cell=>cell.group),matrices = region.spatial.cells.map(cell=>cell.bounds);
  assert.equal(updateSpatialRegion(region,camera,sun),stats);assert.equal(stats.testedCells,0,'stationary view does not retest cells');
  camera.position.x = 60;camera.lookAt(60,0,0);
  updateSpatialRegion(region,camera,sun);
  assert.equal(offscreen.parent.parent,region.root,'reentry attaches the ready original mesh immediately');
  assert.equal(near.parent.parent,null);assert.equal(stats.attachedObjects,2);
  assert.deepEqual(region.spatial.cells.map(cell=>cell.group),retained);assert.deepEqual(region.spatial.cells.map(cell=>cell.bounds),matrices);
  sun.castShadow = false;updateSpatialRegion(region,camera,sun);assert.equal(shadow.parent.parent,null);
  restoreSpatialRegion(region);assert.deepEqual(source.children,[near,shadow,offscreen,noncaster]);
  assert.equal(Object.hasOwn(offscreen.userData,'residentCell'),false);
  disposeObject(region.root);
});

test('flattening preserves nested frozen transforms, atlased root changes, and exact restoration',()=>{
  const region = makeRegion(),a = new THREE.Group(),b = new THREE.Group(),object = mesh(3,-4,true);
  region.root.position.set(130,4,-70);a.position.set(7,2,6);a.rotation.y = .63;a.scale.set(2,.8,.7);
  b.rotation.z = .27;b.scale.set(.8,1.4,1.1);b.add(object);a.add(b);region.root.add(a);
  region.root.updateMatrixWorld(true);
  const originalWorld = object.matrixWorld.clone(),originalLocal = object.matrix.clone();
  for (const o of [a,b,object]) { o.matrixAutoUpdate = false;o.matrixWorldAutoUpdate = false; }
  prepareSpatialRegion(region,{cellSize:8});assertMatrix(object.matrixWorld,originalWorld);
  assert.equal(object.matrixAutoUpdate,false);assert.equal(object.matrixWorldAutoUpdate,false);
  const camera = cameraAt(200,-20);updateSpatialRegion(region,camera,null);
  assertMatrix(object.matrixWorld,originalWorld);
  region.root.position.x += 13;region.root.position.z -= 9;
  updateSpatialRegion(region,camera,null);
  const shifted = originalWorld.clone();shifted.elements[12] += 13;shifted.elements[14] -= 9;
  assertMatrix(object.matrixWorld,shifted);
  restoreSpatialRegion(region);assert.equal(object.parent,b);assert.equal(b.parent,a);assert.equal(a.parent,region.root);
  assertMatrix(object.matrix,originalLocal);assertMatrix(object.matrixWorld,shifted);
  assert.equal(Object.hasOwn(object,'boundingSphere'),false);assert.equal(object.matrixWorldAutoUpdate,false);
  disposeObject(region.root);
});

test('animation, waypoints, marker sprites and callback pivot dependencies keep their hierarchy',()=>{
  const region = makeRegion(),npc = new THREE.Group(),npcMesh = mesh(0,0),scarf = mesh(2,0),marker = mesh(3,0),fire = new THREE.Sprite();
  npc.add(npcMesh);region.npcs.push({root:npc,scarf:{mesh:scarf}});region.npcMarkers.push(marker);region.fires.push({sprite:fire});
  const waypoint = new THREE.Group(),stone = mesh(4,0);waypoint.add(stone);region.waypointStones.set('north',waypoint);
  const landmarks = new THREE.Group();landmarks.name = 'blender-landmarks';
  const windmill = new THREE.Group(),pivot = new THREE.Group(),spinner = mesh(5,0),sibling = mesh(6,0);
  spinner.onBeforeRender = ()=>{};pivot.add(spinner,sibling);windmill.add(pivot);landmarks.add(windmill);
  const staticMesh = mesh(10,0);region.root.add(npc,scarf,marker,fire,waypoint,landmarks,staticMesh);
  const openingProp = new THREE.Group(),openingMesh = mesh(8,0);openingProp.add(openingMesh);
  region.weaponProps = {sword:openingProp};region.root.add(openingProp);
  const stats = prepareSpatialRegion(region);assert.equal(stats.objects,1);
  updateSpatialRegion(region,cameraAt(100,100),null);
  assert.equal(npc.parent,region.root);assert.equal(npcMesh.parent,npc);assert.equal(scarf.parent,region.root);
  assert.equal(marker.parent,region.root);assert.equal(fire.parent,region.root);assert.equal(stone.parent,waypoint);
  assert.equal(spinner.parent,pivot);assert.equal(sibling.parent,pivot);assert.equal(windmill.parent,landmarks);
  assert.equal(openingProp.parent,region.root);assert.equal(openingMesh.parent,openingProp);
  openingProp.visible = false;
  const rendered = [];region.root.traverseVisible(o=>{if(o.isMesh)rendered.push(o);});
  assert.equal(rendered.includes(openingMesh),false,'finishing the opening hides the actual item branch');
  restoreSpatialRegion(region);assert.equal(staticMesh.parent,region.root);
  disposeObject(region.root);
});

test('wind envelopes and immutable full grass bounds retain geometry before visible pixels enter',()=>{
  const region = makeRegion(),tree = new THREE.InstancedMesh(new THREE.BoxGeometry(.2,10,.2),new THREE.MeshBasicMaterial(),1);
  tree.geometry.translate(0,5,0);tree.material.userData.windPatch = {wind:.4,windBase:0};
  tree.setMatrixAt(0,new THREE.Matrix4().makeTranslation(9,0,0));region.root.add(tree);
  const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshBasicMaterial(),2);
  grass.userData.grassCulling = {bounds:new THREE.Sphere(new THREE.Vector3(0,0,0),2)};
  grass.count = 0;region.root.add(grass);
  const oldSphere = tree.boundingSphere;
  const stats = prepareSpatialRegion(region,{cellSize:8,margin:0});assert.equal(stats.objects,2);
  updateSpatialRegion(region,cameraAt(),null);
  assert.equal(tree.parent.parent,region.root,'GPU sway can enter the camera before the fixed tree does');
  assert.equal(grass.parent.parent,region.root,'a previously compacted empty grass draw retains its full clump bounds');
  assert.ok(tree.boundingSphere.radius >= 7);
  restoreSpatialRegion(region);assert.equal(tree.boundingSphere,oldSphere);
  disposeObject(region.root);
});

test('restoring hidden cells before imported/root disposal releases shared resources once',()=>{
  const region = makeRegion(),imported = new THREE.Group(),geometry = new THREE.BoxGeometry(),material = new THREE.MeshBasicMaterial();
  const first = new THREE.Mesh(geometry,material),second = new THREE.Mesh(geometry,material);
  first.position.x = 100;second.position.x = 140;imported.add(first,second);region.root.add(imported);
  let geometries = 0,materials = 0;geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);
  prepareSpatialRegion(region,{cellSize:8});updateSpatialRegion(region,cameraAt(),null);
  assert.equal(region.spatial.stats.attachedCells,0);assert.equal(geometries,0);assert.equal(materials,0);
  restoreSpatialRegion(region);restoreSpatialRegion(region);
  assert.equal(imported.parent,region.root);assert.deepEqual(imported.children,[first,second]);
  disposeObject(imported);disposeObject(region.root,new Set([geometry,material]));
  assert.equal(geometries,1);assert.equal(materials,1);
  region.disposed = true;assert.equal(prepareSpatialRegion(region),null);assert.equal(updateSpatialRegion(region,cameraAt(),null),null);
});

test('cell grouping preserves a nested group resetting ancestor render order',()=>{
  const region = makeRegion(),outer = new THREE.Group(),inner = new THREE.Group(),object = mesh(0,0);
  outer.renderOrder = 7;inner.renderOrder = 0;inner.add(object);outer.add(inner);region.root.add(outer);
  prepareSpatialRegion(region);assert.equal(object.parent.renderOrder,0);
  restoreSpatialRegion(region);assert.equal(object.parent,inner);assert.equal(outer.renderOrder,7);
  disposeObject(region.root);
});

test('individual padded boxes reject offscreen batches retained by a shared cell and restore authored tests',()=>{
  const region=makeRegion(),near=mesh(0,0),long=new THREE.Mesh(new THREE.BoxGeometry(80,1,1),new THREE.MeshBasicMaterial());
  long.position.set(0,.5,50);long.castShadow=true;
  const original=long.intersectsFrustum;
  region.root.add(near,long);prepareSpatialRegion(region,{cellSize:128,margin:0});
  const camera=cameraAt(),clip=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),frustum=new THREE.Frustum().setFromProjectionMatrix(clip);
  assert.equal(frustum.intersectsObject(long),true,'the previous enclosing sphere draws this invisible batch');
  assert.equal(long.intersectsFrustum(frustum),false,'the complete padded box is outside the camera');
  region.root.position.z=-50;updateSpatialRegion(region,camera,null);
  assert.equal(long.intersectsFrustum(frustum),true,'bounds follow a translated native region immediately');
  restoreSpatialRegion(region);assert.equal(long.intersectsFrustum,original);assert.equal(Object.hasOwn(long,'intersectsFrustum'),false);
  const authored=()=>false;near.intersectsFrustum=authored;
  prepareSpatialRegion(region);assert.equal(near.intersectsFrustum,authored,'authored culling retains its behaviour while playing');restoreSpatialRegion(region);
  assert.equal(near.intersectsFrustum,authored,'quality/disposal restoration preserves an authored override');
  disposeObject(region.root);
});
