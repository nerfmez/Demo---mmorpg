import base64, io
from PIL import Image
import os
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
s = open(S + 'forest/src.html').read()
buf = io.BytesIO(); Image.open(S + 'concepts/forest-trail-40deg.jpg').convert('RGB').save(buf, 'JPEG', quality=86)
s = s.replace('%%REF%%', 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode())
s = s.replace('%%HERO%%', base64.b64encode(open(S + 'beach/hero.glb', 'rb').read()).decode())
open(S + 'forest/index.html', 'w').write(s); print('index.html', len(s))
