#!/usr/bin/env python3
"""Decimate a one-mesh GLB (a Meshy weapon) to about N triangles; everything else is copied unchanged.

Usage: python3 scripts/decimate-glb.py in.glb out.glb N
Uses meshoptimizer with UVs and normals weighted so the texture stays put (as scripts/prep-monster-glb.py).
The game budgets weapons at 4,000 triangles (tests/core/presentation.test.js). Needs: pip install numpy meshoptimizer.
"""
import ctypes, json, struct, sys
import numpy as np
import meshoptimizer as mo, meshoptimizer.simplifier as mos

src, dst, tris = sys.argv[1], sys.argv[2], int(sys.argv[3])
b = open(src, 'rb').read()
assert b[:4] == b'glTF'
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
blob = b[20 + jl + 8:20 + jl + 8 + struct.unpack('<I', b[20 + jl:24 + jl])[0]]
prims = [p for m in j['meshes'] for p in m['primitives']]
assert len(prims) == 1, 'one primitive expected'
prim = prims[0]

def read(i, comps):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
    return np.frombuffer(blob[o:o + a['count'] * comps * np.dtype(dt).itemsize], dtype=dt).reshape(-1, comps) if comps > 1 else np.frombuffer(blob[o:o + a['count'] * np.dtype(dt).itemsize], dtype=dt)

A = prim['attributes']
P, N, T = read(A['POSITION'], 3), read(A['NORMAL'], 3), read(A['TEXCOORD_0'], 2)
I = read(prim['indices'], 1).astype(np.uint32)
u, f, sz = ctypes.c_uint, ctypes.c_float, ctypes.c_size_t  # the binding declares no argtypes, so floats would pass as doubles
mos.lib.meshopt_simplifyWithAttributes.argtypes = [ctypes.POINTER(u), ctypes.POINTER(u), sz, ctypes.POINTER(f), sz, sz, ctypes.POINTER(f), sz, ctypes.POINTER(f), sz, ctypes.POINTER(ctypes.c_ubyte), sz, f, u, ctypes.POINTER(f)]
mos.lib.meshopt_simplifyWithAttributes.restype = sz
attrs = np.column_stack([T, N * 0.5]).astype(np.float32)
dest = np.zeros(I.size, np.uint32)
k = mo.simplify_with_attributes(dest, I, P.astype(np.float32), attrs, np.array([1, 1, .3, .3, .3], np.float32), vertex_lock=np.zeros(len(P), np.uint8), target_index_count=tris * 3, target_error=1e9, options=0, result_error=np.zeros(1, np.float32))
I2 = dest[:k].reshape(-1, 3)
used = np.unique(I2); remap = np.full(len(P), -1, np.int64); remap[used] = np.arange(len(used))
P2, N2, T2, I2 = P[used], N[used], T[used], remap[I2].astype(np.uint32)

# Rebuild the buffer: the new geometry first, then every other buffer view's bytes unchanged.
geo = {A['POSITION']: P2.astype('<f4'), A['NORMAL']: N2.astype('<f4'), A['TEXCOORD_0']: T2.astype('<f4'), prim['indices']: I2.reshape(-1).astype('<u4')}
out = bytearray(); views = []
pad = lambda: out.extend(b'\0' * (-len(out) % 4))
geo_views = {j['accessors'][i]['bufferView'] for i in geo}
for vi, v in enumerate(j['bufferViews']):
    pad(); start = len(out)
    acc = [i for i in geo if j['accessors'][i]['bufferView'] == vi]
    if acc:
        data = geo[acc[0]].tobytes(); out.extend(data)
        a = j['accessors'][acc[0]]; a['byteOffset'] = 0; a['count'] = len(geo[acc[0]]) if geo[acc[0]].ndim > 1 else geo[acc[0]].size
        a['componentType'] = 5125 if acc[0] == prim['indices'] else a['componentType']
        if acc[0] == A['POSITION']: a['min'] = P2.min(0).tolist(); a['max'] = P2.max(0).tolist()
        v = {**v, 'byteOffset': start, 'byteLength': len(data)}
        v.pop('byteStride', None)
    else:
        o = v.get('byteOffset', 0); out.extend(blob[o:o + v['byteLength']]); v = {**v, 'byteOffset': start}
    views.append(v)
pad()
j['bufferViews'] = views; j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(out)) + b'BIN\0' + bytes(out)
open(dst, 'wb').write(glb)
print(f'{src}: {len(I) // 3} -> {len(I2)} triangles, {len(b) // 1024} -> {len(glb) // 1024} KB')
