"""Regenerate native factories from the retained approved standalone sources.
Run standalone assemble.py first. No iframe, second renderer, player or input.
"""
from pathlib import Path
import re,sys
root=Path(sys.argv[1]).resolve();out=root/'src/render/accepted-scenes';out.mkdir(parents=True,exist_ok=True)
b=(root/'scenes/beach/src.html').read_text()
helpers=b[b.index('// ---------- helpers'):b.index('// ---------- world layout')]
cam=b[b.index('function placeCamera()'):b.index('// sun:')]
imports="import * as THREE from 'three';\nimport {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';\nimport {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';\nimport {animeFoliage as gameFoliage,animeTrunk as gameTrunk,branchletTexture as gameBranchlet} from '../anime-study.js';\nimport {meadowGrass as gameGrass} from '../nature.js';\n"
# In the game the scenes' trees, shrubs and grass are the map's own: the game's geometry and
# palette, tagged so render/accepted-scenes.js gives them the map's materials. With the game's
# foliage option the trees also take the map's crown proportions and size range.
gameFoliageHelpers=(
 "const fitTree=(s,x,z)=>{if(!foliage)return s;const big=foliage.big.find(b=>Math.hypot(b.x-x,b.z-z)<b.r);return big?big.s:s*foliage.scale;};\n"
 "const gamePart=(g,kind)=>{g.userData.gameFoliage=kind;return g;};\n"
 "function animeFoliage(seed=3,shrub=false){return gamePart(gameFoliage(seed,shrub),shrub?'shrub':'crown');}\n"
 "function animeTrunk(){return gamePart(gameTrunk(),'trunk');}\n"
 "function meadowGrass(){return gamePart(gameGrass(),'grass');}\n"
 "function branchletTexture(shrub=false){return gameBranchlet(shrub);}\n")
def gameFoliageParts(name,src):
 for old,new in[('function animeFoliage(seed = 3, shrub = false) {','function sceneFoliage(seed = 3, shrub = false) {'),('function animeTrunk() {','function sceneTrunk() {'),('function meadowGrass() {','function sceneGrass() {'),('function branchletTexture(shrub = false) {','function sceneBranchlet(shrub = false) {'),('treeItems.push({ x, y, z, s, ','treeItems.push({ x, y, z, s: fitTree(s, x, z), ')]:
  assert src.count(old)==1,(name,old);src=src.replace(old,new)
 if name=='forest':  # the cherries keep their own bark and blossom colours
  for old,new in[('const bloom = animeFoliage(9, false);',"const bloom = gamePart(sceneFoliage(9, false), 'crown');"),('addTrunks(animeTrunk(), sakura,',"addTrunks(gamePart(sceneTrunk(), 'trunk'), sakura,")]:
   assert src.count(old)==1,(name,old);src=src.replace(old,new)
 # the game's crown sits on the game trunk's branch ends: 2.5 x 1.7 x 2.25, centred 3.5 up
 src,n=re.subn(r'new V3\((\s*)(?:3\.6|3\.0|2\.5)(\s*)\*(\s*)it\.s(\s*),(\s*)(?:2\.4|2\.0|1\.7)(\s*)\*(\s*)it\.s(\s*),(\s*)(?:3\.25|2\.7|2\.25)(\s*)\*(\s*)it\.s(\s*)\)',lambda m:'new V3(%s2.5%s*%sit.s%s,%s1.7%s*%sit.s%s,%s2.25%s*%sit.s%s)'%m.groups(),src)
 assert n>=1,(name,'crown scale')
 src=re.sub(r'y:(\s*)t\.y(\s*)\+(\s*)3\.6(\s*)\*(\s*)t\.s',lambda m:'y:%st.y%s+%s3.5%s*%st.s'%m.groups(),src)
 if name=='forest':  # the island cherry keeps its authored blossom crown (its size is a big tree's, in data)
  old='sakura.map(t => ({ ...t, y: t.y + 3.5 * t.s * (t.h || 1) })), it => new V3(2.5 * it.s, 1.7 * it.s, 2.25 * it.s))'
  assert src.count(old)==1,(name,old);src=src.replace(old,'sakura.map(t => ({ ...t, y: t.y + 3.5 * t.s * (t.h || 1) })), it => new V3(3.0 * it.s, 2.0 * it.s, 2.7 * it.s))')
 return src

for name in ['beach','forest','shell-beach','hill-windmill','azure-meadow','rose-garden']:
 if name=='beach':
  src=b[b.index('// ---------- world layout'):b.index('function resize()')]
  src=src[:src.index('// ---------- renderer')]+src[src.index('// ---------- shared GLSL'):]
 elif name=='forest':
  s=(root/'scenes/forest/src.html').read_text();src=s[s.index('// ---------- shared GLSL'):s.index('function resize()')]
 else:
  s=(root/f'scenes/{name}/generated.mjs').read_text();src=s[s.index('// ---------- layout'):s.index('function resize()')]
 src=re.sub(r'// ---------- the hero:.*?(?=// ---------- (?:the waypoint:|sea:|layout:))','',src,flags=re.S)
 if '// ---------- the hero:' in src:
  start=src.index('// ---------- the hero:');end=src.index('function placeCoastPlants()',start);src=src[:start]+src[end:]
 src=src.replace('scene.add(buildCliffs());',"{const cliffs=buildCliffs();cliffs.name='accepted-cliffs';scene.add(cliffs);}");src=src.replace('scene.add(buildGround());','').replace('scene.add(buildHero());','')
 src=re.sub(r'loadHeroModel\(\)\.catch\([^;]*;','',src)
 src=src.replace('scene.add(buildSea());','').replace('setStatus();','').replace('scene.add(buildAmbience());','').replace('scene.add(buildPetals(sakura));','')
 if name=='azure-meadow':src=src.replace("  woodBox(x,y+height1/2,z,width,height1,d,'#dfd2af');","  if(clipBounds&&(x-width*.65<clipBounds[0]+12||x+width*.65>clipBounds[1]-12||z-d*.7<clipBounds[2]+12||z+d*.7>clipBounds[3]-12))continue;\n  woodBox(x,y+height1/2,z,width,height1,d,'#dfd2af');")
 # Stones keep their parts as groups so the game can seat each one whole (render/accepted-scenes.js).
 src=src.replace('mergeGeometries(stoneParts)','rigidParts(mergeGeometries(stoneParts,true))').replace('mergeGeometries(stoneLines)','rigidParts(mergeGeometries(stoneLines,true))')
 src=src.replace('HERO.x','heroStub.x').replace('HERO.z','heroStub.z').replace('HERO.face','heroStub.face')
 if name=='forest':
  # In the game the whole forest is seen, not only the authored frame: every terrace edge with a
  # real drop gets the same rock columns (owner: "make them all the same rock"). The authored walls
  # are built exactly as before; the added ones in a second pass with their own random seed, so
  # nothing else in the scene changes.
  for old,new in[("wall: k === 'b' && inFrame(u, v), u, v","wall: T.ledge && k === 'b' && inFrame(u, v) ? 2 : 1, u, v"),
                 ("wall: a.wall && b.wall","wall: Math.min(a.wall, b.wall)"),
                 ("function cliffRuns(T) {","function cliffRuns(T, extra = false) {"),
                 ("const wall = i => p[i].wall && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);",
                  "const drop = q => Math.min(height(q.x + 2, q.z), height(q.x - 2, q.z), height(q.x, q.z + 2), height(q.x, q.z - 2)) < T.top - 1.2;\n"
                  "  const wall = i => (extra ? p[i].wall === 1 && drop(p[i]) && drop(p[(i + 1) % n]) : p[i].wall > 1) && !onStairs(p[i]) && !onStairs(p[(i + 1) % n]);"),
                 ("function buildCliffs() {","function buildCliffs(extra = false) {"),
                 ("    if (!T.ledge) continue;\n    for (const run of cliffRuns(T)) {","    if (!T.ledge && (!extra || T.top < 1.5)) continue;\n    for (const run of cliffRuns(T, extra)) {"),
                 ("{const cliffs=buildCliffs();cliffs.name='accepted-cliffs';scene.add(cliffs);}",
                  "{const cliffs=buildCliffs();cliffs.name='accepted-cliffs';scene.add(cliffs);const saved=seed;seed=20261026;const more=buildCliffs(true);seed=saved;more.name='accepted-cliffs';scene.add(more);}")]:
   assert src.count(old)==1,(name,old);src=src.replace(old,new)
 src=gameFoliageParts(name,src)
 camera="const camera=new THREE.PerspectiveCamera(32,1672/941,1,400);\n"
 camera+="const CAM={target:new V3(.96,0,-4.02),pitch:38,dist:51.9,yaw:-7.3};\n" if name=='beach' else f"const CAM={{target:new V3(0,0,-7.2),pitch:40,dist:{72 if name=='forest' else 93.6},yaw:0}};\n"
 pre="export function createAcceptedScene({renderer,time={value:0},clipBounds=null,assets={},foliage=null}={}){\nconst scene=new THREE.Group(),heroStub={},timeU=time,ASPECT=1672/941,rigidParts=g=>{g.userData.rigidParts=true;return g;};\n"+gameFoliageHelpers+helpers+camera+cam+"const SUN=new V3(-.6,.77,-.2).normalize();\n"
 if name=='shell-beach':pre+="const CONCH_ASSET=assets.conch||null;   // preloaded by render/accepted-assets.js\n"
 if name=='beach':
  src=src.replace('const pos = new V3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion();','const pos = wpPosition, q = wpRotation, spinQ = wpSpinRotation;').replace('new V3(0, 1, 0), t * 0.9 * G','wpAxis, t * 0.9 * G').replace('new V3(0, 1, 0), WP.spin','wpAxis, WP.spin')
  pre+='const wpPosition=new V3(),wpRotation=new THREE.Quaternion(),wpSpinRotation=new THREE.Quaternion(),wpAxis=new V3(0,1,0);\n'
 meta="const routes=typeof ROUTES!=='undefined'?ROUTES:typeof ST!=='undefined'&&ST.rows?[{id:'stairs',...ST}]:[];\nconst trails=typeof TRAILS!=='undefined'?TRAILS:[];\n"
 end="\nbuild();\n"+meta+"return {root:scene,height,field,colliders:COLLIDERS,routes,trails,landmark:typeof MILL!=='undefined'?MILL:typeof WELL!=='undefined'?WELL:typeof GAZEBO!=='undefined'?GAZEBO:null,P:typeof P!=='undefined'?P:null,trailDistance:typeof trailEdge!=='undefined'?trailEdge:(x,z)=>Math.abs(x-pathX(z))-2.6,shore:typeof zShore!=='undefined'?zShore:null,\nwaypoint:typeof WP!=='undefined'?WP:null,update(dt,t,on){timeU.value=t;"
 if name=='beach':end+="WP.active=on;updateWaypoint(dt,t);"
 if 'function updateAmbience' in src:end+="/* ambient particles remain game-owned */"
 if name=='forest':end+=""
 if name=='hill-windmill':end+="if(typeof MILL!=='undefined'&&MILL.rotor)MILL.rotor.rotation.z=Math.PI/4+t*.55;"
 end+="}};\n}\n"
 (out/(name+'.js')).write_text('// Generated by scripts/prepare-accepted-scenes.py from approved sources.\n'+imports+pre+src+end)
 print(name,len(src))
