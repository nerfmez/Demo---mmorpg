#!/usr/bin/env python3
"""Shrink the Meshy rigged chibi GLB for the game (characters.hero_chibi).

Keeps the mesh, skin and texture; drops what the game does not read: the rig task's
built-in animation (the hero is driven by the procedural driver bones) and the tangents
(no normal map; chibi-body.js rebuilds the normals at load). The base-colour JPEG is
resized to --size pixels so the file fits the iPad character budget.

  python3 scripts/prep-chibi.py <meshy rigged.glb> public/models/hero_chibi.glb [--size 1024]
"""
import argparse
import io
import json
import struct

from PIL import Image


def read_glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    jlen = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from('<I', b, off)[0]
    return j, b[off + 8:off + 8 + blen]


def write_glb(path, j, chunks):
    """chunks: list of bytes, one per bufferView in order."""
    data = bytearray()
    for i, c in enumerate(chunks):
        while len(data) % 4:
            data.append(0)
        j['bufferViews'][i]['byteOffset'] = len(data)
        j['bufferViews'][i]['byteLength'] = len(c)
        data += c
    while len(data) % 4:
        data.append(0)
    j['buffers'] = [{'byteLength': len(data)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(data)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(data), 0x004E4942) + bytes(data))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=88)
    a = ap.parse_args()
    j, bin_ = read_glb(a.src)

    j.pop('animations', None)
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'].pop('TANGENT', None)
    for img in j.get('images', []):
        v = j['bufferViews'][img['bufferView']]
        im = Image.open(io.BytesIO(bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
        if im.width > a.size:
            im = im.resize((a.size, a.size * im.height // im.width), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, 'JPEG', quality=a.quality, optimize=True)
        img['_data'] = out.getvalue()
        img['mimeType'] = 'image/jpeg'

    # keep only accessors and bufferViews still referenced, renumbered in order
    used_acc = set()
    for m in j['meshes']:
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    accessors = [j['accessors'][old] for old in sorted(used_acc)]
    used_view = sorted({a_['bufferView'] for a_ in accessors} | {img['bufferView'] for img in j.get('images', [])})
    view_map = {old: new for new, old in enumerate(used_view)}
    chunks = []
    for old in used_view:
        v = j['bufferViews'][old]
        img = next((im for im in j.get('images', []) if im['bufferView'] == old), None)
        chunks.append(img.pop('_data') if img else bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
    j['bufferViews'] = [j['bufferViews'][old] for old in used_view]
    for a_ in accessors:
        a_['bufferView'] = view_map[a_['bufferView']]
    for img in j.get('images', []):
        img['bufferView'] = view_map[img['bufferView']]
    j['accessors'] = accessors
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    write_glb(a.dst, j, chunks)


if __name__ == '__main__':
    main()
