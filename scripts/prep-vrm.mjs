// Slim a VRoid Studio export for the game: keeps only the expression morph targets the game
// uses (VRoid ships 57, all decoded to dense arrays in memory at load), blanks the thumbnail
// image, and rebuilds the binary chunk without the orphaned data. Geometry, skinning, textures
// and the VRM extensions stay as they are.
// Usage: node scripts/prep-vrm.mjs assets/vrm/hero_vrm.source.vrm public/models/hero_vrm.vrm
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) throw new Error('usage: node scripts/prep-vrm.mjs <in.vrm> <out.vrm>');

const KEEP_PRESETS = ['blink', 'happy', 'angry', 'sad', 'surprised', 'relaxed']; // see FACE_EXPRESSION in src/render/vrm-body.js
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const glb = readFileSync(inPath);
if (glb.toString('latin1', 0, 4) !== 'glTF') throw new Error('not a binary glTF');
let off = 12, json, bin;
while (off < glb.length) {
  const len = glb.readUInt32LE(off), type = glb.toString('latin1', off + 4, off + 8);
  if (type === 'JSON') json = JSON.parse(glb.toString('utf8', off + 8, off + 8 + len));
  else if (type.startsWith('BIN')) bin = glb.subarray(off + 8, off + 8 + len);
  off += 8 + len;
}

// ---- 1. keep only the morph targets behind the expressions the game uses ----
const vrm = json.extensions.VRMC_vrm;
const expr = vrm.expressions || {};
const keepMesh = new Map(); // mesh index -> Set of old target indices
const meshOfNode = (n) => json.nodes[n].mesh;
for (const name of KEEP_PRESETS) {
  for (const b of expr.preset?.[name]?.morphTargetBinds || []) {
    const m = meshOfNode(b.node);
    if (!keepMesh.has(m)) keepMesh.set(m, new Set());
    keepMesh.get(m).add(b.index);
  }
}
const remap = new Map(); // mesh -> Map(old index -> new index)
json.meshes.forEach((mesh, mi) => {
  const total = mesh.primitives[0].targets?.length || 0;
  if (!total) return;
  const keep = [...(keepMesh.get(mi) || [])].sort((a, b) => a - b);
  remap.set(mi, new Map(keep.map((old, i) => [old, i])));
  for (const p of mesh.primitives) {
    p.targets = keep.map((i) => p.targets[i]);
    if (!p.targets.length) delete p.targets;
  }
  if (mesh.extras?.targetNames) mesh.extras.targetNames = keep.map((i) => mesh.extras.targetNames[i]);
  if (mesh.weights) mesh.weights = keep.map((i) => mesh.weights[i]);
  if (!keep.length) delete mesh.weights;
});
for (const name of Object.keys(expr.preset || {})) {
  if (!KEEP_PRESETS.includes(name)) delete expr.preset[name];
  else for (const b of expr.preset[name].morphTargetBinds || []) b.index = remap.get(meshOfNode(b.node)).get(b.index);
}
delete expr.custom;

// ---- 2. blank the thumbnail ----
const thumb = vrm.meta.thumbnailImage;
const replaced = new Map(); // bufferView index -> replacement bytes
if (thumb !== undefined) replaced.set(json.images[thumb].bufferView, ONE_PIXEL_PNG);

// ---- 3. rebuild accessors, bufferViews and the binary chunk without the orphans ----
const usedAcc = [];
const accMap = new Map();
const useAcc = (i) => {
  if (!accMap.has(i)) {
    accMap.set(i, usedAcc.length);
    usedAcc.push(i);
  }
  return accMap.get(i);
};
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = useAcc(p.attributes[k]);
    if (p.indices !== undefined) p.indices = useAcc(p.indices);
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = useAcc(t[k]);
  }
}
for (const s of json.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = useAcc(s.inverseBindMatrices);
for (const a of json.animations || []) for (const s of a.samplers) { s.input = useAcc(s.input); s.output = useAcc(s.output); }

const usedBv = [];
const bvMap = new Map();
const useBv = (i) => {
  if (!bvMap.has(i)) {
    bvMap.set(i, usedBv.length);
    usedBv.push(i);
  }
  return bvMap.get(i);
};
const oldAcc = json.accessors;
json.accessors = usedAcc.map((old) => {
  const a = { ...oldAcc[old] };
  if (a.bufferView !== undefined) a.bufferView = useBv(a.bufferView);
  if (a.sparse) {
    a.sparse = { ...a.sparse, indices: { ...a.sparse.indices, bufferView: useBv(a.sparse.indices.bufferView) }, values: { ...a.sparse.values, bufferView: useBv(a.sparse.values.bufferView) } };
  }
  return a;
});
for (const im of json.images || []) if (im.bufferView !== undefined) im.bufferView = useBv(im.bufferView);

const oldBv = json.bufferViews;
const chunks = [];
let pos = 0;
json.bufferViews = usedBv.map((old) => {
  const v = oldBv[old];
  const data = replaced.get(old) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  const pad = (4 - (pos % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  pos += pad;
  const nv = { ...v, byteOffset: pos, byteLength: data.length };
  chunks.push(Buffer.from(data));
  pos += data.length;
  return nv;
});
const newBin = Buffer.concat(chunks);
json.buffers = [{ byteLength: newBin.length }];

// ---- 4. write the GLB ----
const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const binPad = Buffer.alloc((4 - (newBin.length % 4)) % 4);
const jsonLen = jsonBuf.length + jsonPad.length, binLen = newBin.length + binPad.length;
const head = Buffer.alloc(12);
head.write('glTF', 0, 'latin1');
head.writeUInt32LE(2, 4);
head.writeUInt32LE(12 + 8 + jsonLen + 8 + binLen, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.write(type, 4, 'latin1');
  return b;
};
writeFileSync(outPath, Buffer.concat([head, ch(jsonLen, 'JSON'), jsonBuf, jsonPad, ch(binLen, 'BIN\0'), newBin, binPad]));
const kept = [...remap.values()].reduce((n, m) => n + m.size, 0);
console.log(`${inPath} ${(glb.length / 1e6).toFixed(2)} MB -> ${outPath} ${((12 + 16 + jsonLen + binLen) / 1e6).toFixed(2)} MB, ${kept} morph targets kept`);
