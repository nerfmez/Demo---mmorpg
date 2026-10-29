#!/usr/bin/env python3
"""Shrink the maps stored in imported GLB models to what the game draws.

The game draws model maps at most data/rendering.json -> modelTextureMax (src/render/models.js
draws larger ones down on load) and samples only the base colour, normal and emissive maps
(toon materials). Meshy exports carry 2048^2 maps plus metal/roughness and occlusion maps, so
each weapon downloaded 7-11 MB for a few dozen screen pixels. This rewrites a GLB in place:
unused metal/roughness and occlusion maps are removed, larger maps are resized to the cap
(JPEG stays JPEG at quality 90, PNG stays PNG with its alpha), and geometry is copied
byte for byte. The picture in the game is unchanged.

Usage: python3 scripts/shrink-model-textures.py public/models/weapons/*.glb ...
"""
import io, json, struct, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAX = json.loads((ROOT / 'data/rendering.json').read_text())['modelTextureMax']
UNUSED_PBR = ('metallicRoughnessTexture',)
UNUSED_MATERIAL = ('occlusionTexture',)


def read_glb(path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2, path
    offset, doc, binary = 12, None, b''
    while offset < len(data):
        length, kind = struct.unpack_from('<I4s', data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if kind == b'JSON': doc = json.loads(chunk)
        elif kind == b'BIN\x00': binary = chunk
        offset += 8 + length
    return doc, binary


def write_glb(path, doc, binary):
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(text), b'JSON') + text +
                     struct.pack('<I4s', len(binary), b'BIN\x00') + binary)


def texture_refs(doc):
    """Every textureInfo dict in the document (materials only; these models use no extensions)."""
    for material in doc.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        for key in ('baseColorTexture', 'metallicRoughnessTexture'):
            if key in pbr: yield pbr[key]
        for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture'):
            if key in material: yield material[key]


def shrink(path):
    doc, binary = read_glb(path)
    if doc.get('extensionsUsed'): return f'skip {path.name}: extensions {doc["extensionsUsed"]}'
    before = path.stat().st_size
    removed = 0
    for material in doc.get('materials', []):
        for key in UNUSED_PBR: removed += material.get('pbrMetallicRoughness', {}).pop(key, None) is not None
        for key in UNUSED_MATERIAL: removed += material.pop(key, None) is not None
    oversized = 0
    for img in doc.get('images', []):
        v = doc['bufferViews'][img['bufferView']]
        start = v.get('byteOffset', 0)
        oversized += max(Image.open(io.BytesIO(binary[start:start + v['byteLength']])).size) > MAX
    if not removed and not oversized: return f'{path.name}: unchanged'
    # keep only referenced textures and images, renumbered in their old order
    used_textures = sorted({ref['index'] for ref in texture_refs(doc)})
    texture_map = {old: new for new, old in enumerate(used_textures)}
    for ref in texture_refs(doc): ref['index'] = texture_map[ref['index']]
    textures = [doc['textures'][i] for i in used_textures]
    used_images = sorted({t['source'] for t in textures if 'source' in t})
    image_map = {old: new for new, old in enumerate(used_images)}
    for t in textures:
        if 'source' in t: t['source'] = image_map[t['source']]
    images = [doc['images'][i] for i in used_images]
    used_samplers = sorted({t['sampler'] for t in textures if 'sampler' in t})
    sampler_map = {old: new for new, old in enumerate(used_samplers)}
    for t in textures:
        if 'sampler' in t: t['sampler'] = sampler_map[t['sampler']]
    if 'samplers' in doc: doc['samplers'] = [doc['samplers'][i] for i in used_samplers]
    if textures: doc['textures'] = textures
    else: doc.pop('textures', None)
    if images: doc['images'] = images
    else: doc.pop('images', None)
    if not doc.get('samplers'): doc.pop('samplers', None)

    # rebuild the binary: geometry views byte for byte, then the (resized) kept images
    views = doc.get('bufferViews', [])
    image_views = {img['bufferView'] for img in doc.get('images', []) if 'bufferView' in img}
    geometry_views = [i for i, v in enumerate(views) if i not in image_views and v.get('buffer', 0) == 0]
    dropped = [i for i, v in enumerate(views) if i not in image_views and i not in geometry_views]
    assert not dropped, f'{path.name}: views in other buffers'
    referenced = {a['bufferView'] for a in doc.get('accessors', []) if 'bufferView' in a}
    for a in doc.get('accessors', []):
        sparse = a.get('sparse')
        if sparse: referenced |= {sparse['indices']['bufferView'], sparse['values']['bufferView']}
    out, new_views, view_map = bytearray(), [], {}

    def place(view, payload):
        out.extend(b'\0' * (-len(out) % 4))
        view = dict(view, byteOffset=len(out), byteLength=len(payload), buffer=0)
        if view['byteOffset'] == 0: view.pop('byteOffset')
        out.extend(payload)
        new_views.append(view)
        return len(new_views) - 1

    for i in geometry_views:
        if i not in referenced: continue  # an image view left behind by a removed map
        v = views[i]
        start = v.get('byteOffset', 0)
        view_map[i] = place(v, binary[start:start + v['byteLength']])
    for img in doc.get('images', []):
        v = views[img['bufferView']]
        start = v.get('byteOffset', 0)
        payload = binary[start:start + v['byteLength']]
        picture = Image.open(io.BytesIO(payload))
        if max(picture.size) > MAX:
            k = MAX / max(picture.size)
            size = (max(1, round(picture.width * k)), max(1, round(picture.height * k)))
            fmt = 'JPEG' if img.get('mimeType') == 'image/jpeg' else 'PNG'
            if fmt == 'JPEG' and picture.mode not in ('RGB', 'L'): picture = picture.convert('RGB')
            buffer = io.BytesIO()
            picture.resize(size, Image.LANCZOS).save(buffer, fmt, **({'quality': 90, 'subsampling': 0} if fmt == 'JPEG' else {'optimize': True}))
            payload = buffer.getvalue()
        img['bufferView'] = place({k: val for k, val in v.items() if k not in ('byteStride', 'target')}, payload)
    for a in doc.get('accessors', []):
        if 'bufferView' in a: a['bufferView'] = view_map[a['bufferView']]
        sparse = a.get('sparse')
        if sparse:
            sparse['indices']['bufferView'] = view_map[sparse['indices']['bufferView']]
            sparse['values']['bufferView'] = view_map[sparse['values']['bufferView']]
    doc['bufferViews'] = new_views
    doc['buffers'] = [{'byteLength': len(out) + (-len(out) % 4)}]
    write_glb(path, doc, bytes(out))
    return f'{path.name}: {before / 1e6:.1f} -> {path.stat().st_size / 1e6:.1f} MB'


if __name__ == '__main__':
    for name in sys.argv[1:]: print(shrink(Path(name)))
