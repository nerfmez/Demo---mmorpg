"""Build a self-contained Glimmer Wetland review using approved game scene assets."""
from pathlib import Path
from PIL import Image
import base64,io,re,json,argparse
here=Path(__file__).resolve().parent
args=argparse.ArgumentParser();args.add_argument('--output',default=str(here/'index.html'));args.add_argument('--modules-from',help='Existing self-contained review HTML whose import map should be reused; omitted builds with the approved CDN imports');args.add_argument('--three',help='Three 0.170 package directory to embed for an offline HTML');a=args.parse_args()
if a.three and a.modules_from:args.error('choose --three or --modules-from')
b=(here.parent/'beach/src.html').read_text();r=(here.parent/'ruins/scene.js').read_text()
def block(start,end):
 i=b.index(start);j=b.index(end,i+len(start));return b[i:j]
page=block('// ---------- page:','// ---------- world layout')
renderer=block('// ---------- renderer','// ---------- shared GLSL')
renderer=re.sub(r'const CAM = \{[^}]*\};','const CAM = {target:new V3(0,0,-7.2),pitch:40,dist:93.6,yaw:0};',renderer)
renderer=renderer.replace('left: -46, right: 46, top: 40, bottom: -40, near: 10, far: 220','left: -96, right: 96, top: 100, bottom: -100, near: 10, far: 350').replace('sun.shadow.bias = -0.0005','sun.shadow.bias = -0.0015').replace('sun.shadow.normalBias = 0.04','sun.shadow.normalBias = 0.3')
glsl=block('// ---------- shared GLSL','// ---------- ground:')
glsl=re.sub(r'float zShoreG\(float x\)\{[^}]*\}',r'${SHORE_GLSL}',glsl)
# the pond floor takes the water's teal, measured round the pond
old_under='float under=(-vW.y+.03)*step(-.3,vW.z-zShoreG(vW.x));'
assert old_under in glsl
glsl=glsl.replace(old_under,'float under=(SEA_YG-vW.y+.03)*step(-.3,pondIn(vW.xz));')
stones=block('// ---------- faceted grey stones','// ---------- foliage from the game')
foliage=block('// ---------- foliage from the game','// ---------- the stone ledges')
palms=block('// ---------- palms and broadleaf trees','// ---------- shipwreck')
hero=block('// ---------- the hero:','// ---------- the waypoint:')
# Terrain, physical props and the pools for the wetland.
hero=re.sub(r'function blocked\(x, z\) \{.*?\n\}', '''function blocked(x,z){
 if(x<GX0+3||x>GX1-3||z<GZ0+3||z>GZ1-2||seaDist(x,z)>-.8)return true;
 const y=height(x,z),s=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;
 if(s>1.25&&!stairsAt(x,z).inside)return true;
 return COLLIDERS.some(c=>{if(c.seg){const dx=c.x1-c.x,dz=c.z1-c.z,t=Math.max(0,Math.min(1,((x-c.x)*dx+(z-c.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-c.x-dx*t,z-c.z-dz*t)<c.r+.3;}if(!c.box)return Math.hypot(x-c.x,z-c.z)<c.r+.3;const dx=x-c.x,dz=z-c.z,co=Math.cos(c.ry),si=Math.sin(c.ry);return Math.abs(dx*co-dz*si)<c.w/2+.3&&Math.abs(dx*si+dz*co)<c.d/2+.3;});
}''',hero,flags=re.S)
sea=block('// ---------- sea:','// ---------- small things')
sea=sea.replace('new THREE.PlaneGeometry(150, 74, 150, 74)','new THREE.PlaneGeometry(SEA_W, SEA_D, 110, 110)').replace('g.translate(0, 0.04, 34)','g.translate(SEA_CX, SEA_Y + 0.04, SEA_CZ)').replace('uRocks[2]','uRocks[8]').replace('for(int i=0;i<2;i++)','for(int i=0;i<8;i++)')
sea=sea.replace('float rockNear=min(length(q-uRocks[0].xy)-uRocks[0].z,length(q-uRocks[1].xy)-uRocks[1].z);','float rockNear=999.;for(int i=0;i<8;i++)rockNear=min(rockNear,length(q-uRocks[i].xy)-uRocks[i].z);')
# the pools: metres inside the water round each shore; the water's own patterns stay in world xz.
# Small pools: the wash runs up a quarter as far and the light web is fainter; the concept's clear
# bright turquoise stays (Greenhollow's warm tone, not Moonroot's deep teal).
for a_,b_ in[('float dz=w.z-zShoreG(w.x);','float dz=pondIn(w.xz);'),('  vec2 q=vW.xz;\n  float dz=q.y-zShoreG(q.x);','  vec2 q=vW.xz;\n  float dz=pondIn(q);'),('float edge=dz+runup(q.x,t);','float edge=dz+.25*runup(q.x,t);'),
  ('col=mix(col,${L(\'#e8ffd2\')},line*mix(.26,.36,near));','col=mix(col,${L(\'#e8ffd2\')},line*mix(.14,.2,near));')]:
 assert a_ in sea,a_;sea=sea.replace(a_,b_)
runtime=r[r.index('function resize()'):].replace('  updatePetals(timeU.value);','').replace('ready: true','wetland: {ports:WETLAND_PORTS,junctions:ROAD_JUNCTIONS,routes:ROUTES,crystal:CRYSTAL,blocked,hero:HERO,colliders:COLLIDERS,height,pondIn}, ready: true')
plantSource=(here.parent/'shell-beach/scene.js').read_text()
plants=plantSource[plantSource.index('function placeCoastPlants(){'):plantSource.index("FOL.leaf=")]
plants=plants.replace('const items=frondItems.filter(f=>f.young===young),geo=', 'const items=frondItems.filter(f=>f.young===young);if(!items.length)continue;const geo=')
js='\n'.join([page,renderer,(here/'world.js').read_text(),glsl,stones,foliage,palms,hero,sea,plants,(here/'marsh.js').read_text(),(here/'scene.js').read_text(),runtime])
# A default CDN build and a fully offline build both work independently of Sites.
module_source=Path(a.modules_from).read_text() if a.modules_from else b
modules=re.search(r'<script type="importmap">(.*?)</script>',module_source,re.S)[1]
if a.three:
    files={
      'three':'build/three.module.min.js',
      'three/addons/geometries/ConvexGeometry.js':'examples/jsm/geometries/ConvexGeometry.js',
      'three/addons/math/ConvexHull.js':'examples/jsm/math/ConvexHull.js',
      'three/addons/utils/BufferGeometryUtils.js':'examples/jsm/utils/BufferGeometryUtils.js',
      'three/addons/loaders/GLTFLoader.js':'examples/jsm/loaders/GLTFLoader.js',
    }
    embedded={}
    for name,path in files.items():
        source=(Path(a.three)/path).read_text().replace("'../math/ConvexHull.js'","'three/addons/math/ConvexHull.js'").replace("'../utils/BufferGeometryUtils.js'","'three/addons/utils/BufferGeometryUtils.js'")
        embedded[name]='data:text/javascript;base64,'+base64.b64encode(source.encode()).decode()
    modules=json.dumps({'imports':embedded})
style=b[b.index('<style>'):b.index('<div id="stage">')]
style+='\n<style>.seg button,#wipe{min-height:44px}.bar{max-width:1250px}</style>\n'
refio=io.BytesIO();Image.open(here/'concept.png').convert('RGB').save(refio,'JPEG',quality=89)
ref='data:image/jpeg;base64,'+base64.b64encode(refio.getvalue()).decode()
hero64=base64.b64encode((here.parent/'beach/hero.glb').read_bytes()).decode()
markup='''<div id="stage"><canvas id="c" aria-label="บึงประกายแสง 3D"></canvas><div class="atmo" id="sunwash"></div><div class="atmo" id="rays"></div><div class="atmo" id="vignette"></div><img id="ref" alt="ภาพต้นแบบบึงประกายแสง" src="REF"><div id="divider"></div><span class="tag" id="tag3d">3D</span><span class="tag" id="tagref">ภาพอ้างอิง</span></div><div class="bar"><label for="wipe">เลื่อนเพื่อเทียบ</label><input id="wipe" type="range" min="0" max="100" value="100" step=".5"><div class="seg"><button id="only3d">3D อย่างเดียว</button><button id="half">ครึ่งครึ่ง</button><button id="onlyref">ภาพอ้างอิง</button></div><span id="status">กำลังสร้างฉาก…</span></div><script type="text/plain" id="hero-glb">HERO</script>'''.replace('REF',ref).replace('HERO',hero64)
head='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>บึงประกายแสง</title>'
imports="import * as THREE from 'three';\nimport {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';\nimport {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';\nimport {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';\n"
out=head+style+markup+'<script type="importmap">'+modules+'</script><script type="module">'+imports+js+'\n</script></html>'
Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(out)
(here/'generated.mjs').write_text(imports+js)
print(a.output,len(out))
