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
 "function animeFoliage(seed=3,shrub=false){return gamePart(gameFoliage(seed,shrub,foliage?.palette),shrub?'shrub':'crown');}\n"
 "function animeTrunk(){return gamePart(gameTrunk(foliage?.bark),'trunk');}\n"
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
 # a map's own bark (data look.trunk, Moonroot) colours the scene's own roots too, as its trees
 src,n=re.subn(r'(\nFOL\.leaf=[^\n]*)',lambda m:m.group(1)+'if(foliage?.bark)Object.assign(FOL.trunk,foliage.bark);',src,count=1)
 return src

def paintKey(src):
 import hashlib
 i=src.find('function paint(')
 if i<0:return src
 j=src.find('\n}\n',i)+3;body=src[i:j]
 defs={}
 for m in re.finditer(r'^const (\w+) ?= ?(?:/\* glsl \*/ ?)?`',src,re.M):
  k=src.index('`',m.end()-1);e=k+1;depth=0
  while True:
   c=src[e]
   if c=='\\':e+=2;continue
   if c=='$' and src[e+1]=='{':depth+=1;e+=2;continue
   if c=='}' and depth:depth-=1
   elif c=='`' and not depth:break
   e+=1
  defs[m.group(1)]=src[m.start():e+1]
 seen,todo,parts=set(),[body],[body]
 while todo:
  for name in re.findall(r'\$\{(\w+)',todo.pop()):
   if name in defs and name not in seen:seen.add(name);parts.append(defs[name]);todo.append(defs[name])
 h=hashlib.sha1('\n'.join(parts).encode()).hexdigest()[:8]
 old="m.customProgramCacheKey = () => 'paint|' +"
 assert src.count(old)==1
 return src.replace(old,"m.customProgramCacheKey = () => 'paint|%s|' +"%h)

POLYAT_OLD="""function polyAt(T, x, z) {
  if (x < T.minX - 3 || x > T.maxX + 3 || z < T.minZ - 3 || z > T.maxZ + 3) return null;
  const p = T.pts; let best = Infinity, inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j], b = p[i];
    if ((b.z > z) !== (a.z > z) && x < (a.x - b.x) * (z - b.z) / (a.z - b.z) + b.x) inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z, e2 = ex * ex + ez * ez;
    if (e2 < best) { best = e2; polyAt.wall = a.wall; }
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}"""
POLYAT_NEW="""const POLY_GRIDS = new WeakMap();
// distance from a point to a segment, for the grid's bounds only
function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, t = l > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l)) : 0;
  return Math.hypot(a.x + dx * t - px, a.z + dz * t - pz);
}
function polyGrid(T) {
  let G = POLY_GRIDS.get(T);
  if (G && G.pts === T.pts && G.n === T.pts.length) return G;
  const p = T.pts, n = p.length, x0 = T.minX - 3, z0 = T.minZ - 3, w = T.maxX - T.minX + 6, d = T.maxZ - T.minZ + 6;
  const size = Math.max(w, d) / 24, nx = Math.max(1, Math.ceil(w / size)), nz = Math.max(1, Math.ceil(d / size));
  const edges = [];
  for (let i = 0, j = n - 1; i < n; j = i++) edges.push([p[j], p[i]]);
  const cells = new Array(nx * nz), rows = new Array(nz);
  for (let iz = 0; iz < nz; iz++) {
    const z1 = z0 + iz * size, z2 = z1 + size;
    rows[iz] = [];
    for (let k = 0; k < n; k++) { const [a, b] = edges[k]; if (Math.min(a.z, b.z) <= z2 + 1e-6 && Math.max(a.z, b.z) >= z1 - 1e-6) rows[iz].push(k); }
    for (let ix = 0; ix < nx; ix++) {
      const cx = x0 + (ix + .5) * size, cz = z0 + (iz + .5) * size, half = Math.hypot(size, size) / 2;
      // from any point of the cell (within `half` of its centre) the nearest edge is at most `near + half`
      // away, and an edge is at least its centre distance less `half` away: an edge whose centre distance
      // exceeds `near + 2 half` can never be the nearest there
      const dist = edges.map(([a, b]) => segDist(cx, cz, a, b)), near = Math.min(...dist), keep = [];
      for (let k = 0; k < n; k++) if (dist[k] <= near + 2 * half + 1e-6) keep.push(k);
      cells[iz * nx + ix] = keep;
    }
  }
  G = { pts: p, n, x0, z0, size, nx, nz, cells, rows };
  POLY_GRIDS.set(T, G);
  return G;
}
function polyAt(T, x, z) {
  if (x < T.minX - 3 || x > T.maxX + 3 || z < T.minZ - 3 || z > T.maxZ + 3) return null;
  const p = T.pts, n = p.length, G = polyGrid(T);
  const ix = Math.min(G.nx - 1, Math.max(0, Math.floor((x - G.x0) / G.size))), iz = Math.min(G.nz - 1, Math.max(0, Math.floor((z - G.z0) / G.size)));
  let best = Infinity, inside = false;
  for (const i of G.rows[iz]) {
    const a = p[i === 0 ? n - 1 : i - 1], b = p[i];
    if ((b.z > z) !== (a.z > z) && x < (a.x - b.x) * (z - b.z) / (a.z - b.z) + b.x) inside = !inside;
  }
  for (const i of G.cells[iz * G.nx + ix]) {
    const a = p[i === 0 ? n - 1 : i - 1], b = p[i];
    const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const ex = a.x + dx * t - x, ez = a.z + dz * t - z, e2 = ex * ex + ez * ez;
    if (e2 < best) { best = e2; polyAt.wall = a.wall; }
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}"""

for name in ['beach','forest','shell-beach','hill-windmill','azure-meadow','rose-garden','ranger-forest','gull-headland','mirror-pond','moonstone-camp','stone-ring','fern-rise','root-warren']:
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
 # Loading cost: the scenes' ground fields ask an outline's signed distance some 10^5 times, each a loop over
 # every edge. The same distance from a per-outline grid of candidate edges: a cell keeps, in outline order,
 # the edges that can be nearest anywhere in it and, per row, those spanning it for the inside test. Each
 # kept edge runs the original arithmetic, so the result (and polyAt.wall) is identical, bit for bit.
 if POLYAT_OLD in src:src=src.replace(POLYAT_OLD,POLYAT_NEW)
 if name=='forest':
  # Owner, 26 October 2026 (drawing): higher ground rings the cherry's hollow, its rock faces turned to
  # the paths, in world metres (the scene stands at -112, -64, scale 0.62). The north rise joins the
  # stair level and leaves trail-1 its pass on the east, under the arch; lower rises south-west and
  # south-east leave the south entrance open. Their faces are the added rock (second pass).
  old="// signed distance to a terrace outline: negative inside"
  new=("for (const [top, W] of [[H(3.3), [[-122.4,-86.5],[-122.2,-88.6],[-121.0,-90.6],[-118.5,-92.3],[-114.5,-93.9],[-111.2,-94.6],[-103.1,-95.6],[-96.5,-97.0],[-92.0,-98.8],[-90.0,-101.5],[-89.6,-105.5],[-89.5,-112],[-127,-112],[-127,-86.5]]],\n"
       "  [H(3.3), [[-127.2,-69.8],[-125.9,-66.4],[-123.0,-62.8],[-120.2,-59.0],[-119.6,-50],[-150,-50],[-150,-67.6],[-140,-67.8]]],\n"
       "  [H(3.4), [[-90.3,-73.5],[-91.8,-68.2],[-95.0,-64.6],[-99.5,-62.0],[-103.5,-59.6],[-105.2,-55.5],[-105.4,-50],[-74,-50],[-74,-67.6],[-86,-68]]]]) {\n"
       "  const curve = new THREE.CatmullRomCurve3(W.map(([x, z]) => new V3((x + 112) / 0.62, 0, (z + 64) / 0.62)), true, 'centripetal');\n"
       "  const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / 1.3)).slice(0, -1).map(q => ({ x: q.x, z: q.z, wall: 1 })), xs = pts.map(p => p.x), zs = pts.map(p => p.z);\n"
       "  TERRACES.push({ top, ledge: true, ring: true, pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });\n"
       "}\nlet RING_ON = true;\n"+old)
  assert src.count(old)==1,(name,old);src=src.replace(old,new)
  # trees and bush masses are placed by their spot in the authored frame, lifted onto the ground they
  # stand on; the rises must not move them, only raise them
  for old,new in[("    const d = polyAt(T, x, z);\n    if (d === null) continue;","    if (T.ring && !RING_ON) continue;\n    const d = polyAt(T, x, z);\n    if (d === null) continue;"),
                 ("    const top = height(x, z) > 1 ? height(x, z) : 0;","    RING_ON = false; const top = height(x, z) > 1 ? height(x, z) : 0; RING_ON = true;"),
                 ("    const top = height(x0, z0); if (top > 1) [cx, cz] = P(u, v, top);","    RING_ON = false; const top = height(x0, z0); RING_ON = true; if (top > 1) [cx, cz] = P(u, v, top);")]:
   assert src.count(old)==1,(name,old);src=src.replace(old,new)
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
 if name=='forest':
  # Owner, 26 October 2026: the straight banks north of the stairs and on the north-east wind like
  # the other rock faces, and the arching tree is one smooth arch whose island foot stands further back.
  for old,new in[("{ top: H(3.3), ledge: false, pts: [[0.2, 0.1, 't'], [0.32, 0.1, 't'], [0.33, -0.5, 't'], [0.18, -0.5, 't']] },","{ top: H(3.3), ledge: false, pts: [[0.2, 0.1, 't'], [0.32, 0.1, 't'], [0.3257, 0.0798, 't'], [0.3309, 0.0604, 't'], [0.3357, 0.0417, 't'], [0.3398, 0.0238, 't'], [0.3432, 0.0065, 't'], [0.3459, -0.0101, 't'], [0.3476, -0.0261, 't'], [0.3470, -0.0413, 't'], [0.3449, -0.0560, 't'], [0.3424, -0.0701, 't'], [0.3397, -0.0838, 't'], [0.3370, -0.0970, 't'], [0.3343, -0.1099, 't'], [0.3318, -0.1224, 't'], [0.3296, -0.1345, 't'], [0.3275, -0.1463, 't'], [0.3255, -0.1578, 't'], [0.3245, -0.1690, 't'], [0.3247, -0.1800, 't'], [0.3248, -0.1907, 't'], [0.3250, -0.2011, 't'], [0.3252, -0.2113, 't'], [0.3254, -0.2212, 't'], [0.3255, -0.2308, 't'], [0.3257, -0.2401, 't'], [0.3258, -0.2493, 't'], [0.3260, -0.2582, 't'], [0.3261, -0.2669, 't'], [0.33, -0.5, 't'], [0.18, -0.5, 't']] },"),
                 ("    const [ax, az] = P(0.975, 0.335, H(3.4)), [bx, bz] = P(0.93, 0.25, 0), [cx, cz] = P(0.86, 0.26, 0), [dx2, dz2] = P(0.78, 0.29, 0), [ex, ez] = P(0.715, 0.27, H(3.7));\n"
                  "    const a = TS, core = new THREE.CatmullRomCurve3([new V3(ax, H(3.2), az), new V3(bx, 6.6 + LIFT, bz), new V3(cx, 8.0 + LIFT, cz), new V3(dx2, 7.4 + LIFT, dz2), new V3(ex + 0.5, 5.4 + LIFT, ez), new V3(ex, H(3.55), ez)], false, 'centripetal');",
                  # one smooth arch over trail-1's north pass (owner's drawing): from the north rise to the right
                  # terrace, rising straight from both feet to a round crest, bowing slightly forward
                  "    const L = (x, z) => [(x + 112) / 0.62, (z + 64) / 0.62], [ax, az] = L(-92.6, -102.2), [ex, ez] = L(-79.6, -103.6), ya = H(3.1), ye = H(3.2), rise = 11.5 + LIFT - (ya + ye) / 2;\n"
                  "    const arc = t => { const s = Math.sin(Math.PI * t); return [ax + (ex - ax) * t, ya + (ye - ya) * t + rise * Math.pow(s, 0.7), az + (ez - az) * t + 1.2 * s]; };\n"
                  "    const [bx, , bz] = arc(0.25), [cx, , cz] = arc(0.5);\n"
                  "    const a = TS, core = new THREE.CatmullRomCurve3([0, 0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 1].map(t => new V3(...arc(t))), false, 'centripetal');"),
                 ("[0.97, 0.0, 't'], [1.0, -0.5, 't']","[0.97, 0.0, 't'], [0.9653, -0.0166, 't'], [0.9611, -0.0326, 't'], [0.9576, -0.0478, 't'], [0.9551, -0.0624, 't'], [0.9536, -0.0763, 't'], [0.9536, -0.0893, 't'], [0.9567, -0.1013, 't'], [0.9606, -0.1128, 't'], [0.9649, -0.1238, 't'], [0.9695, -0.1344, 't'], [0.9740, -0.1448, 't'], [0.9783, -0.1549, 't'], [0.9822, -0.1649, 't'], [0.9819, -0.1755, 't'], [0.9812, -0.1859, 't'], [0.9817, -0.1958, 't'], [0.9823, -0.2054, 't'], [0.9829, -0.2148, 't'], [0.9834, -0.2239, 't'], [0.9840, -0.2329, 't'], [0.9845, -0.2416, 't'], [0.9850, -0.2501, 't'], [0.9855, -0.2584, 't'], [0.9860, -0.2666, 't'], [1.0, -0.5, 't']")]:
   assert src.count(old)==1,(name,old);src=src.replace(old,new)
 if name=='forest':
  # Owner: the lower ring has no step inside. Where a rise now stands as high in front of an authored
  # wall, that stretch of columns is not drawn (its random draws still run, so the rest stays as it is).
  for old,new in[("function buildCliffs(extra = false) {\n  const pos = [], col = [], tmpA = new V3(), tmpB = new V3(), nn = new V3();\n  const quad = (a, b, c, d, out, color) => {\n",
                  "function buildCliffs(extra = false) {\n  const pos = [], col = [], tmpA = new V3(), tmpB = new V3(), nn = new V3();\n  let SKIP = false;\n  const quad = (a, b, c, d, out, color) => {\n    if (SKIP) return;\n"),
                 ("      cols.forEach((C, ci) => {\n        for (let i = C.i0; i < C.i1; i++) {\n          const out = new V3((S[i].nx + S[i + 1].nx) / 2, 0, (S[i].nz + S[i + 1].nz) / 2);",
                  "      cols.forEach((C, ci) => {\n        { let drop = 0; for (let i = C.i0; i <= C.i1; i++) drop += T.top - S[i].base - 0.35; SKIP = drop / (C.i1 - C.i0 + 1) < 1.2; }\n        for (let i = C.i0; i < C.i1; i++) {\n          const out = new V3((S[i].nx + S[i + 1].nx) / 2, 0, (S[i].nz + S[i + 1].nz) / 2);")]:
   assert src.count(old)==1,(name,old[:60]);src=src.replace(old,new)
  old="  const g = new THREE.BufferGeometry();\n  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));"
  assert src.count(old)>=1,(name,'geometry')
 src=gameFoliageParts(name,src)
 camera="const camera=new THREE.PerspectiveCamera(32,1672/941,1,400);\n"
 camera+="const CAM={target:new V3(.96,0,-4.02),pitch:38,dist:51.9,yaw:-7.3};\n" if name=='beach' else f"const CAM={{target:new V3(0,0,-7.2),pitch:40,dist:{72 if name=='forest' else 93.6},yaw:0}};\n"
 pre="export function createAcceptedScene({renderer,time={value:0},clipBounds=null,assets={},foliage=null}={}){\nconst scene=new THREE.Group(),heroStub={},timeU=time,ASPECT=1672/941,rigidParts=g=>{g.userData.rigidParts=true;return g;};\n"+gameFoliageHelpers+helpers+camera+cam+"const SUN=new V3(-.6,.77,-.2).normalize();\n"
 if name=='shell-beach':pre+="const CONCH_ASSET=assets.conch||null;   // preloaded by render/accepted-assets.js\n"
 if 'function updateWaypoint' in src:   # the rebuilding warp pillar: the beach's, and Moonstone Camp's
  src=src.replace('const pos = new V3(), q = new THREE.Quaternion(), spinQ = new THREE.Quaternion();','const pos = wpPosition, q = wpRotation, spinQ = wpSpinRotation;').replace('new V3(0, 1, 0), t * 0.9 * G','wpAxis, t * 0.9 * G').replace('new V3(0, 1, 0), WP.spin','wpAxis, WP.spin')
  pre+='const wpPosition=new V3(),wpRotation=new THREE.Quaternion(),wpSpinRotation=new THREE.Quaternion(),wpAxis=new V3(0,1,0);\n'
 meta="const routes=typeof ROUTES!=='undefined'?ROUTES:typeof ST!=='undefined'&&ST.rows?[{id:'stairs',...ST}]:[];\nconst trails=typeof TRAILS!=='undefined'?TRAILS:[];\n"
 end="\nbuild();\n"+meta+"return {root:scene,height,field,colliders:COLLIDERS,routes,trails,landmark:typeof MILL!=='undefined'?MILL:typeof WELL!=='undefined'?WELL:typeof GAZEBO!=='undefined'?GAZEBO:null,P:typeof P!=='undefined'?P:null,trailDistance:typeof trailEdge!=='undefined'?trailEdge:(x,z)=>Math.abs(x-pathX(z))-2.6,shore:typeof zShore!=='undefined'?zShore:null,\nwaypoint:typeof WP!=='undefined'?WP:null,crossing:typeof CROSSING!=='undefined'?CROSSING:null,pond:typeof POND!=='undefined'?{...POND,radius:pondRadius,waterY:SEA_Y}:null,update(dt,t,on){timeU.value=t;"
 if 'function updateWaypoint' in src:end+="WP.active=on;updateWaypoint(dt,t);"
 if 'function updateAmbience' in src:end+="/* ambient particles remain game-owned */"
 if name=='forest':end+=""
 if name=='hill-windmill':end+="if(typeof MILL!=='undefined'&&MILL.rotor)MILL.rotor.rotation.z=Math.PI/4+t*.55;"
 end+="}};\n}\n"
 # Scenes share one renderer, and paint()'s program cache key holds only lengths and flags: two
 # scenes whose paint shaders differ (the beach's underwater tint) would reuse one program. The key
 # also carries a hash of the shader source the paint function builds from: its own text and every
 # top-level string constant it (or those constants) interpolates. Identical shaders still share.
 src=paintKey(src)
 (out/(name+'.js')).write_text('// Generated by scripts/prepare-accepted-scenes.py from approved sources.\n'+imports+pre+src+end)
 print(name,len(src))
