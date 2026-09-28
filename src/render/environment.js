// Trees, rocks, town, ruins, camp, bridges and small decoration, drawn from the shared layout
// and standing on the terrain. Repeated props use chunked InstancedMesh (frustum culling per
// chunk) so the demo stays light on iPad. Grass, flowers, reeds, ferns and canopies sway.
import * as THREE from 'three';
import { toon, outlined, darker } from './toon.js';
import { patchMaterial, hullMaterial } from './patch.js';
import { createRng } from '../core/rng.js';
import {leafTexture,needleTexture} from './leafpaint.js';
import { paintSurface } from './surfaceart.js';
import {leafCrown,pineBough,branchTrunk,meadowGrass,wildflowers,facetedStone} from './nature.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

const CHUNK = 32; // metres; each chunk is its own InstancedMesh so off-screen props are culled

/** A unique toon material (so shader patches don't leak into the shared cache). */
function mat(color, o = {}) {
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toon('#ffffff').gradientMap,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    emissive: new THREE.Color(o.emissive || 0),
    emissiveIntensity: o.emissiveIntensity ?? 1,
    vertexColors: !!o.vertexColors,
  });
  if (o.wind || o.see) patchMaterial(m, { wind: o.wind, windBase: o.windBase, see: o.see });
  return m;
}

function instanced(geo, material, list, { shadow = true, outline = null, outlineWidth = 0.03, wind = 0, windBase = 0, see = false } = {}) {
  const group = new THREE.Group();
  if (!list.length) return group;
  const chunks = new Map();
  for (const it of list) {
    const k = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push(it);
  }
  const colors = list.some((i) => i.color !== undefined);
  const hull = outline ? hullMaterial(outline, outlineWidth, { wind, windBase, see }) : null;
  for (const items of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => {
      tmpE.set(it.rx || 0, it.ry || 0, it.rz || 0);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(it.x, it.y || 0, it.z);
      const s = it.s ?? 1;
      tmpS.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      if (colors) mesh.setColorAt(i, tmpC.set(it.color ?? '#ffffff'));
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    if (hull) {
      const h = new THREE.InstancedMesh(geo, hull, items.length);
      h.instanceMatrix.copy(mesh.instanceMatrix);
      h.instanceMatrix.needsUpdate = true;
      h.computeBoundingSphere();
      group.add(h);
    }
  }
  return group;
}

function blobGeometry(detail = 1, seed = 1, amp = 0.12) {
  // indexed so normals are smooth (round cel-shaded canopies, not facets)
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const rng = createRng(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + rng.range(-amp, amp);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Minimal geometry merge (position + normal), enough for static props. */
export function mergeGeometries(geos) {
  const pos = [];
  const nrm = [];
  for (let g of geos) {
    g = g.index ? g.toNonIndexed() : g;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

export function createEnvironment(world) {
  const root = new THREE.Group();
  const rng = createRng(99);
  const gy = (x, z) => world.groundY(x, z);
  const sy = (x, z) => world.surfaceY(x, z);
  const zid = (x, z) => world.zoneAt(x, z).id;

  // ----- trees -----
  const trunks = [];
  const birchTrunks = [];
  const canopy = [];
  const birchLeaves = [];
  const pineTiers = [];
  const pineTrunks = [];
  const willowLeaves = [];
  const greens = ['#f8f1d4', '#e8eddd', '#f8f5dc', '#ecf1de'];
  const trees = [...world.circles.filter((c) => ['tree', 'birch', 'pine', 'willow'].includes(c.type)), ...world.decor.edgeTrees];
  for (const c of trees) {
    const s = c.scale * 0.85;
    const y = gy(c.x, c.z) - 0.2;
    const zone = zid(Math.max(world.bounds.minX, Math.min(world.bounds.maxX - 0.1, c.x)), Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ - 0.1, c.z)));
    const hueShift = zone === 'forest' || zone === 'wolf_den' ? -0.05 : zone === 'highlands' ? 0.03 : zone === 'ruins' ? 0.04 : 0;
    if (c.type === 'pine') {
      pineTrunks.push({ x: c.x, z: c.z, y, s, ry: c.rot });
      for (let t = 0; t < 3; t++) {
        const col = new THREE.Color(t === 2 ? '#f2f1d9' : t === 1 ? '#e8eed6' : '#e0e5d4');
        col.offsetHSL(hueShift * 0.2, 0, hueShift * 0.5);
        pineTiers.push({ x: c.x, z: c.z, y: y + (1.3 + t * 1.25) * s, s: (1.5 - t * 0.38) * s, sy: 1.25 * s, ry: c.rot + t, color: `#${col.getHexString()}` });
      }
      continue;
    }
    if (c.type === 'birch') {
      birchTrunks.push({ x: c.x, z: c.z, y, s: 1, sx: s * 0.8, sy: s * 1.15, sz: s * 0.8, ry: c.rot });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + c.rot;
        const r = i === 0 ? 0 : 0.7 * s;
        const col = new THREE.Color(rng.pick(['#fff4c7', '#f6f5cf', '#eff4cc']));
        birchLeaves.push({ x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r, y: y + (i === 0 ? 4.2 : 3.5) * s, s: (i === 0 ? 1.15 : 0.95) * s, sy: 1.0 * s, ry: rng.range(0, 6), color: `#${col.getHexString()}` });
      }
      continue;
    }
    trunks.push({ x: c.x, z: c.z, y, s: 1, sx: s, sy: s * (c.type === 'willow' ? 1.1 : 1), sz: s, ry: c.rot });
    const blobs = c.type === 'willow' ? 3 : 4 + (rng.next() < 0.5 ? 1 : 0);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + c.rot;
      const r = i === 0 ? 0 : 0.95 * s;
      const col = new THREE.Color(c.type === 'willow' ? rng.pick(['#cde4ce', '#d4e7cf']) : rng.pick(greens));
      col.offsetHSL(hueShift * 0.3, 0, hueShift);
      canopy.push({
        x: c.x + Math.sin(a) * r * 0.9,
        z: c.z + Math.cos(a) * r * 0.9,
        y: y + (i === 0 ? 3.9 : 3.1 + rng.range(-0.2, 0.4)) * s,
        s: (i === 0 ? 1.55 : 1.25) * s * rng.range(0.9, 1.1),
        sy: (i === 0 ? 1.35 : 1.05) * s,
        ry: rng.range(0, 6),
        color: `#${col.getHexString()}`,
      });
    }
    if (c.type === 'willow') willowLeaves.push({ x: c.x, z: c.z, y: y + 2.2 * s, s: 1.7 * s, sy: 1.35 * s, ry: c.rot, color: '#ceddc4' });
  }
  const trunkGeo = branchTrunk();
  root.add(instanced(trunkGeo, paintSurface(mat('#85613f', {vertexColors:true}), 'bark'), trunks, { outline: '#564132', outlineWidth: 0.027 }));
  const birchGeo = new THREE.CylinderGeometry(0.13, 0.2, 3.6, 7);
  birchGeo.translate(0, 1.8, 0);
  root.add(instanced(birchGeo, mat('#ece8dc'), birchTrunks, { outline: '#4a4640', outlineWidth: 0.04 }));
  const pineTrunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6);
  pineTrunkGeo.translate(0, 0.8, 0);
  root.add(instanced(pineTrunkGeo, mat('#6b4630'), pineTrunks, { outline: '#2e1f14', outlineWidth: 0.04 }));
  const canopyGeo = leafCrown(3);
  const canopyMat = mat('#ffffff', { double:true, wind: 0.025, windBase: 1.2, see: true });
  canopyMat.map=leafTexture();canopyMat.alphaTest=.45;canopyMat.forceSinglePass=true;
  root.add(instanced(canopyGeo, canopyMat, canopy.map(it=>({...it,ry:0})), { wind: 0.025, windBase: 1.2, see: true }));
  root.add(instanced(leafCrown(5), canopyMat, birchLeaves.map(it=>({...it,ry:0})), { wind: 0.025, windBase: 1.2, see: true }));
  const tierGeo = pineBough();
  const pineMat=mat('#ffffff',{double:true,wind:.02,see:true});pineMat.map=needleTexture();pineMat.alphaTest=.45;pineMat.forceSinglePass=true;
  root.add(instanced(tierGeo,pineMat,pineTiers.map(it=>({...it,ry:0})),{wind:.02,see:true}));
  const willowGeo = leafCrown(23);
  const willowMat=mat('#ffffff',{double:true,wind:.045,windBase:1.2,see:true});willowMat.map=leafTexture();willowMat.alphaTest=.45;willowMat.forceSinglePass=true;
  root.add(instanced(willowGeo,willowMat,willowLeaves.map(it=>({...it,ry:0})),{shadow:true}));

  // ----- rocks, boulders, crystals, stumps, logs -----
  const rocks = [];
  const crystals = [];
  const stumps = [];
  const logs = [];
  for (const c of world.circles) {
    const y = gy(c.x, c.z);
    if (c.type === 'rock' || c.type === 'boulder') {
      const big = c.type === 'boulder';
      rocks.push({ x: c.x, z: c.z, y: y + c.scale * (big ? 0.45 : 0.3), s: c.scale * (big ? 1.1 : 1), sy: c.scale * (big ? 0.85 : 0.7), ry: c.rot, color: rng.pick(['#a6a8ad', '#9a9ca3', '#b3b4b8', '#a39f9a']) });
    } else if (c.type === 'crystal') {
      for (let k = 0; k < 3; k++) {
        const a = c.rot + k * 2.1;
        crystals.push({ x: c.x + Math.sin(a) * 0.35 * c.scale, z: c.z + Math.cos(a) * 0.35 * c.scale, y, s: c.scale * (k === 0 ? 1.2 : 0.75), ry: a, rx: k === 0 ? 0 : Math.sin(a) * 0.35, rz: k === 0 ? 0 : Math.cos(a) * 0.35, color: c.hue ? '#c9a8ff' : '#8fe0ff' });
      }
    } else if (c.type === 'stump') stumps.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot });
  }
  for (const bx of world.boxes) if (bx.type === 'log') logs.push({ x: bx.x, z: bx.z, y: gy(bx.x, bx.z) + 0.35, sx: 1, sy: 1, sz: bx.hz * 2, ry: bx.angle });
  for (const l of world.decor.logsDecor) logs.push({ x: l.x, z: l.z, y: gy(l.x, l.z) + 0.3, sx: 0.8, sy: 0.8, sz: 1.6, ry: l.angle });
  root.add(instanced(facetedStone(), paintSurface(mat('#ffffff'),'rock'), rocks, { outline: '#676568', outlineWidth: 0.019 }));
  const crystalGeo = new THREE.OctahedronGeometry(0.45, 0);
  crystalGeo.scale(0.55, 1.9, 0.55);
  crystalGeo.translate(0, 0.75, 0);
  root.add(instanced(crystalGeo, mat('#ffffff', { emissive: '#3a6f9a', emissiveIntensity: 0.9 }), crystals, { outline: '#2a3f6a', outlineWidth: 0.03 }));
  const stumpGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.6, 9);
  stumpGeo.translate(0, 0.25, 0);
  root.add(instanced(stumpGeo, mat('#7a5236'), stumps, { outline: '#3b2618', outlineWidth: 0.04 }));
  const logGeo = new THREE.CylinderGeometry(0.34, 0.38, 1, 9);
  logGeo.rotateX(Math.PI / 2);
  root.add(instanced(logGeo, mat('#7f5638'), logs, { outline: '#3b2618', outlineWidth: 0.04 }));

  // ----- ruins -----
  const pillars = [];
  const broken = [];
  const blocks = [];
  const statues = [];
  const walls = [];
  const archPillars = [];
  for (const c of world.circles) {
    const y = gy(c.x, c.z);
    if (c.type === 'pillar') pillars.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot });
    if (c.type === 'pillar_broken') broken.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot, rz: 0.08 });
    if (c.type === 'ruin_block') blocks.push({ x: c.x, z: c.z, y: y + c.scale * 0.4, s: c.scale, sy: c.scale * 0.8, ry: c.rot, rz: rng.range(-0.15, 0.15) });
    if (c.type === 'statue') statues.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot });
    if (c.type === 'arch_pillar') archPillars.push({ x: c.x, z: c.z, y: y - 0.1, s: 1, ry: c.rot });
  }
  for (const bx of world.boxes) if (bx.type === 'ruin_wall') walls.push({ x: bx.x, z: bx.z, y: gy(bx.x, bx.z) - 0.2, sx: 0.9, sy: bx.height + 0.2, sz: bx.hz * 2, ry: bx.angle });
  const ruinMat = paintSurface(mat('#c4c0c6'),'masonry');
  root.add(instanced(pillarGeometry(4.6), ruinMat, pillars, { outline: '#4e4760', outlineWidth: 0.04 }));
  root.add(instanced(pillarGeometry(2.1, true), ruinMat, broken, { outline: '#4e4760', outlineWidth: 0.04 }));
  root.add(instanced(new THREE.BoxGeometry(1.6, 1.1, 1.3), paintSurface(mat('#b9b2c6'),'masonry'), blocks, { outline: '#4e4760', outlineWidth: 0.04 }));
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  root.add(instanced(wallGeo, paintSurface(mat('#bdb5ca'),'masonry'), walls, { outline: '#4e4760', outlineWidth: 0.03 }));
  root.add(instanced(statueGeometry(), mat('#b7b0c6'), statues, { outline: '#4e4760', outlineWidth: 0.035 }));
  root.add(instanced(pillarGeometry(4.2), ruinMat, archPillars, { outline: '#4e4760', outlineWidth: 0.04 }));
  for (const a of world.decor.arches) {
    const lintel = outlined(new THREE.BoxGeometry(a.span * 2 + 1.6, 0.7, 1.3), ruinMat, { outline: '#4e4760', width: 0.04 });
    lintel.position.set(a.x, gy(a.x, a.z) + 4.35, a.z);
    lintel.rotation.y = a.angle + Math.PI / 2;
    root.add(lintel);
  }
  const ruinsData = world.data.ruins;
  if (ruinsData) {
    const [rx, rz] = ruinsData.centre;
    const altar = outlined(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 8), toon('#a79fbd'), { outline: '#4e4760', width: 0.04 });
    altar.position.set(rx + 6, gy(rx + 6, rz - 6) + 0.25, rz - 6);
    root.add(altar);
  }

  // ----- bridges, town, camp -----
  for (const br of world.bridges) root.add(createBridge(world, br));
  root.add(createTown(world, rng));
  if (world.data.camp) root.add(createCamp(world));

  // ----- small decoration -----
  const d = world.decor;
  // Grouped plant patches: short curved leaves and readable flowers, leaving paths clear.
  const grass=[],flowers=[],detailRng=createRng(842);
  const clear=(x,z)=>!world.isWater(x,z,.7)&&world.roadDist(x,z)>.0&&world.slopeAt(x,z)<.7&&!(world.zoneAt(x,z).safe&&Math.hypot(x-world.data.town.centre[0],z-world.data.town.centre[1])<world.data.town.plazaRadius);
  for(const g of d.grass){
    for(let k=0;k<10;k++){
      const a=detailRng.range(0,6.28),r=k===0?0:detailRng.range(.15,1.3),x=g.x+Math.sin(a)*r,z=g.z+Math.cos(a)*r;
      if(!clear(x,z))continue;
      const scale=g.s*detailRng.range(.43,.78);
      grass.push({x,z,y:gy(x,z)-.025,ry:a,s:scale,color:grassTint(world,x,z,scale)});
    }
  }
  root.add(instanced(meadowGrass(),mat('#ffffff',{vertexColors:true,double:true,wind:.15}),grass,{shadow:false}));
  const flowerCols=['#fff9e6','#f5dc77','#ecd0da','#c4b7db','#bcdae0'];
  for(const f of d.flowers){
    const cluster=f.color===0||f.color===1?6:4;
    for(let k=0;k<cluster;k++){
      const a=detailRng.range(0,6.28),r=k===0?0:detailRng.range(.12,.55),x=f.x+Math.sin(a)*r,z=f.z+Math.cos(a)*r;
      if(clear(x,z))flowers.push({x,z,y:gy(x,z),s:f.s*detailRng.range(.7,1.1),ry:a,color:flowerCols[f.color]});
    }
  }
  root.add(instanced(wildflowers(),mat('#ffffff',{vertexColors:true,double:true,wind:.12}),flowers,{shadow:false}));
  const bushGeo=leafCrown(11);
  const bushes = [];
  const berries = [];
  for (const bsh of d.bushes) {
    const y = gy(bsh.x, bsh.z);
    bushes.push({ x: bsh.x, z: bsh.z, y: y + 0.35 * bsh.s, s: 0.75 * bsh.s, sy: 0.55 * bsh.s, color: '#dfe8c9' });
    bushes.push({ x: bsh.x + 0.5 * bsh.s, z: bsh.z + 0.2, y: y + 0.28 * bsh.s, s: 0.55 * bsh.s, sy: 0.45 * bsh.s, color: '#ecedce' });
    if (bsh.berries) for (let k = 0; k < 5; k++) berries.push({ x: bsh.x + Math.sin(k * 1.3) * 0.5 * bsh.s, z: bsh.z + Math.cos(k * 1.3) * 0.45 * bsh.s, y: y + 0.45 * bsh.s + (k % 2) * 0.12, s: 0.09 });
  }
  const bushMat=mat('#ffffff',{double:true,wind:.03,windBase:.5});bushMat.map=leafTexture();bushMat.alphaTest=.45;bushMat.forceSinglePass=true;
  root.add(instanced(bushGeo,bushMat,bushes.map(it=>({...it,ry:0})),{shadow:true}));
  root.add(instanced(new THREE.SphereGeometry(1, 6, 4), mat('#d8334a'), berries, { shadow: false }));
  const reedGeo = new THREE.ConeGeometry(0.05, 1.2, 4);
  reedGeo.translate(0, 0.6, 0);
  const reeds = [];
  for (const r of d.reeds) {
    const y = sy(r.x, r.z) - 0.1;
    for (let k = 0; k < 3; k++) reeds.push({ x: r.x + Math.sin(k * 2.1) * 0.2, z: r.z + Math.cos(k * 2.1) * 0.2, y, s: r.s, rz: Math.sin(k + r.rot) * 0.15, color: k === 1 ? '#7a9b3c' : '#5f8a35' });
  }
  root.add(instanced(reedGeo, mat('#ffffff', { wind: 0.16 }), reeds, { shadow: false }));
  const lilyGeo = new THREE.CircleGeometry(0.4, 10, 0.3, Math.PI * 1.8);
  lilyGeo.rotateX(-Math.PI / 2);
  root.add(instanced(lilyGeo, toon('#5aa640'), d.lilies.map((l) => ({ x: l.x, z: l.z, y: world.waterLevel + 0.03, s: l.s, ry: l.rot })), { shadow: false }));
  root.add(instanced(fernGeometry(), mat('#4f9a3a', { double: true, wind: 0.12 }), d.ferns.map((f) => ({ x: f.x, z: f.z, y: gy(f.x, f.z), s: f.s, ry: f.rot })), { shadow: false }));
  const stems = [];
  const caps = [];
  for (const m of d.mushrooms) {
    const y = gy(m.x, m.z);
    for (let k = 0; k < 3; k++) {
      const a = m.rot + k * 2.3;
      const r = k === 0 ? 0 : 0.18 * m.s;
      const s = m.s * (k === 0 ? 1 : 0.65);
      stems.push({ x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r, y, s });
      caps.push({ x: m.x + Math.sin(a) * r, z: m.z + Math.cos(a) * r, y: y + 0.24 * s, s, color: m.red ? '#d8483a' : '#c89a64' });
    }
  }
  const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.26, 6);
  stemGeo.translate(0, 0.13, 0);
  root.add(instanced(stemGeo, mat('#f0e6d0'), stems, { shadow: false }));
  const capGeo = new THREE.SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  root.add(instanced(capGeo, mat('#ffffff'), caps, { shadow: false, outline: '#5a2a20', outlineWidth: 0.012 }));
  const pebbleGeo = blobGeometry(0, 13, 0.2);
  root.add(instanced(pebbleGeo, mat('#b7b3ac'), d.pebbles.map((p) => ({ x: p.x, z: p.z, y: gy(p.x, p.z), s: 0.1 * p.s, sy: 0.06 * p.s, ry: p.rot })), { shadow: false }));
  const boneGeo = new THREE.CapsuleGeometry(0.05, 0.45, 2, 6);
  boneGeo.rotateZ(Math.PI / 2);
  root.add(instanced(boneGeo, mat('#efe8d8'), d.bones.map((b2) => ({ x: b2.x, z: b2.z, y: gy(b2.x, b2.z) + 0.05, s: b2.s, ry: b2.rot })), { shadow: false }));
  const crates = d.crates.filter((c) => c.kind === 'crate');
  const barrels = d.crates.filter((c) => c.kind === 'barrel');
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  crateGeo.translate(0, 0.5, 0);
  root.add(instanced(crateGeo, mat('#b7885a'), crates.map((c) => ({ x: c.x, z: c.z, y: gy(c.x, c.z), s: c.s, ry: c.rot })), { outline: '#3b2618', outlineWidth: 0.03 }));
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 10);
  barrelGeo.translate(0, 0.5, 0);
  root.add(instanced(barrelGeo, mat('#9a6a42'), barrels.map((c) => ({ x: c.x, z: c.z, y: gy(c.x, c.z), s: c.s, ry: c.rot })), { outline: '#3b2618', outlineWidth: 0.03 }));

  // fences, lanterns, banners
  const posts = [];
  const rails = [];
  for (const f of d.fences) {
    const dx = Math.sin(f.angle);
    const dz = Math.cos(f.angle);
    for (const k of [-0.5, 0.5]) {
      const px = f.x + dx * f.len * k;
      const pz = f.z + dz * f.len * k;
      posts.push({ x: px, z: pz, y: gy(px, pz), ry: f.angle });
    }
    for (const hh of [0.55, 1.0]) rails.push({ x: f.x, z: f.z, y: gy(f.x, f.z) + hh, ry: f.angle, sz: f.len });
  }
  const postGeo = new THREE.BoxGeometry(0.22, 1.35, 0.22);
  postGeo.translate(0, 0.67, 0);
  root.add(instanced(postGeo, mat('#8a5c3a'), posts, { outline: '#3b2618', outlineWidth: 0.03 }));
  root.add(instanced(new THREE.BoxGeometry(0.1, 0.12, 1), mat('#9b6a44'), rails, { outline: '#3b2618', outlineWidth: 0.02 }));
  for (const l of d.lanterns) root.add(lantern(l.x, gy(l.x, l.z), l.z));
  for (const bn of d.banners) root.add(banner(bn.x, gy(bn.x, bn.z), bn.z, bn.color));

  // waypoint stones (the view lights them up once discovered)
  const waypoints = new Map();
  for (const wp of world.waypoints) {
    const g = waypointStone();
    g.position.set(wp.x, gy(wp.x, wp.z), wp.z);
    root.add(g);
    waypoints.set(wp.id, g);
  }
  return { root, waypoints };
}

function grassTint(world, x, z, s) {
  const zn = world.zoneAt(x, z);
  const c = new THREE.Color(zn.palette ? zn.palette[0] : '#86c24e');
  c.offsetHSL(0, -0.05, (s - 1) * 0.08 - 0.06);
  return `#${c.getHexString()}`;
}

function fernGeometry() {
  const pos = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const px = Math.cos(a) * 0.09;
    const pz = -Math.sin(a) * 0.09;
    // a leaf: base, two mid points, arching tip
    pos.push(0, 0.02, 0, dx * 0.35 + px, 0.3, dz * 0.35 + pz, dx * 0.35 - px, 0.3, dz * 0.35 - pz);
    pos.push(dx * 0.35 + px, 0.3, dz * 0.35 + pz, dx * 0.7, 0.18, dz * 0.7, dx * 0.35 - px, 0.3, dz * 0.35 - pz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = [];
  for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

function pillarGeometry(h, broken = false) {
  const parts = [];
  const base = new THREE.BoxGeometry(1.5, 0.5, 1.5);
  base.translate(0, 0.15, 0);
  parts.push(base);
  const shaft = new THREE.CylinderGeometry(0.55, 0.62, h - (broken ? 0.4 : 0.9), 8);
  shaft.translate(0, 0.4 + (h - (broken ? 0.4 : 0.9)) / 2, 0);
  parts.push(shaft);
  if (!broken) {
    const cap = new THREE.BoxGeometry(1.4, 0.5, 1.4);
    cap.translate(0, h - 0.25, 0);
    parts.push(cap);
  } else {
    const chunk = new THREE.DodecahedronGeometry(0.6, 0);
    chunk.translate(0, h, 0);
    parts.push(chunk);
  }
  return mergeGeometries(parts);
}

function statueGeometry() {
  // a weathered guardian: plinth, robed body, head, folded wings
  const parts = [];
  const plinth = new THREE.BoxGeometry(1.5, 0.6, 1.5);
  plinth.translate(0, 0.3, 0);
  parts.push(plinth);
  const body = new THREE.CylinderGeometry(0.35, 0.6, 1.9, 8);
  body.translate(0, 1.55, 0);
  parts.push(body);
  const head = new THREE.SphereGeometry(0.3, 10, 8);
  head.translate(0, 2.75, 0);
  parts.push(head);
  for (const s of [-1, 1]) {
    const wing = new THREE.ConeGeometry(0.35, 1.7, 4);
    wing.rotateZ(s * 0.35);
    wing.translate(s * 0.45, 1.9, -0.25);
    parts.push(wing);
  }
  return mergeGeometries(parts);
}

function createBridge(world, br) {
  const g = new THREE.Group();
  g.position.set(br.x, 0, br.z);
  g.rotation.y = br.angle;
  const plankA = toon('#a8744a');
  const plankB = toon('#9a6a42');
  const n = Math.round((br.hx * 2) / 0.55);
  const floorY = world.waterLevel - 1.2;
  for (let i = 0; i < n; i++) {
    const x = -br.hx + 0.28 + i * 0.55;
    const y = world.deckY(br, x);
    const p = outlined(new THREE.BoxGeometry(0.5, 0.18, br.hz * 2), i % 2 ? plankA : plankB, { outline: '#4a2e1a', width: 0.02 });
    p.position.set(x, y - 0.09, 0);
    g.add(p);
  }
  for (const side of [-1, 1]) {
    const railPts = [];
    for (let i = 0; i <= 6; i++) {
      const x = -br.hx + (i / 6) * br.hx * 2;
      const y = world.deckY(br, x);
      const h = y + 1.0 - floorY;
      const post = outlined(new THREE.BoxGeometry(0.2, h, 0.2), toon('#7a5236'), { outline: '#3b2618', width: 0.02 });
      post.position.set(x, floorY + h / 2, side * (br.hz - 0.1));
      g.add(post);
      railPts.push([x, y + 0.95]);
    }
    for (let i = 0; i < railPts.length - 1; i++) {
      const [x0, y0] = railPts[i];
      const [x1, y1] = railPts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const rail = outlined(new THREE.BoxGeometry(len, 0.12, 0.12), toon('#8a5c3a'), { outline: '#3b2618', width: 0.02 });
      rail.position.set((x0 + x1) / 2, (y0 + y1) / 2, side * (br.hz - 0.1));
      rail.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      g.add(rail);
    }
  }
  return g;
}

function lantern(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const post = outlined(new THREE.BoxGeometry(0.22, 3, 0.22), toon('#6b4a30'), { outline: '#2e1f14', width: 0.02 });
  post.position.y = 1.5;
  g.add(post);
  const arm = outlined(new THREE.BoxGeometry(0.9, 0.14, 0.14), toon('#6b4a30'), { outline: '#2e1f14', width: 0.02 });
  arm.position.set(0.35, 2.85, 0);
  g.add(arm);
  const lamp = outlined(new THREE.BoxGeometry(0.34, 0.45, 0.34), toon('#ffe7a0', { emissive: '#ffb84a', emissiveIntensity: 0.9 }), { outline: '#2e1f14', width: 0.02 });
  lamp.position.set(0.7, 2.5, 0);
  g.add(lamp);
  return g;
}

function banner(x, y, z, color) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const pole = outlined(new THREE.CylinderGeometry(0.06, 0.07, 4, 6), toon('#6b4a30'), { outline: '#2e1f14', width: 0.02 });
  pole.position.y = 2;
  g.add(pole);
  const cloth = new THREE.PlaneGeometry(0.9, 1.8, 1, 6);
  cloth.translate(0.45, -0.9, 0);
  const m = new THREE.Mesh(cloth, mat(color, { double: true, wind: 0.18, windBase: 1.8 }));
  m.position.set(0.07, 3.8, 0);
  m.castShadow = true;
  g.add(m);
  return g;
}

function waypointStone() {
  const g = new THREE.Group();
  const base = outlined(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 8), toon('#a7a2b4'), { outline: '#4e4760', width: 0.03 });
  base.position.y = 0.17;
  g.add(base);
  const stone = new THREE.CylinderGeometry(0.28, 0.42, 2.2, 6);
  stone.translate(0, 1.4, 0);
  const obelisk = outlined(stone, toon('#bdb6cc'), { outline: '#4e4760', width: 0.03 });
  g.add(obelisk);
  const crystalMat = new THREE.MeshToonMaterial({ color: new THREE.Color('#9fb4c8'), gradientMap: toon('#ffffff').gradientMap, emissive: new THREE.Color('#223344'), emissiveIntensity: 1 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
  crystal.scale.set(0.8, 1.4, 0.8);
  crystal.position.y = 2.95;
  crystal.castShadow = true;
  g.add(crystal);
  g.userData.crystal = crystal;
  return g;
}

function createTown(world, rng) {
  const g = new THREE.Group();
  const gy = (x, z) => world.groundY(x, z);
  const roofCols = ['#b8543f', '#4f6fa8', '#8f5a3c', '#5e8a4a'];
  for (const bx of world.boxes) {
    if (bx.type === 'house') g.add(house(bx, rng.pick(roofCols), gy(bx.x, bx.z)));
    if (bx.type === 'stall') g.add(stall(bx, rng.pick(['#d8483a', '#3b6ad0', '#e0a030']), gy(bx.x, bx.z)));
  }
  const t = world.data.town;
  // workbench: table + anvil + tools
  const wb = new THREE.Group();
  wb.position.set(t.workbench[0], gy(t.workbench[0], t.workbench[1]), t.workbench[1] - 1.6);
  const top = outlined(new THREE.BoxGeometry(2.6, 0.2, 1.2), toon('#a8744a'), { outline: '#3b2618', width: 0.02 });
  top.position.y = 0.95;
  wb.add(top);
  for (const [lx, lz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) {
    const leg = outlined(new THREE.BoxGeometry(0.16, 0.9, 0.16), toon('#7a5236'), { outline: '#3b2618', width: 0.02 });
    leg.position.set(lx, 0.45, lz);
    wb.add(leg);
  }
  const anvil = outlined(new THREE.BoxGeometry(0.7, 0.35, 0.35), toon('#6d7078'), { outline: '#26272c', width: 0.02 });
  anvil.position.set(-0.6, 1.22, 0);
  wb.add(anvil);
  const sign = outlined(new THREE.BoxGeometry(1.2, 0.7, 0.08), toon('#e9d9b0'), { outline: '#3b2618', width: 0.02 });
  sign.position.set(0, 1.9, -0.55);
  wb.add(sign);
  const hammer = outlined(new THREE.BoxGeometry(0.5, 0.12, 0.12), toon('#c9ccd4'), { outline: '#26272c', width: 0.015 });
  hammer.position.set(0.3, 1.12, 0.1);
  hammer.rotation.y = 0.6;
  wb.add(hammer);
  g.add(wb);
  // notice board by the trainer
  const by = gy(t.trainer[0], t.trainer[1]);
  const board = outlined(new THREE.BoxGeometry(1.8, 1.2, 0.12), toon('#a8744a'), { outline: '#3b2618', width: 0.02 });
  board.position.set(t.trainer[0] - 1.8, by + 1.5, t.trainer[1] + 0.5);
  g.add(board);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), toon('#f4ecd6'));
  paper.position.set(t.trainer[0] - 1.8, by + 1.5, t.trainer[1] + 0.57);
  g.add(paper);
  // well
  const [wx, wz] = t.well;
  const wy = gy(wx, wz);
  const well = outlined(new THREE.CylinderGeometry(1.1, 1.2, 0.8, 12, 1, true), toon('#b8b2a8', { side: THREE.DoubleSide }), { outline: '#4b4640', width: 0.03 });
  well.position.set(wx, wy + 0.4, wz);
  g.add(well);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12), toon('#4f9fd0'));
  water.rotation.x = -Math.PI / 2;
  water.position.set(wx, wy + 0.55, wz);
  g.add(water);
  for (const s of [-1, 1]) {
    const post = outlined(new THREE.BoxGeometry(0.15, 1.9, 0.15), toon('#7a5236'), { outline: '#3b2618', width: 0.02 });
    post.position.set(wx + s * 1.05, wy + 0.95, wz);
    g.add(post);
  }
  const roof = outlined(new THREE.ConeGeometry(1.5, 0.8, 4), toon('#8f5a3c'), { outline: '#3b2618', width: 0.02 });
  roof.position.set(wx, wy + 2.2, wz);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  return g;
}

function stall(bx, color, y) {
  const g = new THREE.Group();
  g.position.set(bx.x, y, bx.z);
  g.rotation.y = bx.angle;
  const table = outlined(new THREE.BoxGeometry(bx.hx * 2, 0.15, bx.hz * 2 - 0.3), toon('#a8744a'), { outline: '#3b2618', width: 0.02 });
  table.position.y = 0.95;
  g.add(table);
  const front = outlined(new THREE.BoxGeometry(bx.hx * 2, 0.9, 0.1), toon('#8a5c3a'), { outline: '#3b2618', width: 0.02 });
  front.position.set(0, 0.45, bx.hz - 0.2);
  g.add(front);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const post = outlined(new THREE.BoxGeometry(0.12, 2.4, 0.12), toon('#7a5236'), { outline: '#3b2618', width: 0.02 });
      post.position.set(sx * (bx.hx - 0.1), 1.2, sz * (bx.hz - 0.15));
      g.add(post);
    }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(bx.hx * 2 + 0.4, 0.08, bx.hz * 2 + 0.3), toon(color));
  awning.position.set(0, 2.45, 0.1);
  awning.rotation.x = 0.18;
  awning.castShadow = true;
  g.add(awning);
  const goods = ['#e0b040', '#d8483a', '#6fb444', '#8fc3e0'];
  for (let i = 0; i < 4; i++) {
    const item = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(goods[i]));
    item.position.set(-bx.hx + 0.45 + i * ((bx.hx * 2 - 0.9) / 3), 1.12, 0);
    g.add(item);
  }
  return g;
}

function createCamp(world) {
  const g = new THREE.Group();
  for (const bx of world.boxes) {
    if (bx.type !== 'tent') continue;
    const y = world.groundY(bx.x, bx.z);
    const shape = new THREE.Shape();
    shape.moveTo(-bx.hx, 0);
    shape.lineTo(0, 2.2);
    shape.lineTo(bx.hx, 0);
    shape.lineTo(-bx.hx, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: bx.hz * 2, bevelEnabled: false });
    geo.translate(0, 0, -bx.hz);
    const tent = outlined(geo, toon('#d9c7a0'), { outline: '#5a4a30', width: 0.03 });
    tent.position.set(bx.x, y, bx.z);
    tent.rotation.y = bx.angle;
    g.add(tent);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), toon('#5a4a30', { side: THREE.DoubleSide }));
    flap.position.set(0, 0.7, bx.hz + 0.01);
    tent.add(flap);
  }
  const [fx, fz] = world.data.camp.fire;
  const fy = world.groundY(fx, fz);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), toon('#8a8c93'));
    s.position.set(fx + Math.sin(a) * 0.6, fy + 0.1, fz + Math.cos(a) * 0.6);
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), toon('#6b4630'));
    log.rotation.set(Math.PI / 2 - 0.3, (i / 3) * Math.PI * 2, 0);
    log.position.set(fx, fy + 0.2, fz);
    g.add(log);
  }
  return g;
}

function house(bx, roofCol, y) {
  const g = new THREE.Group();
  g.position.set(bx.x, y, bx.z);
  g.rotation.y = bx.angle;
  const w = bx.hx * 2 - 0.4;
  const d = bx.hz * 2 - 0.4;
  const walls = outlined(new THREE.BoxGeometry(w, 3.2, d), toon('#efe2c6'), { outline: '#6b5a44', width: 0.03 });
  walls.position.y = 1.2;
  g.add(walls);
  const stoneBase = outlined(new THREE.BoxGeometry(w + 0.2, 0.6, d + 0.2), toon('#a7a09a'), { outline: '#4b4640', width: 0.02 });
  stoneBase.position.y = -0.1;
  g.add(stoneBase);
  const beam = toon('#7a5236');
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const b = outlined(new THREE.BoxGeometry(0.25, 2.9, 0.25), beam, { outline: '#3b2618', width: 0.02 });
      b.position.set((sx * w) / 2, 1.45, (sz * d) / 2);
      g.add(b);
    }
  const band = outlined(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), beam, { outline: '#3b2618', width: 0.02 });
  band.position.y = 2.75;
  g.add(band);
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.6, 0);
  shape.lineTo(0, 1.9);
  shape.lineTo(d / 2 + 0.6, 0);
  shape.lineTo(-d / 2 - 0.6, 0);
  const prism = new THREE.ExtrudeGeometry(shape, { depth: w + 0.7, bevelEnabled: false });
  prism.translate(0, 0, -(w + 0.7) / 2);
  prism.rotateY(Math.PI / 2);
  const roof = outlined(prism, toon(roofCol), { outline: darker(roofCol, 0.4), width: 0.03 });
  roof.position.y = 2.85;
  g.add(roof);
  const door = outlined(new THREE.BoxGeometry(0.9, 1.6, 0.1), toon('#6b4a30'), { outline: '#2e1f14', width: 0.02 });
  door.position.set(0, 0.8, d / 2 + 0.03);
  g.add(door);
  for (const sx of [-1, 1]) {
    const win = outlined(new THREE.BoxGeometry(0.7, 0.6, 0.08), toon('#8fc3e0', { emissive: '#ffe6a0', emissiveIntensity: 0.15 }), { outline: '#3b2618', width: 0.02 });
    win.position.set(sx * w * 0.3, 1.8, d / 2 + 0.03);
    g.add(win);
  }
  const chimney = outlined(new THREE.BoxGeometry(0.5, 1.2, 0.5), toon('#9a8f86'), { outline: '#3f3a36', width: 0.02 });
  chimney.position.set(w * 0.25, 4.1, -d * 0.15);
  g.add(chimney);
  g.userData.chimney = new THREE.Vector3(bx.x, y + 4.8, bx.z);
  return g;
}
