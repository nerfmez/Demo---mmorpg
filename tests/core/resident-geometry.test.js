import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WebGLAttributes} from 'three/src/renderers/webgl/WebGLAttributes.js';
import {WebGLGeometries} from 'three/src/renderers/webgl/WebGLGeometries.js';
import {compactResidentGeometry, residentGeometryBytes, RESIDENT_ATTRIBUTE_ERROR} from '../../src/render/resident-geometry.js';
import {importJob} from '../../src/render/import-job.js';
import {disposeObject} from '../../src/render/dispose.js';

function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1,2,3,4,5,6,7,8,9], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([-.6,.8,0,.12,.34,.9327,1,0,-1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,.25,.5,.75,1,1], 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([.01,.2,1,.333,.45,.6,0,.5,.78], 3));
  geometry.setAttribute('hullColor', new THREE.Float32BufferAttribute([.03,.025,.06,.11,.24,.32,0,0,0], 3));
  geometry.setIndex([0,1,2]);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const root = new THREE.Group();root.add(new THREE.Mesh(geometry, new THREE.MeshToonMaterial()), new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  return {geometry, root, importedState:'imported-ready', stats:{}};
}

test('unit buffers shrink while topology, positions, UV, bounds and shared geometry stay exact', () => {
  const region = fixture(), geometry = region.geometry, original = {...geometry.attributes}, index = geometry.index;
  const box = geometry.boundingBox.clone(), sphere = geometry.boundingSphere.clone(), bytesBefore = residentGeometryBytes(region.root);
  const stats = compactResidentGeometry(region);
  assert.equal(stats.bytesBefore, bytesBefore);assert.equal(stats.bytesSaved, (original.normal.array.length + original.color.array.length + original.hullColor.array.length) * 2);
  assert.equal(stats.bytesAfter, residentGeometryBytes(region.root));assert.equal(stats.packedGeometries, 1);assert.equal(stats.packedAttributes, 3);
  assert.ok(geometry.attributes.normal.array instanceof Int16Array);
  for (const name of ['color', 'hullColor']) assert.ok(geometry.attributes[name].array instanceof Uint16Array);
  for (const name of ['normal', 'color', 'hullColor']) {
    const attribute = geometry.attributes[name], bound = name === 'normal' ? RESIDENT_ATTRIBUTE_ERROR.normal : RESIDENT_ATTRIBUTE_ERROR.unit;
    assert.equal(attribute.normalized, true);assert.equal(attribute.itemSize, original[name].itemSize);
    for (let i = 0; i < attribute.count; i++) for (let j = 0; j < attribute.itemSize; j++)
      assert.ok(Math.abs(attribute.getComponent(i,j) - original[name].getComponent(i,j)) <= bound + 1e-15);
  }
  assert.equal(geometry.attributes.position, original.position);assert.equal(geometry.attributes.uv, original.uv);assert.equal(geometry.index, index);
  assert.deepEqual(geometry.boundingBox, box);assert.deepEqual(geometry.boundingSphere, sphere);
  for (const object of region.root.children) assert.equal(object.geometry, geometry);
  assert.equal(Object.hasOwn(geometry.userData, 'residentBufferReset'), false);
  const next = compactResidentGeometry(region);assert.equal(next.bytesSaved, 0);assert.equal(next.packedGeometries, 0);
});

test('shared attributes keep their aliases across geometries; ground weights retain precise decoded values', () => {
  const region = fixture(), other = new THREE.BufferGeometry();
  other.setAttribute('position', region.geometry.attributes.position);other.setAttribute('normal', region.geometry.attributes.normal);
  for (const name of ['aSplat', 'aCoast', 'aTown', 'aTintL', 'aTintD', 'beachWash', 'coastJoin'])
    other.setAttribute(name, new THREE.Float32BufferAttribute([0,.345678,1], 1));
  region.root.add(new THREE.Mesh(other, new THREE.MeshBasicMaterial()));
  const originalNormal = region.geometry.attributes.normal;
  compactResidentGeometry(region);assert.equal(other.attributes.normal, region.geometry.attributes.normal);assert.notEqual(other.attributes.normal, originalNormal);
  for (const name of ['aSplat', 'aCoast', 'aTown', 'aTintL', 'aTintD', 'beachWash', 'coastJoin']) {
    const a = other.attributes[name];assert.ok(a.array instanceof Uint16Array);assert.equal(a.getX(0), 0);assert.equal(a.getX(2), 1);
    assert.ok(Math.abs(a.getX(1) - Math.fround(.345678)) <= RESIDENT_ATTRIBUTE_ERROR.unit);
  }
});

test('grass snapshots, dynamic inputs, HDR, distances and unsupported formats stay untouched', () => {
  const region = fixture(), grassGeometry = region.geometry.clone(), grass = new THREE.InstancedMesh(grassGeometry, new THREE.MeshBasicMaterial(), 1);
  grass.name = 'ground-blended-grass';grass.userData.grassCulling = {attributes:Object.values(grassGeometry.attributes), sources:Object.values(grassGeometry.attributes).map(a => a.array.slice())};
  region.root.add(grass);const grassAttributes = {...grassGeometry.attributes}, snapshots = grass.userData.grassCulling.sources;
  const geometry = new THREE.BufferGeometry(), fields = {
    color:new THREE.Float32BufferAttribute([0,1,2],3),
    hullColor:new THREE.Float32BufferAttribute([.1,.2,.3],3).setUsage(THREE.DynamicDrawUsage),
    normal:new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array([0,1,0,42]),4),3,0),
    depth:new THREE.Float32BufferAttribute([0,.2,1],1),
    shore:new THREE.Float32BufferAttribute([0,.4,1],1),
    aTown:new THREE.Float32BufferAttribute([0,NaN,1],1),
  };
  for (const [name, attribute] of Object.entries(fields)) geometry.setAttribute(name, attribute);
  region.root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  // This attribute is aliased to a grass input and must keep that exact object.
  region.geometry.setAttribute('normal', grassGeometry.attributes.normal);
  compactResidentGeometry(region);
  for (const [name, attribute] of Object.entries(grassAttributes)) assert.equal(grassGeometry.attributes[name], attribute);
  assert.equal(region.geometry.attributes.normal, grassGeometry.attributes.normal);assert.equal(grass.userData.grassCulling.sources, snapshots);
  for (const [name, attribute] of Object.entries(fields)) assert.equal(geometry.attributes[name], attribute);
});

test('a GPU reset deletes old buffers and imported cleanup later deletes the new buffers exactly once', () => {
  const region = fixture(), geometry = region.geometry, job = importJob(), material = region.root.children[0].material;
  job.geometry(geometry);job.material(material);const destroy = job.commit(region.root);
  const alive = new Set(), uploads = [], releases = [], gl = {
    FLOAT:5126, SHORT:5122, UNSIGNED_SHORT:5123, ARRAY_BUFFER:34962, ELEMENT_ARRAY_BUFFER:34963,
    createBuffer(){const buffer = {};alive.add(buffer);return buffer;},bindBuffer(){},
    bufferData(type,array){uploads.push(array.constructor);},deleteBuffer(buffer){assert.ok(alive.delete(buffer), 'buffer freed once');},
  };
  const attributes = WebGLAttributes(gl), info = {memory:{geometries:0}}, geometries = WebGLGeometries(gl, attributes, info, {releaseStatesOfGeometry:g => releases.push(g)});
  const upload = () => {geometries.get(region.root.children[0], geometry);geometries.update(geometry);attributes.update(geometry.index, gl.ELEMENT_ARRAY_BUFFER);};
  let resets = 0, finalDisposals = 0;geometry.addEventListener('dispose', () => geometry.userData.residentBufferReset ? resets++ : finalDisposals++);
  upload();assert.equal(alive.size, 6);assert.equal(info.memory.geometries, 1);
  compactResidentGeometry(region);assert.equal(alive.size, 0);assert.equal(info.memory.geometries, 0);assert.equal(resets, 1);assert.equal(finalDisposals, 0);
  upload();assert.equal(alive.size, 6);assert.ok(uploads.includes(Int16Array));assert.ok(uploads.includes(Uint16Array));
  const handled = destroy();disposeObject(region.root, handled);destroy();
  assert.equal(finalDisposals, 1);assert.equal(alive.size, 0);assert.equal(info.memory.geometries, 0);assert.deepEqual(releases, [geometry, geometry]);
});

test('compaction requires completed imports and the complete undetached region', () => {
  const region = fixture();region.importedState = 'loading';assert.throws(() => compactResidentGeometry(region), /after imports/);
  region.importedState = 'imported-ready';region.spatial = {};assert.throws(() => compactResidentGeometry(region), /before spatial/);
  delete region.spatial;region.disposed = true;assert.equal(compactResidentGeometry(region), null);
});
