// Resident maps trade streaming stalls for persistent buffers. Store unit inputs
// at 16-bit precision without removing vertices, texture detail or any scenery.
// Three/WebGL converts normalized integer inputs back to floats in the shader.
import * as THREE from 'three';

const compacted = new WeakSet(), packed = new WeakMap();
const unsignedFields = new Set(['color', 'hullColor', 'aSplat', 'aCoast', 'aTown',
  'aTintL', 'aTintD', 'beachWash', 'coastJoin']);
export const RESIDENT_ATTRIBUTE_ERROR = Object.freeze({ normal: .5 / 32767, unit: .5 / 65535 });

const storage = attribute => attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
function geometryAttributes(geometry) {
  return [...Object.values(geometry.attributes), geometry.index,
    ...Object.values(geometry.morphAttributes).flat()].filter(Boolean);
}
function bytes(geometries) {
  const seen = new Set();let total = 0;
  for (const geometry of geometries) for (const attribute of geometryAttributes(geometry)) {
    const source = storage(attribute);
    if (!seen.has(source)) { seen.add(source);total += source.array?.byteLength || 0; }
  }
  return total;
}

/** Unique render buffer bytes. Shared attributes/geometries are counted once. */
export function residentGeometryBytes(root) {
  const geometries = new Set();root.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
  return bytes(geometries);
}

function pack(attribute, signed) {
  if (!(attribute.array instanceof Float32Array) || attribute.normalized ||
      attribute.isInterleavedBufferAttribute || attribute.usage !== THREE.StaticDrawUsage ||
      attribute.gpuType !== THREE.FloatType) return null;
  const cached = packed.get(attribute);
  if (cached) return cached.signed === signed ? cached : null;
  const source = attribute.array, limit = signed ? 32767 : 65535;
  // Never clamp HDR colours, distance fields, invalid data or non-unit normals.
  for (const value of source) if (!Number.isFinite(value) || value < (signed ? -1 : 0) || value > 1) return null;
  const array = signed ? new Int16Array(source.length) : new Uint16Array(source.length);
  let error = 0;
  for (let i = 0; i < source.length; i++) {
    array[i] = Math.round(source[i] * limit);
    error = Math.max(error, Math.abs(array[i] / limit - source[i]));
  }
  const result = attribute.isInstancedBufferAttribute
    ? new THREE.InstancedBufferAttribute(array, attribute.itemSize, true, attribute.meshPerAttribute)
    : new THREE.BufferAttribute(array, attribute.itemSize, true);
  result.name = attribute.name;result.usage = attribute.usage;
  result.onUploadCallback = attribute.onUploadCallback;
  const entry = { attribute: result, error, signed };packed.set(attribute, entry);return entry;
}

function resetGeometryBuffers(geometry) {
  // dispose releases the OLD attribute buffers and VAOs before attributes change.
  // Imported ownership remains live: this is a temporary GPU reset, not teardown.
  const had = Object.hasOwn(geometry.userData, 'residentBufferReset'), previous = geometry.userData.residentBufferReset;
  geometry.userData.residentBufferReset = true;
  try { geometry.dispose(); }
  finally {
    if (had) geometry.userData.residentBufferReset = previous;
    else delete geometry.userData.residentBufferReset;
  }
}

/** After imports finish, before GPU warming/spatial detachment. Startup-only. */
export function compactResidentGeometry(region) {
  if (region.disposed) return null;
  if (region.spatial) throw new Error('Compact resident geometry before spatial preparation');
  if (region.importedState && region.importedState !== 'imported-ready')
    throw new Error('Compact resident geometry after imports finish');
  const geometries = new Set(), grass = new Set(), borrowedGrassAttributes = new Set();
  region.root.traverse(object => {
    if (!object.geometry) return;
    geometries.add(object.geometry);
    if (object.userData.grassCulling || object.name === 'ground-blended-grass') grass.add(object.geometry);
  });
  // Grass culling keeps snapshots of its attribute objects/arrays. Keep them and
  // every aliased attribute untouched instead of changing their packed domain.
  for (const geometry of grass) for (const attribute of geometryAttributes(geometry)) borrowedGrassAttributes.add(attribute);
  const formats = new Map();
  for (const geometry of geometries) for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const format = name === 'normal' ? 'signed' : unsignedFields.has(name) ? 'unit' : 'other';
    if (!formats.has(attribute)) formats.set(attribute, format);
    else if (formats.get(attribute) !== format) formats.set(attribute, 'other');
  }
  const stats = { bytesBefore: bytes(geometries), bytesAfter: 0, bytesSaved: 0,
    geometries: geometries.size, packedGeometries: 0, packedAttributes: 0,
    skippedGrassGeometries: grass.size, maxNormalError: 0, maxUnitError: 0 };
  const counted = new Set();
  for (const geometry of geometries) {
    if (grass.has(geometry) || compacted.has(geometry)) continue;
    const replacements = [];
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const format = formats.get(attribute);
      if (borrowedGrassAttributes.has(attribute) || format === 'other' ||
          (name !== 'normal' && !unsignedFields.has(name))) continue;
      const result = pack(attribute, format === 'signed');
      if (!result) continue;
      replacements.push([name, result.attribute]);
      if (!counted.has(attribute)) {
        counted.add(attribute);stats.packedAttributes++;
        const key = result.signed ? 'maxNormalError' : 'maxUnitError';
        stats[key] = Math.max(stats[key], result.error);
      }
    }
    if (replacements.length) {
      resetGeometryBuffers(geometry);
      for (const [name, attribute] of replacements) geometry.setAttribute(name, attribute);
      stats.packedGeometries++;
    }
    compacted.add(geometry);
  }
  stats.bytesAfter = bytes(geometries);stats.bytesSaved = stats.bytesBefore - stats.bytesAfter;
  region.stats ||= {};region.stats.residentGeometry = stats;return stats;
}
