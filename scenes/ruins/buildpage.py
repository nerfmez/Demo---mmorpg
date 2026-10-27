import argparse, base64, io, json, re
from PIL import Image
import os
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
args = argparse.ArgumentParser(description='Build the standalone ruins preview.')
args.add_argument('--three', help='Three 0.170 package directory; embed its modules for an offline HTML')
args.add_argument('--output', help='Output HTML path (default: ruins/index.html)')
args = args.parse_args()
s = open(S + 'ruins/src.html').read()
buf = io.BytesIO(); Image.open(S + 'concepts/ruins-approach-40deg.jpg').convert('RGB').save(buf, 'JPEG', quality=86)
s = s.replace('%%REF%%', 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode())
s = s.replace('%%HERO%%', base64.b64encode(open(S + 'beach/hero.glb', 'rb').read()).decode())
if args.three:
    # Five real ES modules, mapped to embedded data URLs. The approved GLB and
    # reference are embedded above, so the preview needs no CDN or file server.
    modules = {
        'three': 'build/three.module.min.js',
        'three/addons/geometries/ConvexGeometry.js': 'examples/jsm/geometries/ConvexGeometry.js',
        'three/addons/math/ConvexHull.js': 'examples/jsm/math/ConvexHull.js',
        'three/addons/utils/BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js',
        'three/addons/loaders/GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js',
    }
    imports = {}
    for name, filename in modules.items():
        js = open(os.path.join(args.three, filename)).read()
        js = js.replace("'../math/ConvexHull.js'", "'three/addons/math/ConvexHull.js'")
        js = js.replace("'../utils/BufferGeometryUtils.js'", "'three/addons/utils/BufferGeometryUtils.js'")
        imports[name] = 'data:text/javascript;base64,' + base64.b64encode(js.encode()).decode()
    s = re.sub(r'<script type="importmap">.*?</script>',
               '<script type="importmap">' + json.dumps({'imports': imports}) + '</script>', s, flags=re.S)
target = args.output or S + 'ruins/index.html'
with open(target, 'w') as f:
    f.write(s)
print(target, len(s.encode()))
