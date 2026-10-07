#!/usr/bin/env python3
"""Turn a Meshy GLB into a monster model for monsterSkin.js (one static mesh, one 512 px colour map).

Usage: python3 scripts/prep-monster-glb.py in.glb out.glb [--keep N] [--tris N] [--yaw DEG] [--size 1.9] [--tex 512] [--info]

- Skinned or multi-node sources are baked at their rest pose (node transforms applied) and the skin dropped:
  the game weights the vertices itself from data/models.json (bones/segments).
- Disconnected pieces: --info lists them; --keep N keeps the N largest (a concept sheet may carry a
  second pose or the drops beside the monster).
- --tris N decimates to about N triangles (meshoptimizer, UVs and normals weighted so the texture stays put);
  the game budgets monsters at 5,000 (bosses 6,000) triangles. Needs: pip install numpy meshoptimizer pillow.
- --yaw DEG turns the model about Y (three.js convention) so its spine runs along +Z; a Meshy quadruped
  can stand a little turned. Check the joints with a rig dump or a side view.
- The model is centred and scaled so its longest side is --size (1.9, the other monster models' convention).
- Only the base colour map is kept, shrunk to --tex px (JPEG).
"""
import io, json, struct, sys
import numpy as np
from PIL import Image

import argparse
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst', nargs='?')
ap.add_argument('--keep', type=int, default=0); ap.add_argument('--yaw', type=float, default=0); ap.add_argument('--tris', type=int, default=0)
ap.add_argument('--size', type=float, default=1.9); ap.add_argument('--tex', type=int, default=512); ap.add_argument('--info', action='store_true')
a = ap.parse_args()
src, dst, keep, size, tex, tris, info = a.src, a.dst, a.keep, a.size, a.tex, a.tris, a.info

b = open(src, 'rb').read()
assert b[:4] == b'glTF'
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
blob = b[28 + jl:]

def accessor(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: '<u1'}[a['componentType']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride')
    if stride and stride != n * np.dtype(dt).itemsize:
        raw = np.frombuffer(blob, np.uint8, count=stride * a['count'], offset=off).reshape(a['count'], stride)
        return raw[:, :n * np.dtype(dt).itemsize].copy().view(dt).reshape(a['count'], n)
    return np.frombuffer(blob, dt, count=a['count'] * n, offset=off).reshape(a['count'], n)

def local(n):
    if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0]), float); q = n.get('rotation', [0, 0, 0, 1]); s = np.array(n.get('scale', [1, 1, 1]), float)
    x, y, z, w = q
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t; return M

world = {}
def walk(i, parent):
    world[i] = parent @ local(j['nodes'][i])
    for c in j['nodes'][i].get('children', []): walk(c, world[i])
children = {c for n in j['nodes'] for c in n.get('children', [])}
for r in [i for i in range(len(j['nodes'])) if i not in children]: walk(r, np.eye(4))

P, N, T, I, base = [], [], [], [], 0
mat_index = 0
for i, n in enumerate(j['nodes']):
    if 'mesh' not in n: continue
    M = world[i]; NM = np.linalg.inv(M[:3, :3]).T
    for pr in j['meshes'][n['mesh']]['primitives']:
        mat_index = pr.get('material', 0)
        p = accessor(pr['attributes']['POSITION']).astype(float)
        nn = accessor(pr['attributes']['NORMAL']).astype(float) if 'NORMAL' in pr['attributes'] else np.zeros_like(p)
        uv = accessor(pr['attributes']['TEXCOORD_0']).astype(float)
        idx = accessor(pr['indices']).reshape(-1).astype(np.int64)
        P.append(p @ M[:3, :3].T + M[:3, 3]); nrm = nn @ NM.T; N.append(nrm / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9))
        T.append(uv); I.append(idx + base); base += len(p)
P = np.concatenate(P); N = np.concatenate(N); T = np.concatenate(T); I = np.concatenate(I).reshape(-1, 3)
if a.yaw:
    c, s_ = np.cos(np.radians(a.yaw)), np.sin(np.radians(a.yaw))
    R = np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]])
    P, N = P @ R.T, N @ R.T

# connected pieces (vertices welded by position)
key = {}
weld = np.array([key.setdefault(tuple(np.round(p, 5)), len(key)) for p in P])
parent = list(range(len(key)))
def find(a):
    while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
for t in I:
    a, b2, c = (find(weld[v]) for v in t); parent[b2] = a; parent[find(c)] = a
comp = np.array([find(weld[t[0]]) for t in I])
ids, counts = np.unique(comp, return_counts=True)
order = ids[np.argsort(-counts)]
print(f'{src}: {len(I)} triangles, {len(order)} separate pieces')
for k, cid in enumerate(order[:8]):
    sel = I[comp == cid].reshape(-1); lo, hi = P[sel].min(0), P[sel].max(0)
    print(f'  piece {k}: {np.sum(comp == cid)} tris, size {np.round(hi - lo, 3)}, centre {np.round((hi + lo) / 2, 3)}')
if info or not dst: sys.exit()
if keep: I = I[np.isin(comp, order[:keep])]
used = np.unique(I); remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
P, N, T, I = P[used], N[used], T[used], remap[I]
lo, hi = P.min(0), P.max(0); s = size / (hi - lo).max()
P = (P - (hi + lo) / 2) * s
if tris and len(I) > tris:
    import ctypes, meshoptimizer as mo, meshoptimizer.simplifier as mos
    u, f, sz = ctypes.c_uint, ctypes.c_float, ctypes.c_size_t  # the binding declares no argtypes, so floats would pass as doubles
    mos.lib.meshopt_simplifyWithAttributes.argtypes = [ctypes.POINTER(u), ctypes.POINTER(u), sz, ctypes.POINTER(f), sz, sz, ctypes.POINTER(f), sz, ctypes.POINTER(f), sz, ctypes.POINTER(ctypes.c_ubyte), sz, f, u, ctypes.POINTER(f)]
    mos.lib.meshopt_simplifyWithAttributes.restype = sz
    attrs = np.column_stack([T, N * 0.5]).astype(np.float32)
    dest = np.zeros(I.size, np.uint32)
    k = mo.simplify_with_attributes(dest, I.reshape(-1).astype(np.uint32), P.astype(np.float32), attrs, np.array([1, 1, .3, .3, .3], np.float32), vertex_lock=np.zeros(len(P), np.uint8), target_index_count=tris * 3, target_error=1e9, options=0, result_error=np.zeros(1, np.float32))
    I = dest[:k].reshape(-1, 3).astype(np.int64)
    used = np.unique(I); remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
    P, N, T, I = P[used], N[used], T[used], remap[I]

mat = j['materials'][mat_index]['pbrMetallicRoughness']
img = j['images'][j['textures'][mat['baseColorTexture']['index']]['source']]
v = j['bufferViews'][img['bufferView']]
im = Image.open(io.BytesIO(blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
im = im.resize((tex, tex), Image.LANCZOS) if max(im.size) > tex else im
out = io.BytesIO(); im.save(out, 'JPEG', quality=88, optimize=True); jpg = out.getvalue()

pos = P.astype('<f4').tobytes(); nor = N.astype('<f4').tobytes(); uvb = np.column_stack([T[:, 0], T[:, 1]]).astype('<f4').tobytes(); ind = I.reshape(-1).astype('<u4').tobytes()
parts = [pos, nor, uvb, ind, jpg]; offs, buf = [], b''
for p in parts:
    buf += b'\0' * ((-len(buf)) % 4); offs.append(len(buf)); buf += p
buf += b'\0' * ((-len(buf)) % 4)
n = len(P)
g = {'asset': {'version': '2.0', 'generator': 'scripts/prep-monster-glb.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
     'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
     'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}],
     'textures': [{'source': 0}], 'images': [{'bufferView': 4, 'mimeType': 'image/jpeg'}],
     'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': n, 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()},
                   {'bufferView': 1, 'componentType': 5126, 'count': n, 'type': 'VEC3'}, {'bufferView': 2, 'componentType': 5126, 'count': n, 'type': 'VEC2'},
                   {'bufferView': 3, 'componentType': 5125, 'count': len(I) * 3, 'type': 'SCALAR'}],
     'bufferViews': [{'buffer': 0, 'byteOffset': offs[k], 'byteLength': len(parts[k])} for k in range(5)], 'buffers': [{'byteLength': len(buf)}]}
jb = json.dumps(g, separators=(',', ':')).encode(); jb += b' ' * ((-len(jb)) % 4)
total = 12 + 8 + len(jb) + 8 + len(buf)
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(buf)) + b'BIN\0' + buf)
print(f'-> {dst}: {len(I)} triangles, size {np.round(P.max(0) - P.min(0), 3)}, {total / 1024:.0f} KB')
