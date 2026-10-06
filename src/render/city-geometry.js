// Cooperative city geometry; no detail reduction. Edge selection retains Three's
// welding precision, winding, threshold ties and insertion order.
/**
 * Portions adapted from Three.js EdgesGeometry.
 * Copyright 2010-2026 Three.js Authors. SPDX-License-Identifier: MIT
 *
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
import * as THREE from 'three';

export function* featureEdgesSteps(geometry, thresholdAngle = 1) {
  const triangle = new THREE.Triangle(), normal = new THREE.Vector3();
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  const thresholdDot = Math.cos(THREE.MathUtils.DEG2RAD * thresholdAngle);
  const index = geometry.getIndex(), position = geometry.getAttribute('position');
  const count = index ? index.count : position.count, indices = [0,0,0], keys = ['a','b','c'], hashes = new Array(3);
  // A Map iterates lazily; object-key enumeration itself could become a large step.
  const edges = new Map(), vertices = [];
  for (let i = 0; i < count; i += 3) {
    if (i % 384 === 0) yield;
    for (let j = 0; j < 3; j++) {
      indices[j] = index ? index.getX(i+j) : i+j;
      const v = triangle[keys[j]].fromBufferAttribute(position, indices[j]);
      hashes[j] = `${Math.round(v.x*1e4)},${Math.round(v.y*1e4)},${Math.round(v.z*1e4)}`;
    }
    triangle.getNormal(normal);
    if (hashes[0] === hashes[1] || hashes[1] === hashes[2] || hashes[2] === hashes[0]) continue;
    for (let j = 0; j < 3; j++) {
      const next = (j+1)%3, hash = `${hashes[j]}_${hashes[next]}`, reverseHash = `${hashes[next]}_${hashes[j]}`;
      const a = triangle[keys[j]], b = triangle[keys[next]], reverse = edges.get(reverseHash);
      if (reverse) {
        if (normal.dot(reverse.normal) <= thresholdDot) vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);
        edges.set(reverseHash, null);
      } else if (!edges.has(hash)) {
        edges.set(hash, {index0:indices[j], index1:indices[next], normal:normal.clone()});
      }
    }
  }
  let unmatched = 0;
  for (const edge of edges.values()) {
    if (unmatched++ % 384 === 0) yield;
    if (!edge) continue;
    v0.fromBufferAttribute(position, edge.index0); v1.fromBufferAttribute(position, edge.index1);
    vertices.push(v0.x,v0.y,v0.z,v1.x,v1.y,v1.z);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices,3));
}

// Non-indexed, compatible attributes are the output of both city edge/part builders.
// Allocate once, then copy bounded spans instead of one large mergeGeometries call.
export function* mergeCityGeometriesSteps(parts) {
  if (!parts.length) throw new Error('No city geometry parts');
  const names = Object.keys(parts[0].attributes), result = new THREE.BufferGeometry();
  let installed = false;
  try {
    for (const name of names) {
      const first = parts[0].attributes[name];
      let length = 0;
      for (const part of parts) {
        const a = part.attributes[name];
        if (part.index || Object.keys(part.attributes).length !== names.length || !a || a.isInterleavedBufferAttribute || a.itemSize !== first.itemSize || a.normalized !== first.normalized || a.array.constructor !== first.array.constructor) throw new Error('Incompatible city geometry attributes: ' + name);
        length += a.array.length;
        yield;
      }
      const array = new first.array.constructor(length);
      result.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, first.normalized));
      let offset = 0;
      for (const part of parts) {
        const source = part.attributes[name].array;
        for (let i = 0; i < source.length; i += 8192) {
          array.set(source.subarray(i, i + 8192), offset + i); yield;
        }
        offset += source.length;
      }
    }
    installed = true; return result;
  } finally { if (!installed) result.dispose(); }
}

export function* cityBoundsSteps(geometry, sphere = true) {
  const p = geometry.attributes.position, box = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    box.expandByPoint(v.fromBufferAttribute(p, i));
    if (i % 1024 === 1023) yield;
  }
  geometry.boundingBox = box;
  if (sphere) {
    const bound = new THREE.Sphere(); box.getCenter(bound.center);
    let max = 0;
    for (let i = 0; i < p.count; i++) {
      max = Math.max(max, bound.center.distanceToSquared(v.fromBufferAttribute(p, i)));
      if (i % 1024 === 1023) yield;
    }
    bound.radius = Math.sqrt(max); geometry.boundingSphere = bound;
  }
}

export function* transformCityGeometrySteps(geometry, matrix) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const vector = new THREE.Vector3(), normal = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < p.count; i++) {
    vector.fromBufferAttribute(p, i).applyMatrix4(matrix); p.setXYZ(i, vector.x, vector.y, vector.z);
    if (n) { vector.fromBufferAttribute(n, i).applyNormalMatrix(normal); n.setXYZ(i, vector.x, vector.y, vector.z); }
    if (i % 1024 === 1023) yield;
  }
  p.needsUpdate = true; if (n) n.needsUpdate = true;
  if (geometry.boundingBox || geometry.boundingSphere) yield* cityBoundsSteps(geometry, !!geometry.boundingSphere);
  return geometry;
}

export function* cityPartSteps(geometry, surface, hull, matrix) {
  const p = geometry.attributes.position, normal = geometry.attributes.normal, idx = geometry.index;
  const count = idx ? idx.count : p.count, part = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new (p.array?.constructor || p.data.array.constructor)(count * 3), 3, p.normalized);
  const normals = new THREE.BufferAttribute(new (normal?.array?.constructor || normal?.data?.array.constructor || Float32Array)(count * 3), 3, normal?.normalized || false);
  const colors = new THREE.BufferAttribute(new Float32Array(count * 3), 3), hullColors = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const color = surface?.color || new THREE.Color(1, 1, 1), hc = hull?.color || new THREE.Color(0, 0, 0), vc = surface?.vertexColors && geometry.attributes.color;
  part.setAttribute('position', positions); part.setAttribute('normal', normals); part.setAttribute('color', colors); part.setAttribute('hullColor', hullColors);
  let installed = false;
  try {
    for (let i = 0; i < count; i++) {
      const j = idx ? idx.getX(i) : i;
      positions.setXYZ(i, p.getX(j), p.getY(j), p.getZ(j));
      if (normal) normals.setXYZ(i, normal.getX(j), normal.getY(j), normal.getZ(j));
      colors.setXYZ(i, color.r * (vc ? vc.getX(j) : 1), color.g * (vc ? vc.getY(j) : 1), color.b * (vc ? vc.getZ(j) : 1));
      hullColors.setXYZ(i, hc.r, hc.g, hc.b);
      if (i % 1024 === 1023) yield;
    }
    yield* transformCityGeometrySteps(part, matrix);
    installed = true; return part;
  } finally { if (!installed) part.dispose(); }
}

// Cape clipping emits unindexed triangles. Preserve Three's float32 intermediate
// normal write, then normalise in a second pass for byte-identical flat normals.
export function* finishCityTrianglesSteps(vertices) {
  const geometry = new THREE.BufferGeometry();
  const p = new THREE.Float32BufferAttribute(vertices, 3), n = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
  geometry.setAttribute('position', p); geometry.setAttribute('normal', n);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cb = new THREE.Vector3(), ab = new THREE.Vector3();
  let installed = false;
  try {
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      for (let j = 0; j < 3; j++) n.setXYZ(i + j, cb.x, cb.y, cb.z);
      if (i % 768 === 765) yield;
    }
    for (let i = 0; i < n.count; i++) {
      a.fromBufferAttribute(n, i).normalize(); n.setXYZ(i, a.x, a.y, a.z);
      if (i % 1024 === 1023) yield;
    }
    n.needsUpdate = true; yield* cityBoundsSteps(geometry);
    installed = true; return geometry;
  } finally { if (!installed) geometry.dispose(); }
}
