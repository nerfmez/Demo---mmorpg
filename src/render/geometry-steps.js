/*
 * Edge hashing adapted from Three.js; Copyright 2010-2026 Three.js Authors.
 * SPDX-License-Identifier: MIT
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
// Incremental equivalents for construction-time geometry operations. No LOD,
// decimation or vertex-order changes. Scratch values belong to each iterator.
// Edge hash algorithm follows Three.js EdgesGeometry (MIT, project-bundled r186), with yield points.
import * as THREE from 'three';

export function* finishGeometrySteps(g, normals = false, sphereBounds = true) {
  const p = g.attributes.position, v = new THREE.Vector3();
  if (normals) {
    if (g.index) throw new Error('Incremental flat normals require triangle soup');
    const n = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), cb = new THREE.Vector3();
    g.setAttribute('normal', n);
    for (let i = 0; i < p.count; i += 3) {
      if (i && i % 768 === 0) yield;
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      // Three writes the unnormalised cross product to Float32 before normalising.
      for (let k = 0; k < 3; k++) n.setXYZ(i + k, cb.x, cb.y, cb.z);
    }
    for (let i = 0; i < n.count; i++) {
      if (i && i % 1024 === 0) yield;
      v.fromBufferAttribute(n, i).normalize(); n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const box = new THREE.Box3();
  for (let i = 0; i < p.count; i++) {
    if (i && i % 1024 === 0) yield;
    box.expandByPoint(v.fromBufferAttribute(p, i));
  }
  g.boundingBox = box;
  if(!sphereBounds)return g;
  const sphere = new THREE.Sphere(); box.getCenter(sphere.center);
  let radiusSquared = 0;
  for (let i = 0; i < p.count; i++) {
    if (i && i % 1024 === 0) yield;
    radiusSquared = Math.max(radiusSquared, sphere.center.distanceToSquared(v.fromBufferAttribute(p, i)));
  }
  sphere.radius = Math.sqrt(radiusSquared); g.boundingSphere = sphere;
  return g;
}

export function* mergeGeometrySteps(parts, owner) {
  if (!parts.length) throw new Error('Cannot merge an empty geometry batch');
  if (parts.some(g => g.index)) throw new Error('Incremental merge requires nonindexed parts');
  const names = Object.keys(parts[0].attributes), g = new THREE.BufferGeometry();
  owner?.geometry(g);
  let delivered = false;
  try {
    for (const name of names) {
      const first = parts[0].attributes[name], arrays = parts.map(p => p.attributes[name]);
      if (arrays.some(a => !a || a.isInterleavedBufferAttribute || a.itemSize !== first.itemSize || a.array.constructor !== first.array.constructor || a.normalized !== first.normalized)
        || parts.some(p => Object.keys(p.attributes).length !== names.length)) throw new Error('Incompatible construction geometry');
      const array = new first.array.constructor(arrays.reduce((sum, a) => sum + a.array.length, 0));
      let at = 0;
      for (const a of arrays) for (let i = 0; i < a.array.length; i += 4096) {
        array.set(a.array.subarray(i, i + 4096), at); at += Math.min(4096, a.array.length - i); yield;
      }
      g.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, first.normalized));
    }
    delivered = true; return g;
  } finally { if (!delivered) owner ? owner.release(g) : g.dispose(); }
}

export function* transformGeometrySteps(g, matrix) {
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3();
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name]; if (!a) continue;
    for (let i = 0; i < a.count; i++) {
      if (i && i % 1024 === 0) yield;
      v.fromBufferAttribute(a, i);
      if (name === 'position') v.applyMatrix4(matrix); else v.applyNormalMatrix(normalMatrix);
      a.setXYZ(i, v.x, v.y, v.z);
    }
    a.needsUpdate = true;
  }
  return g;
}

export function* edgeGeometrySteps(geometry, angle = 1, owner) {
  // three.js EdgesGeometry, keyed by numbers: each distinct (1e-4 rounded) position gets
  // an id once, an edge is idA*2^26+idB. Same edges, same order (a Map keeps insertion
  // order like the string-keyed object did), without strings per triangle edge.
  const dot = Math.cos(THREE.MathUtils.DEG2RAD * angle), idx = geometry.index, p = geometry.attributes.position;
  const count = idx ? idx.count : p.count, triangle = new THREE.Triangle(), normal = new THREE.Vector3();
  const vs = [triangle.a, triangle.b, triangle.c], indices = [0, 0, 0], ids = [0, 0, 0], edges = new Map(), vertices = [];
  const idOf = new Map(), byIndex = idx ? new Int32Array(p.count).fill(-1) : null, K = 67108864;
  for (let i = 0; i < count; i += 3) {
    if (i && i % 384 === 0) yield;
    for (let j = 0; j < 3; j++) {
      const index = indices[j] = idx ? idx.getX(i + j) : i + j; const v = vs[j].fromBufferAttribute(p, index);
      let id = byIndex ? byIndex[index] : -1;
      if (id < 0) {
        const hash = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
        id = idOf.get(hash); if (id === undefined) { id = idOf.size; idOf.set(hash, id); }
        if (byIndex) byIndex[index] = id;
      }
      ids[j] = id;
    }
    triangle.getNormal(normal);
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) continue;
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3, hash = ids[j] * K + ids[k], reverse = ids[k] * K + ids[j], back = edges.get(reverse);
      if (back) {
        if (normal.dot(back.normal) <= dot) vertices.push(vs[j].x, vs[j].y, vs[j].z, vs[k].x, vs[k].y, vs[k].z);
        edges.set(reverse, null);
      } else if (!edges.has(hash)) edges.set(hash, { a: indices[j], b: indices[k], normal: normal.clone() });
    }
  }
  let n = 0;
  for (const edge of edges.values()) {
    if (++n % 256 === 0) yield;
    if (!edge) continue;
    const a = vs[0].fromBufferAttribute(p, edge.a), b = vs[1].fromBufferAttribute(p, edge.b);
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry(); owner?.geometry(g);
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); return g;
}

export function* batchPartSteps(geometry, surface, hull, matrix, owner) {
  const p = geometry.attributes.position, nrm = geometry.attributes.normal, idx = geometry.index;
  const count = idx ? idx.count : p.count, g = new THREE.BufferGeometry(); owner?.geometry(g);
  let delivered = false;
  try {
    const pos = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3), hullColors = new Float32Array(count * 3);
    const color = surface?.color || new THREE.Color(1, 1, 1), edge = hull?.color || new THREE.Color(0, 0, 0), vc = surface?.vertexColors && geometry.attributes.color;
    for (let i = 0; i < count; i++) {
      if (i && i % 1024 === 0) yield;
      const j = idx ? idx.getX(i) : i, k = i * 3;
      pos[k] = p.getX(j); pos[k + 1] = p.getY(j); pos[k + 2] = p.getZ(j);
      if (nrm) { normals[k] = nrm.getX(j); normals[k + 1] = nrm.getY(j); normals[k + 2] = nrm.getZ(j); }
      colors[k] = color.r * (vc ? vc.getX(j) : 1); colors[k + 1] = color.g * (vc ? vc.getY(j) : 1); colors[k + 2] = color.b * (vc ? vc.getZ(j) : 1);
      hullColors[k] = edge.r; hullColors[k + 1] = edge.g; hullColors[k + 2] = edge.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.setAttribute('hullColor', new THREE.BufferAttribute(hullColors, 3));
    yield* transformGeometrySteps(g, matrix); delivered = true; return g;
  } finally { if (!delivered) owner ? owner.release(g) : g.dispose(); }
}
