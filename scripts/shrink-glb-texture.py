#!/usr/bin/env python3
"""Shrink the embedded textures of a Meshy GLB (default 512 px) so it stays small for iPad.

Usage: python3 scripts/shrink-glb-texture.py in.glb out.glb [size] [jpeg-quality]
Geometry, nodes and materials are copied unchanged; only image bytes are replaced and the
binary chunk is rebuilt.
"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 88

b = open(src, 'rb').read()
assert b[:4] == b'glTF', 'not a binary glTF'
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
bin_start = 20 + jl + 8
blob = b[bin_start:bin_start + struct.unpack('<I', b[20 + jl:24 + jl])[0]]

replace = {}
for im in j.get('images', []):
    v = j['bufferViews'][im['bufferView']]
    data = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    img = Image.open(io.BytesIO(data))
    if max(img.size) > size:
        img = img.resize((size, size * img.size[1] // img.size[0]) if img.size[0] >= img.size[1] else (size * img.size[0] // img.size[1], size), Image.LANCZOS)
    out = io.BytesIO()
    if im.get('mimeType') == 'image/png':
        img.save(out, 'PNG', optimize=True)
    else:
        img.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True)
    replace[im['bufferView']] = out.getvalue()

chunks, pos = [], 0
for i, v in enumerate(j['bufferViews']):
    data = replace.get(i, blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
    pad = (-pos) % 4
    chunks.append(b'\0' * pad)
    pos += pad
    v['byteOffset'], v['byteLength'] = pos, len(data)
    chunks.append(data)
    pos += len(data)
newbin = b''.join(chunks)
newbin += b'\0' * ((-len(newbin)) % 4)
j['buffers'] = [{'byteLength': len(newbin)}]
jb = json.dumps(j, separators=(',', ':')).encode()
jb += b' ' * ((-len(jb)) % 4)
total = 12 + 8 + len(jb) + 8 + len(newbin)
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(jb)) + b'JSON' + jb + struct.pack('<I', len(newbin)) + b'BIN\0' + newbin)
print(f'{src} {len(b)/1024:.0f} KB -> {dst} {total/1024:.0f} KB')
