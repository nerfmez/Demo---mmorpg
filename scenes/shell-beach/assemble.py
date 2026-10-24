"""Build a self-contained Shell Beach review using approved game scene assets."""
from pathlib import Path
from PIL import Image
import base64,io,re,json,argparse
here=Path(__file__).resolve().parent
args=argparse.ArgumentParser();args.add_argument('--output',default=str(here/'index.html'));args.add_argument('--modules-from',help='Existing self-contained review HTML whose import map should be reused; omitted builds with the approved CDN imports');a=args.parse_args()
b=(here.parent/'beach/src.html').read_text();r=(here.parent/'ruins/scene.js').read_text()
def block(start,end):
 i=b.index(start);j=b.index(end,i+len(start));return b[i:j]
page=block('// ---------- page:','// ---------- world layout')
renderer=block('// ---------- renderer','// ---------- shared GLSL')
renderer=re.sub(r'const CAM = \{[^}]*\};','const CAM = {target:new V3(0,0,-7.2),pitch:40,dist:93.6,yaw:0};',renderer)
renderer=renderer.replace('left: -46, right: 46, top: 40, bottom: -40, near: 10, far: 220','left: -96, right: 96, top: 100, bottom: -100, near: 10, far: 350').replace('sun.shadow.bias = -0.0005','sun.shadow.bias = -0.0015').replace('sun.shadow.normalBias = 0.04','sun.shadow.normalBias = 0.3')
glsl=block('// ---------- shared GLSL','// ---------- ground:')
glsl=re.sub(r'float zShoreG\(float x\)\{[^}]*\}',r'${SHORE_GLSL}',glsl)
stones=block('// ---------- faceted grey stones','// ---------- foliage from the game')
foliage=block('// ---------- foliage from the game','// ---------- the stone ledges')
palms=block('// ---------- palms and broadleaf trees','// ---------- shipwreck')
hero=block('// ---------- the hero:','// ---------- the waypoint:')
# Only collision policy changes: no waypoint/wreck, and keep the water out of bounds.
hero=re.sub(r'function blocked\(x, z\) \{.*?\n\}', '''function blocked(x,z){
 if(x<GX0+3||x>GX1-3||z<GZ0+3||z>zShore(x)-.35)return true;
 const y=height(x,z),s=Math.max(Math.abs(height(x+.3,z)-y),Math.abs(height(x,z+.3)-y))/.3;
 if(s>1.25&&!stairsAt(x,z).inside)return true;
 return COLLIDERS.some(c=>{if(!c.box)return Math.hypot(x-c.x,z-c.z)<c.r+.3;const dx=x-c.x,dz=z-c.z,co=Math.cos(c.ry),si=Math.sin(c.ry);return Math.abs(dx*co-dz*si)<c.w/2+.3&&Math.abs(dx*si+dz*co)<c.d/2+.3;});
}''',hero,flags=re.S)
sea=block('// ---------- sea:','// ---------- small things')
sea=sea.replace('new THREE.PlaneGeometry(150, 74, 150, 74)','new THREE.PlaneGeometry(190, 180, 110, 100)').replace('g.translate(0, 0.04, 34)','g.translate(0, 0.04, 30)').replace('uRocks[2]','uRocks[8]').replace('for(int i=0;i<2;i++)','for(int i=0;i<8;i++)')
sea=sea.replace('float rockNear=min(length(q-uRocks[0].xy)-uRocks[0].z,length(q-uRocks[1].xy)-uRocks[1].z);','float rockNear=999.;for(int i=0;i<8;i++)rockNear=min(rockNear,length(q-uRocks[i].xy)-uRocks[i].z);')
runtime=r[r.index('function resize()'):].replace('  updatePetals(timeU.value);','')
conch_loader='''
// the Singing Conch model ships inside the page, like the hero; the scene is built after it loads
const CONCH_ASSET=await (async()=>{
  const bytes=Uint8Array.from(atob(document.getElementById('conch-glb').textContent.trim()),c=>c.charCodeAt(0));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');let mesh=null;gltf.scene.traverse(o=>{if(o.isMesh)mesh=o;});
  mesh.geometry.computeBoundingBox();return {geometry:mesh.geometry,map:mesh.material.map};
})();
'''
js='\n'.join([page,conch_loader,renderer,(here/'world.js').read_text(),glsl,stones,foliage,palms,hero,sea,(here/'conch.js').read_text(),(here/'scene.js').read_text(),runtime])
# Reuse the reviewed embedded modules without introducing a new dependency version.
module_source=Path(a.modules_from).read_text() if a.modules_from else b
modules=re.search(r'<script type="importmap">(.*?)</script>',module_source,re.S)[1]
style=b[b.index('<style>'):b.index('<div id="stage">')]
style+='\n<style>.seg button,#wipe{min-height:44px}.bar{max-width:1250px}</style>\n'
refio=io.BytesIO();Image.open(here/'concept.png').convert('RGB').save(refio,'JPEG',quality=89)
ref='data:image/jpeg;base64,'+base64.b64encode(refio.getvalue()).decode()
hero64=base64.b64encode((here.parent/'beach/hero.glb').read_bytes()).decode()
conch64=base64.b64encode((here.parent.parent/'public/models/accepted-scenes/singing-conch.glb').read_bytes()).decode()
markup='''<div id="stage"><canvas id="c" aria-label="หาดเปลือกหอยยักษ์ 3D"></canvas><div class="atmo" id="sunwash"></div><div class="atmo" id="rays"></div><div class="atmo" id="vignette"></div><img id="ref" alt="ภาพต้นแบบหาดเปลือกหอย" src="REF"><div id="divider"></div><span class="tag" id="tag3d">3D</span><span class="tag" id="tagref">ภาพอ้างอิง</span></div><div class="bar"><label for="wipe">เลื่อนเพื่อเทียบ</label><input id="wipe" type="range" min="0" max="100" value="100" step=".5"><div class="seg"><button id="only3d">3D อย่างเดียว</button><button id="half">ครึ่งครึ่ง</button><button id="onlyref">ภาพอ้างอิง</button></div><span id="status">กำลังสร้างฉาก…</span></div><script type="text/plain" id="hero-glb">HERO</script><script type="text/plain" id="conch-glb">CONCH</script>'''.replace('REF',ref).replace('HERO',hero64).replace('CONCH',conch64)
head='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>หาดเปลือกหอยยักษ์ — ฉาก 3D</title>'
imports="import * as THREE from 'three';\nimport {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';\nimport {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';\nimport {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';\n"
out=head+style+markup+'<script type="importmap">'+modules+'</script><script type="module">'+imports+js+'\n</script></html>'
Path(a.output).parent.mkdir(parents=True,exist_ok=True);Path(a.output).write_text(out)
(here/'generated.mjs').write_text(imports+js)
print(a.output,len(out))
