// Trees, rocks, town, ruins, camp, bridges and small decoration, drawn from the shared layout
// and standing on the terrain. Repeated props use chunked InstancedMesh (frustum culling per
// chunk) so the demo stays light on iPad. Grass, flowers, reeds, ferns and canopies sway.
import * as THREE from 'three';
import art from '../../data/art.json' with {type:'json'};
import { outlineStructure } from './architecture.js';
import { toon, outlined, darker } from './toon.js';
import { patchMaterial, hullMaterial } from './patch.js';
import { createRng } from '../core/rng.js';
import {leafTexture,needleTexture,palmFrondTexture} from './leafpaint.js';
import { paintSurface } from './surfaceart.js';
import {leafCrown,pineBough,branchTrunk,meadowGrass,wildflowers,facetedStone,beachShell,palmTrunk,palmFrond} from './nature.js';
import { inArtStudy, cloudCrownSteps, studyLeafTexture, lowShrubSteps, studyShrubTexture } from './art-study.js';
import { attachGrassSurfaceSteps, grassMaterial } from './grass.js';
import { meadowPlantSteps } from './meadow.js';
import { walkSurfaceMaterial } from './walk-surface.js';
import { animeStudy, animeConfig, animeFoliageMaterial, artReviewLayout, animeTrunk, animeTrunkMaterial, shrubStems } from './anime-study.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHarborSteps } from './harbor.js';
import { marketBuilding, marketStall, marketQuay } from './market.js';
import { districtBuilding } from './districts.js';
import { landmarkSteps } from './landmarks.js';

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

function* instancedSteps(geo, material, list, { shadow = true, receiveShadow = true, outline = null, outlineWidth = 0.03, wind = 0, windBase = 0, see = false, setup = null, setupSteps = null, adopt = null } = {}) {
  const group = new THREE.Group();
  adopt?.(group);
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
    group.add(mesh); // adopt before the first yield, including partial surface attributes
    for(let i=0;i<items.length;i++) {
      const it=items[i];
      tmpE.set(it.rx || 0, it.ry || 0, it.rz || 0);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(it.x, it.y || 0, it.z);
      const s = it.s ?? 1;
      tmpS.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      if (colors) mesh.setColorAt(i, tmpC.set(it.color ?? '#ffffff'));
      if((i+1)%128===0)yield;
    }
    if(setup)setup(mesh,items);
    if(setupSteps)yield* setupSteps(mesh,items);
    mesh.castShadow = shadow;
    mesh.receiveShadow = receiveShadow;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (hull) {
      const h = new THREE.InstancedMesh(geo, hull, items.length);
      h.instanceMatrix.copy(mesh.instanceMatrix);
      h.instanceMatrix.needsUpdate = true;
      h.computeBoundingSphere();
      group.add(h);
    }
    yield;
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

/** Build the whole scenery now. */
export function createEnvironment(world) {
  const steps = environmentSteps(world);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The scenery in sections; yields between them so a neighbouring map can stream in. */
export function* environmentSteps(world, {adopt,groundHeight} = {}) {
  const root = new THREE.Group();adopt?.(root);
  function* buildInstances(geo,material,list,options={}){
    return yield* instancedSteps(geo,material,list,{...options,adopt:group=>root.add(group)});
  }
  function* mapItems(items,project){
    const list=[];
    for(let i=0;i<items.length;i++){list.push(project(items[i]));if((i+1)%16===0)yield;}
    return list;
  }
  let visited=0;
  const rng = createRng(99);
  const gy = groundHeight || ((x, z) => world.groundY(x, z));
  const sy = (x, z) => world.surfaceY(x, z);
  const zid = (x, z) => world.zoneAt(x, z).id;

  // ----- trees -----
  const trunks = [],animeTrunks=[];
  const birchTrunks = [];
  const canopy = [];
  const birchLeaves = [];
  const pineTiers = [];
  const pineTrunks = [];
  const willowLeaves = [];
  const greens = ['#f8f1d4', '#e8eddd', '#f8f5dc', '#ecf1de'];
  const palmTrunks = [];
  const palmFronds = [];
  const palmShape = palmTrunk(), palmCoconuts = [], fallenCoconuts = [];
  for (const c of world.circles.filter((q) => q.type === 'palm')) {
    if(visited++%8===0)yield;
    const s = c.scale * 0.95;
    const y = gy(c.x, c.z) - 0.1;
    palmTrunks.push({ x: c.x, z: c.z, y, s, ry: c.rot });
    // crown sits where the curved trunk ends, turned by the same ry as the trunk
    const tx = c.x + Math.sin(c.rot) * palmShape.crown.z * s, tz = c.z + Math.cos(c.rot) * palmShape.crown.z * s;
    const ty = y + palmShape.crown.y * s;
    for (let i = 0, n = art.architecture.palm.fronds; i < n; i++) {
      const col = new THREE.Color(rng.pick(['#ffffff', '#f3f8e6', '#e8f0d6', '#fbf6e0']));
      palmFronds.push({ x: tx, z: tz, y: ty, s: s * rng.range(0.88, 1.12), ry: c.rot + (i / art.architecture.palm.fronds) * Math.PI * 2 + rng.range(-0.18, 0.18), color: `#${col.getHexString()}`, young: false });
    }
    for (let i = 0; i < 2; i++) palmFronds.push({ x: tx, z: tz, y: ty + .05, s: s * rng.range(.62, .75), ry: c.rot + i * 3.1 + .5, color: '#f4fbe8', young: true });
    for (let i = 0, n = rng.int(...art.architecture.palm.fallenCoconuts); i < n; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(.7, 2.8) * s, fx = tx + Math.sin(a) * r, fz = tz + Math.cos(a) * r;
      if (world.isWater(fx, fz, .3) || !world.isFree(fx, fz, .1)) continue;
      fallenCoconuts.push({ x: fx, z: fz, y: gy(fx, fz) + .1, s: s * rng.range(.85, 1.1), ry: rng.range(0, 6.28), rz: rng.range(-.5, .5), color: rng.pick(['#7c6a3a', '#6b5532', '#8a7a3f', '#5d6a34']) });
    }
    for (let i = 0; i < 4; i++) {
      const a = c.rot + i * 1.57 + rng.range(-.3, .3);
      palmCoconuts.push({ x: tx + Math.sin(a) * .26 * s, z: tz + Math.cos(a) * .26 * s, y: ty - .22 * s, s: s * rng.range(.9, 1.1), color: rng.pick(['#7c6a3a', '#8a7a3f', '#6f7a3a']) });
    }
  }
  const cloudTrees=[],cloudBirches=[];
  const trees = [...world.circles.filter((c) => ['tree', 'birch', 'pine', 'willow'].includes(c.type)), ...world.decor.edgeTrees];
  // Render-only preview specimens beside an existing cottage. These additions never
  // enter world collision/save data; they are for owner art review, not release layout.
  if(artReviewLayout){const [x,z,scale]=animeConfig.sample.tree;trees.push({x,z,scale,rot:.35,type:'tree'});}
  for (const c of trees) {
    if(visited++%8===0)yield;
    const s = c.scale * 0.85;
    const y = gy(c.x, c.z) - 0.2;
    const zone = zid(Math.max(world.bounds.minX, Math.min(world.bounds.maxX - 0.1, c.x)), Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ - 0.1, c.z)));
    const hueShift = zone === 'forest' || zone === 'wolf_den' ? -0.05 : zone === 'highlands' ? 0.03 : zone === 'ruins' ? 0.04 : 0;
    const newTrunk=animeStudy&&inArtStudy(c.x,c.z)&&c.type!=='pine';
    if(newTrunk)animeTrunks.push({x:c.x,z:c.z,y,sx:s*(c.type==='birch'?.6:1),sy:s*(c.type==='birch'?1.086:1),sz:s*(c.type==='birch'?.622:1),ry:c.rot});
    if(inArtStudy(c.x,c.z)&&c.type!=='pine') {
      const birch=c.type==='birch';
      (birch?cloudBirches:cloudTrees).push({x:c.x,z:c.z,y:y+(birch?3.8:3.5)*s,sx:s*(birch?1.5:2.5),sy:s*(birch?1.85:1.7),sz:s*(birch?1.4:2.25),ry:c.rot,color:birch?'#f2f3d8':'#edf1e2'});
    }
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
      if(!newTrunk)birchTrunks.push({ x: c.x, z: c.z, y, s: 1, sx: s * 0.8, sy: s * 1.15, sz: s * 0.8, ry: c.rot });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + c.rot;
        const r = i === 0 ? 0 : 0.7 * s;
        const col = new THREE.Color(rng.pick(['#fff4c7', '#f6f5cf', '#eff4cc']));
        birchLeaves.push({ study:inArtStudy(c.x,c.z), x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r, y: y + (i === 0 ? 4.2 : 3.5) * s, s: (i === 0 ? 1.15 : 0.95) * s, sy: 1.0 * s, ry: rng.range(0, 6), color: `#${col.getHexString()}` });
      }
      continue;
    }
    if(!newTrunk)trunks.push({ x: c.x, z: c.z, y, s: 1, sx: s, sy: s * (c.type === 'willow' ? 1.1 : 1), sz: s, ry: c.rot });
    const blobs = c.type === 'willow' ? 3 : 4 + (rng.next() < 0.5 ? 1 : 0);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + c.rot;
      const r = i === 0 ? 0 : 0.95 * s;
      const col = new THREE.Color(c.type === 'willow' ? rng.pick(['#cde4ce', '#d4e7cf']) : rng.pick(greens));
      col.offsetHSL(hueShift * 0.3, 0, hueShift);
      canopy.push({
        study:inArtStudy(c.x,c.z),
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
  root.add(yield* buildInstances(trunkGeo, paintSurface(mat('#85613f', {vertexColors:true}), 'bark'), trunks, { outline: '#564132', outlineWidth: 0.027 }));
  const birchGeo = new THREE.CylinderGeometry(0.13, 0.2, 3.6, 7);
  birchGeo.translate(0, 1.8, 0);
  root.add(yield* buildInstances(birchGeo, mat('#ece8dc'), birchTrunks, { outline: '#4a4640', outlineWidth: 0.04 }));
  const pineTrunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6);
  pineTrunkGeo.translate(0, 0.8, 0);
  root.add(yield* buildInstances(pineTrunkGeo, mat('#6b4630'), pineTrunks, { outline: '#2e1f14', outlineWidth: 0.04 }));
  // Only the town/meadow study changes canopy geometry; other biomes remain a comparison.
  const cloudMat=animeStudy?animeFoliageMaterial():mat('#ffffff',{vertexColors:true,double:true,wind:.025,windBase:1.2,see:true});
  cloudMat.map=studyLeafTexture();cloudMat.alphaTest=.4;cloudMat.forceSinglePass=true;
  const cloudGroup=yield* buildInstances(yield* cloudCrownSteps(3),cloudMat,cloudTrees,{receiveShadow:true});
  cloudGroup.name='art-study-crowns';root.add(cloudGroup);
  root.add(yield* buildInstances(yield* cloudCrownSteps(7),cloudMat,cloudBirches,{receiveShadow:true}));
  // Jagged patches supply the entire crown; no spherical filler underneath.
  if(animeStudy)root.add(yield* buildInstances(animeTrunk(),animeTrunkMaterial(),animeTrunks,{outline:animeConfig.palette.trunkLine,outlineWidth:animeConfig.trunk.outlineWidth,see:true}));
  const canopyGeo = leafCrown(3);
  const canopyMat = mat('#ffffff', { double:true, wind: 0.025, windBase: 1.2, see: true });
  canopyMat.map=leafTexture();canopyMat.alphaTest=.45;canopyMat.forceSinglePass=true;
  root.add(yield* buildInstances(canopyGeo, canopyMat, canopy.filter(it=>!it.study).map(it=>({...it,ry:0})), { wind: 0.025, windBase: 1.2, see: true }));
  root.add(yield* buildInstances(leafCrown(5), canopyMat, birchLeaves.filter(it=>!it.study).map(it=>({...it,ry:0})), { wind: 0.025, windBase: 1.2, see: true }));
  const tierGeo = pineBough();
  const pineMat=mat('#ffffff',{double:true,wind:.02,see:true});pineMat.map=needleTexture();pineMat.alphaTest=.45;pineMat.forceSinglePass=true;
  root.add(yield* buildInstances(tierGeo,pineMat,pineTiers.map(it=>({...it,ry:0})),{wind:.02,see:true}));
  const willowGeo = leafCrown(23);
  const willowMat=mat('#ffffff',{double:true,wind:.045,windBase:1.2,see:true});willowMat.map=leafTexture();willowMat.alphaTest=.45;willowMat.forceSinglePass=true;
  root.add(yield* buildInstances(willowGeo,willowMat,willowLeaves.map(it=>({...it,ry:0})),{shadow:true}));
  // palms: a curved, ringed trunk, arching leaflet fronds with young ones standing up, coconuts
  root.add(yield* buildInstances(palmShape.geometry, mat('#ffffff', { vertexColors: true }), palmTrunks, { outline: '#4f3d2e', outlineWidth: 0.024 }));
  // painted leaflet cards, alpha-tested like the willow and pine foliage; no outline hull
  const frondMat = mat('#ffffff', { double: true, wind: 0.05, windBase: 0 });
  frondMat.map = palmFrondTexture(); frondMat.alphaTest = 0.45; frondMat.forceSinglePass = true;
  const P = art.architecture.palm;
  root.add(yield* buildInstances(palmFrond(P.frondLength, P.frondLift, P.frondDroop, P.frondWidth), frondMat, palmFronds.filter((f) => !f.young), { wind: 0.05 }));
  root.add(yield* buildInstances(palmFrond(P.frondLength * .7, 1.4, .45, P.frondWidth * .7), frondMat, palmFronds.filter((f) => f.young), { wind: 0.05 }));
  // fallen coconuts scattered on the sand under each crown
  root.add(yield* buildInstances(new THREE.SphereGeometry(.17, 9, 7).scale(1, .86, 1.12), mat('#ffffff'), fallenCoconuts, { outline: '#3d3524', outlineWidth: 0.01 }));
  root.add(yield* buildInstances(new THREE.SphereGeometry(.17, 8, 6), mat('#ffffff'), palmCoconuts, { outline: '#3d3524', outlineWidth: 0.012 }));

  yield;
  // ----- rocks, boulders, crystals, stumps, logs -----
  const rocks = [];
  const crystals = [];
  const stumps = [];
  const logs = [];
  for (const c of world.circles) {
    if(!['rock','boulder','crystal','stump'].includes(c.type))continue;
    if(visited++%16===0)yield;
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
  if(artReviewLayout)for(const [x,z,s] of animeConfig.sample.rocks)rocks.push({x,z,y:gy(x,z)+s*.36,s,sy:s*.75,ry:s*2,color:animeConfig.palette.rock});
  for (const l of world.decor.logsDecor) logs.push({ x: l.x, z: l.z, y: gy(l.x, l.z) + 0.3, sx: 0.8, sy: 0.8, sz: 1.6, ry: l.angle });
  const shoreRocks=yield* buildInstances(facetedStone(), paintSurface(mat('#ffffff'),'rock'), rocks.filter(it=>!inArtStudy(it.x,it.z)), { outline: '#676568', outlineWidth: 0.019 });
  shoreRocks.userData.waterContact=true;root.add(shoreRocks);
  root.add(yield* buildInstances(facetedStone(),paintSurface(mat('#ffffff'),'studyRock'),rocks.filter(it=>inArtStudy(it.x,it.z)),{outline:'#676568',outlineWidth:.015}));
  const crystalGeo = new THREE.OctahedronGeometry(0.45, 0);
  crystalGeo.scale(0.55, 1.9, 0.55);
  crystalGeo.translate(0, 0.75, 0);
  root.add(yield* buildInstances(crystalGeo, mat('#ffffff', { emissive: '#3a6f9a', emissiveIntensity: 0.9 }), crystals, { outline: '#2a3f6a', outlineWidth: 0.03 }));
  const stumpGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.6, 9);
  stumpGeo.translate(0, 0.25, 0);
  root.add(yield* buildInstances(stumpGeo, mat('#7a5236'), stumps, { outline: '#3b2618', outlineWidth: 0.04 }));
  const logGeo = new THREE.CylinderGeometry(0.34, 0.38, 1, 9);
  logGeo.rotateX(Math.PI / 2);
  root.add(yield* buildInstances(logGeo, mat('#7f5638'), logs, { outline: '#3b2618', outlineWidth: 0.04 }));

  yield;
  // ----- ruins -----
  const pillars = [];
  const broken = [];
  const blocks = [];
  const statues = [];
  const walls = [];
  const archPillars = [];
  for (const c of world.circles) {
    if(!['pillar','pillar_broken','ruin_block','statue','arch_pillar'].includes(c.type))continue;
    if(visited++%16===0)yield;
    const y = gy(c.x, c.z);
    if (c.type === 'pillar') pillars.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot });
    if (c.type === 'pillar_broken') broken.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot, rz: 0.08 });
    if (c.type === 'ruin_block') blocks.push({ x: c.x, z: c.z, y: y + c.scale * 0.4, s: c.scale, sy: c.scale * 0.8, ry: c.rot, rz: rng.range(-0.15, 0.15) });
    if (c.type === 'statue') statues.push({ x: c.x, z: c.z, y, s: c.scale, ry: c.rot });
    if (c.type === 'arch_pillar') archPillars.push({ x: c.x, z: c.z, y: y - 0.1, s: 1, ry: c.rot });
  }
  for (const bx of world.boxes) if (bx.type === 'ruin_wall') walls.push({ x: bx.x, z: bx.z, y: gy(bx.x, bx.z) - 0.2, sx: 0.9, sy: bx.height + 0.2, sz: bx.hz * 2, ry: bx.angle });
  const ruinMat = paintSurface(mat('#c4c0c6'),'masonry');
  root.add(yield* buildInstances(pillarGeometry(4.6), ruinMat, pillars, { outline: '#4e4760', outlineWidth: 0.04 }));
  root.add(yield* buildInstances(pillarGeometry(2.1, true), ruinMat, broken, { outline: '#4e4760', outlineWidth: 0.04 }));
  root.add(yield* buildInstances(new THREE.BoxGeometry(1.6, 1.1, 1.3), paintSurface(mat('#b9b2c6'),'masonry'), blocks, { outline: '#4e4760', outlineWidth: 0.04 }));
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  wallGeo.translate(0, 0.5, 0);
  root.add(yield* buildInstances(wallGeo, paintSurface(mat('#bdb5ca'),'masonry'), walls, { outline: '#4e4760', outlineWidth: 0.03 }));
  root.add(yield* buildInstances(statueGeometry(), mat('#b7b0c6'), statues, { outline: '#4e4760', outlineWidth: 0.035 }));
  root.add(yield* buildInstances(pillarGeometry(4.2), ruinMat, archPillars, { outline: '#4e4760', outlineWidth: 0.04 }));
  for (const a of world.decor.arches) {
    const lintel = outlined(new THREE.BoxGeometry(a.span * 2 + 1.6, 0.7, 1.3), ruinMat, { outline: '#4e4760', width: 0.04 });
    lintel.position.set(a.x, gy(a.x, a.z) + 4.35, a.z);
    lintel.rotation.y = a.angle + Math.PI / 2;
    root.add(lintel);
  }
  const ruinsData = world.data.ruins;
  if (ruinsData && ruinsData.altar !== false) {
    const [rx, rz] = ruinsData.centre;
    const altar = outlined(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 8), toon('#a79fbd'), { outline: '#4e4760', width: 0.04 });
    altar.position.set(rx + 6, gy(rx + 6, rz - 6) + 0.25, rz - 6);
    root.add(altar);
  }

  yield;
  // ----- bridges, town, camp -----
  for (const br of world.bridges){root.add(createBridge(world, br));yield;}
  yield* townSteps(world,rng,{adopt:group=>root.add(group)});
  if (world.data.harbor)yield* createHarborSteps(world,{adopt:group=>root.add(group)});
  if (world.data.camp) root.add(createCamp(world));

  yield;
  // ----- zone landmarks (data: landmarks) -----
  yield* landmarkSteps(world,gy,{adopt:group=>root.add(group)});

  yield;
  // ----- small decoration -----
  const d = world.decor;
  // Grouped plant patches: short curved leaves and readable flowers, leaving paths clear.
  const detailRng=createRng(842);
  // Low relief shells have distinct fan/spiral silhouettes and raised ribs. Chunked like plants.
  for (const kind of ['fan', 'spiral']) {
    const shells = (d.shells || []).filter(s => s.kind === kind).map(s => ({ x:s.x, z:s.z, y:gy(s.x,s.z)+.025, s:s.s, ry:s.rot, color:kind==='fan'?'#f2decd':'#dfc5a9' }));
    const shoreProps = yield* buildInstances(beachShell(kind), mat('#ffffff',{vertexColors:true,double:true}), shells, {shadow:false});
    shoreProps.name = `beach-shell-${kind}`;
    root.add(shoreProps);
  }
  const grassPatches=[];
  if(artReviewLayout) {
    // Quiet centre, denser planting around specimens and at the cottage edge.
    const patches=[...animeConfig.sample.bushes,...animeConfig.sample.rocks,[-190.5,19,1.2],[-196.8,24.1,.8]];
    for(const [px,pz,s] of patches)for(let i=0;i<14;i++) {
      const a=i*2.39996,r=detailRng.range(.6,1.9)*s;
      grassPatches.push({x:px+Math.cos(a)*r,z:pz+Math.sin(a)*r,s:detailRng.range(.55,.95)});
    }
  }
  const {grass,flowers}=yield* meadowPlantSteps(world,grassPatches);
  yield;
  // Built a strip of chunks at a time: each chunk mesh is the same as one big call.
  const bladeGeo=meadowGrass(),bladeMat=grassMaterial(world),strips=new Map();
  for(const it of grass){const k=Math.floor(it.x/(CHUNK*2));if(!strips.has(k))strips.set(k,[]);strips.get(k).push(it);}
  for(const strip of [...strips.keys()].sort((a,b)=>a-b)){
    yield* instancedSteps(bladeGeo,bladeMat,strips.get(strip),{shadow:false,adopt:group=>root.add(group),setupSteps:(mesh,items)=>attachGrassSurfaceSteps(mesh,items,world)});
    yield;
  }
  yield;
  root.add(yield* buildInstances(wildflowers(),patchMaterial(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}),{wind:.12}),flowers,{shadow:false}));
  const bushGeo=leafCrown(11);
  const bushes = [],studyBushes=[];
  const berries = [];
  const allBushes=artReviewLayout?[...d.bushes,...animeConfig.sample.bushes.map(([x,z,s])=>({x,z,s}))]:d.bushes;
  yield;
  for (const bsh of allBushes) {
    if(visited++%16===0)yield;
    const y = gy(bsh.x, bsh.z);
    if(inArtStudy(bsh.x,bsh.z))studyBushes.push({x:bsh.x,z:bsh.z,y:y-.015,sx:1.25*bsh.s,sy:1.05*bsh.s,sz:1.1*bsh.s,ry:bsh.x*.27+bsh.z*.13});
    bushes.push({ x: bsh.x, z: bsh.z, y: y + 0.35 * bsh.s, s: 0.75 * bsh.s, sy: 0.55 * bsh.s, color: '#dfe8c9' });
    bushes.push({ x: bsh.x + 0.5 * bsh.s, z: bsh.z + 0.2, y: y + 0.28 * bsh.s, s: 0.55 * bsh.s, sy: 0.45 * bsh.s, color: '#ecedce' });
    if (bsh.berries) for (let k = 0; k < 5; k++) berries.push({ x: bsh.x + Math.sin(k * 1.3) * 0.5 * bsh.s, z: bsh.z + Math.cos(k * 1.3) * 0.45 * bsh.s, y: y + 0.45 * bsh.s + (k % 2) * 0.12, s: 0.09 });
  }
  const bushMat=mat('#ffffff',{double:true,wind:.03,windBase:.5});bushMat.map=leafTexture();bushMat.alphaTest=.45;bushMat.forceSinglePass=true;
  root.add(yield* buildInstances(bushGeo,bushMat,bushes.filter(it=>!inArtStudy(it.x,it.z)).map(it=>({...it,ry:0})),{shadow:true}));
  const studyBushMat=animeStudy?animeFoliageMaterial(true):mat('#ffffff',{vertexColors:true,double:true,wind:.025});
  studyBushMat.map=studyShrubTexture();studyBushMat.alphaTest=.4;studyBushMat.forceSinglePass=true;
  root.add(yield* buildInstances(yield* lowShrubSteps(),studyBushMat,studyBushes,{receiveShadow:true}));
  if(animeStudy){

    root.add(yield* buildInstances(shrubStems(),new THREE.MeshLambertMaterial({color:'#78654c'}),studyBushes,{shadow:false}));
  }
  root.add(yield* buildInstances(new THREE.SphereGeometry(1, 6, 4), mat('#d8334a'), berries, { shadow: false }));
  const reedGeo = new THREE.ConeGeometry(0.05, 1.2, 4);
  reedGeo.translate(0, 0.6, 0);
  const reeds = [];
  yield;
  for (const r of d.reeds) {
    if(visited++%16===0)yield;
    const y = sy(r.x, r.z) - 0.1;
    for (let k = 0; k < 3; k++) reeds.push({ x: r.x + Math.sin(k * 2.1) * 0.2, z: r.z + Math.cos(k * 2.1) * 0.2, y, s: r.s, rz: Math.sin(k + r.rot) * 0.15, color: k === 1 ? '#7a9b3c' : '#5f8a35' });
  }
  root.add(yield* buildInstances(reedGeo, mat('#ffffff', { wind: 0.16 }), reeds, { shadow: false }));
  const lilyGeo = new THREE.CircleGeometry(0.4, 10, 0.3, Math.PI * 1.8);
  lilyGeo.rotateX(-Math.PI / 2);
  root.add(yield* buildInstances(lilyGeo, toon('#5aa640'), d.lilies.map((l) => ({ x: l.x, z: l.z, y: world.waterLevel + 0.03, s: l.s, ry: l.rot })), { shadow: false }));
  const fernMat=patchMaterial(new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide}),{wind:.12});
  const fernCompile=fernMat.onBeforeCompile;
  fernMat.onBeforeCompile=(s,r)=>{fernCompile.call(fernMat,s,r);s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);');};
  fernMat.customProgramCacheKey=()=> 'ground-ferns-v1';
  root.add(yield* buildInstances(fernGeometry(),fernMat,yield* mapItems(d.ferns,(f)=>({x:f.x,z:f.z,y:gy(f.x,f.z)-.015,s:f.s,ry:f.rot})),{shadow:false}));
  const stems = [];
  const caps = [];
  yield;
  for (const m of d.mushrooms) {
    if(visited++%16===0)yield;
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
  root.add(yield* buildInstances(stemGeo, mat('#f0e6d0'), stems, { shadow: false }));
  const capGeo = new THREE.SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  root.add(yield* buildInstances(capGeo, mat('#ffffff'), caps, { shadow: false, outline: '#5a2a20', outlineWidth: 0.012 }));
  const pebbleGeo = blobGeometry(0, 13, 0.2);
  root.add(yield* buildInstances(pebbleGeo, mat('#b7b3ac'), yield* mapItems(d.pebbles,(p) => ({ x: p.x, z: p.z, y: gy(p.x, p.z), s: 0.1 * p.s, sy: 0.06 * p.s, ry: p.rot })), { shadow: false }));
  const boneGeo = new THREE.CapsuleGeometry(0.05, 0.45, 2, 6);
  boneGeo.rotateZ(Math.PI / 2);
  root.add(yield* buildInstances(boneGeo, mat('#efe8d8'), yield* mapItems(d.bones,(b2) => ({ x: b2.x, z: b2.z, y: gy(b2.x, b2.z) + 0.05, s: b2.s, ry: b2.rot })), { shadow: false }));
  const crates = d.crates.filter((c) => c.kind === 'crate');
  const barrels = d.crates.filter((c) => c.kind === 'barrel');
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  crateGeo.translate(0, 0.5, 0);
  root.add(yield* buildInstances(crateGeo, mat('#b7885a'), yield* mapItems(crates,(c) => ({ x: c.x, z: c.z, y: gy(c.x, c.z), s: c.s, ry: c.rot })), { outline: '#3b2618', outlineWidth: 0.03 }));
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 10);
  barrelGeo.translate(0, 0.5, 0);
  root.add(yield* buildInstances(barrelGeo, mat('#9a6a42'), yield* mapItems(barrels,(c) => ({ x: c.x, z: c.z, y: gy(c.x, c.z), s: c.s, ry: c.rot })), { outline: '#3b2618', outlineWidth: 0.03 }));

  yield;
  // fences, lanterns, banners
  const posts = [];
  const rails = [];
  for (const f of d.fences) {
    if(visited++%16===0)yield;
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
  root.add(yield* buildInstances(postGeo, mat('#8a5c3a'), posts, { outline: '#3b2618', outlineWidth: 0.03 }));
  root.add(yield* buildInstances(new THREE.BoxGeometry(0.1, 0.12, 1), mat('#9b6a44'), rails, { outline: '#3b2618', outlineWidth: 0.02 }));
  for (const l of d.lanterns) root.add(lantern(l.x, gy(l.x, l.z), l.z));
  for (const bn of d.banners) root.add(banner(bn.x, gy(bn.x, bn.z), bn.z, bn.color));

  yield;
  // waypoint stones (the view lights them up once discovered)
  const waypoints = new Map();
  for (const wp of world.waypoints) {
    const g = waypointStone();
    g.position.set(wp.x, gy(wp.x, wp.z), wp.z);
    root.add(g);
    waypoints.set(wp.id, g);
  }
  for (const exit of world.exits || []) root.add(exitGate(exit, world));
  // A border gate marks where a road crosses an open seam into the neighbouring map.
  // Both maps list the seam; the map whose seam edge is minX/minZ draws the one gate.
  for (const seam of world.seams || []) if (seam.gate && seam.edge.startsWith('min')) root.add(exitGate({ id: 'border-' + seam.to, x: seam.gate[0] - seam.outward * (seam.alongX ? 0 : 3), z: seam.gate[1] - seam.outward * (seam.alongX ? 3 : 0) }, world));
  return { root, waypoints };
}

// A timber road gate with a hanging sign marks the way to a linked map. It faces
// along the road it stands on; travel itself is the HUD prompt inside exit.r.
function exitGate(exit, world) {
  let best = Infinity, dir = 0, width = 6;
  for (const road of world.roads) {
    const pts = road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((exit.x - ax) * dx + (exit.z - az) * dz) / len));
      const d = Math.hypot(exit.x - ax - dx * t, exit.z - az - dz * t);
      if (d < best) { best = d; dir = Math.atan2(dx, dz); width = road.width; }
    }
  }
  const g = new THREE.Group(), wood = toon('#8a5c3a'), dark = toon('#6b4a30'), sign = toon('#d9b27c');
  const line = { outline: '#3b2618', width: 0.025 };
  g.position.set(exit.x, world.groundY(exit.x, exit.z), exit.z);
  g.rotation.y = dir;
  const span = width / 2 + 0.9;
  for (const side of [-1, 1]) {
    const post = outlined(new THREE.CylinderGeometry(0.2, 0.24, 4.2, 8), wood, line);
    post.position.set(side * span, 2.1, 0);
    const foot = outlined(new THREE.CylinderGeometry(0.38, 0.44, 0.35, 8), dark, line);
    foot.position.set(side * span, 0.17, 0);
    const cap = outlined(new THREE.ConeGeometry(0.3, 0.32, 8), dark, line);
    cap.position.set(side * span, 4.36, 0);
    g.add(post, foot, cap);
  }
  const beam = outlined(new THREE.BoxGeometry(span * 2 + 0.9, 0.3, 0.34), dark, line);
  beam.position.y = 3.85;
  const lintel = outlined(new THREE.BoxGeometry(span * 2 - 0.2, 0.18, 0.24), wood, line);
  lintel.position.y = 3.35;
  const board = outlined(new THREE.BoxGeometry(2.4, 0.78, 0.12), sign, line);
  board.position.set(0, 2.72, 0);
  const trim = outlined(new THREE.BoxGeometry(2.0, 0.08, 0.14), dark, line);
  trim.position.set(0, 2.6, 0);
  g.add(beam, lintel, board, trim);
  for (const side of [-1, 1]) {
    const rope = outlined(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 4), dark, line);
    rope.position.set(side * 0.95, 3.12, 0);
    g.add(rope);
  }
  for (const side of [-1, 1]) {
    const l = lantern(0, 0, 0);
    l.position.set(side * (span + 0.9), 0, 0.6);
    l.rotation.y = side < 0 ? Math.PI : 0;
    g.add(l);
  }
  g.name = 'exit-gate-' + exit.id;
  return g;
}


function fernGeometry() {
  const positions=[],colors=[],normals=[];
  const dark=new THREE.Color(animeConfig.palette.groundDark),light=new THREE.Color(animeConfig.palette.groundLight);
  const vertex=(p,t)=>{positions.push(...p);normals.push(0,1,0);const c=dark.clone().lerp(light,t);colors.push(c.r,c.g,c.b);};
  for(let frond=0;frond<6;frond++){
    const angle=frond*2.39996,dx=Math.sin(angle),dz=Math.cos(angle),px=dz,pz=-dx;
    const point=(t,side=0)=>[dx*t*.66+px*side,.025+Math.sin(t*Math.PI*.75)*.43,dz*t*.66+pz*side];
    for(let i=1;i<=7;i++){
      const t=i/8,width=Math.sin(t*Math.PI)*(.13-frond*.004);
      for(const side of [-1,1]){
        const root=point(t-.055),shoulder=point(t+.045,width*.45*side),tip=point(t+.014,width*side),back=point(t-.015,width*.46*side);
        vertex(root,.25);vertex(shoulder,.53);vertex(tip,.81);
        vertex(root,.25);vertex(tip,.81);vertex(back,.43);
      }
      const a=point(t-.12,-.006),b=point(t-.12,.006),c=point(t,.006),d=point(t,-.006);
      for(const p of [a,b,c,a,c,d])vertex(p,.39);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
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
  const n = Math.round((br.hx * 2) / 0.55);
  const floorY = world.waterLevel - 1.2;
  for (let i = 0; i < n; i++) {
    const x = -br.hx + 0.28 + i * 0.55;
    const y = world.deckY(br, x);
    const p = outlined(new THREE.BoxGeometry(0.5, 0.18, br.hz * 2), walkSurfaceMaterial('wood',i%2?1.07:1,[br.x+x,br.z],true), { outline: '#4a2e1a', width: 0.02 });
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
  return outlineStructure(g);
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
  return outlineStructure(g);
}

function* townSteps(world,rng,{adopt}={}) {
  const g = new THREE.Group();adopt?.(g);
  if (world.data.city?.enabled) return g;
  const gy = (x, z) => world.groundY(x, z);
  const roofCols = ['#b8543f', '#4f6fa8', '#8f5a3c', '#5e8a4a'];
  const t = world.data.town, slice=t.styleSlice;
  let stallIndex=0;
  for (const bx of world.boxes) {
    if (bx.kit) continue; // drawn by the town kit (town-kit.js)
    if (bx.type === 'house') {
      const y=gy(bx.x,bx.z);
      const model=slice?.buildingIds.includes(bx.id) ? marketBuilding(bx,y)
        : t.districtStyle?.buildingIds.includes(bx.id) ? districtBuilding(bx,y)
        : t.blockout ? blockoutBuilding(bx,y) : house(bx,bx.roofColor || rng.pick(roofCols),y);
      g.add(model);yield;
    }
    if (bx.type === 'stall') {
      const i=stallIndex++;
      g.add(slice ? marketStall(bx,bx.awningColor||slice.awningColors[i % slice.awningColors.length],gy(bx.x,bx.z),slice.stallGoods[i]==='fish')
        : stall(bx,rng.pick(['#d8483a','#3b6ad0','#e0a030']),gy(bx.x,bx.z)));
    }
    yield;
  }
  if(slice)g.add(marketQuay(world));
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
  g.add(wb);yield;
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
  for(const structure of g.children){outlineStructure(structure);yield;}
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

// Review boxes use the exact authored collider footprint. No full-town detail yet.
function blockoutBuilding(bx, y) {
  const g = new THREE.Group(); g.position.set(bx.x, y, bx.z); g.rotation.y = bx.angle;
  const height = bx.height || 3.6;
  const colors = { house: '#dbd8c7', shop: '#d5ba85', warehouse: '#bcaa94', shipyard: '#aca7b8' };
  const body = outlined(new THREE.BoxGeometry(bx.hx * 2, height, bx.hz * 2), toon(colors[bx.kind] || colors.house), { outline: '#64665b', width: .025 });
  body.position.y = height / 2; g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(bx.hx * 2, .16, bx.hz * 2), toon(bx.roofColor));
  cap.position.y = height + .08; g.add(cap);
  return g;
}

function house(bx, roofCol, y) {
  const g = new THREE.Group();
  g.position.set(bx.x, y, bx.z);
  g.rotation.y = bx.angle;
  const w = bx.hx * 2 - 0.4;
  const d = bx.hz * 2 - 0.4;
  const study=inArtStudy(bx.x,bx.z);
  const anime=animeStudy&&study;
  if(anime && !bx.roofColor)roofCol=bx.z>0?'#b67551':'#668e87';
  const finish=(color,kind)=>study?paintSurface(animeStudy?new THREE.MeshLambertMaterial({color:kind==='plaster'?animeConfig.palette.plaster:kind==='timber'?animeConfig.palette.wood:color}):mat(color),kind):toon(color);
  const walls = outlined(new THREE.BoxGeometry(w, 3.2, d), finish('#efe2c6','plaster'), { outline: '#6b5a44', width: 0.03 });
  walls.position.y = 1.2;
  g.add(walls);
  const stoneBase = outlined(new THREE.BoxGeometry(w + 0.2, 0.6, d + 0.2), finish('#a7a09a','masonry'), { outline: '#4b4640', width: 0.02 });
  stoneBase.position.y = -0.1;
  g.add(stoneBase);
  const beam = finish('#7a5236','timber');
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
  const roof = outlined(prism, finish(roofCol,'roof'), { outline: darker(roofCol, 0.4), width: 0.03 });
  roof.position.y = 2.85;
  g.add(roof);
  const door = outlined(new THREE.BoxGeometry(0.9, 1.6, 0.1), finish('#6b4a30','timber'), { outline: '#2e1f14', width: 0.02 });
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
  if(anime) {
    // Authored cottage trim and readable joinery, all inside the existing footprint.
    const timber=finish('#8b6851','timber'),cream=finish('#f1e3c5','plaster'),details=[];
    const box=(w,h,d,x,y,z,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);details.push(o);return o;};
    box(w+.35,.16,.24,0,.40,d/2+.05,timber);
    for(const sign of [-1,1]) {
      box(.14,2.6,.16,sign*w*.30,1.48,d/2+.09,timber);
      box(.95,.12,.25,sign*w*.30,1.40,d/2+.12,timber);
      // Window crosspieces and open shutters.
      box(.055,.61,.10,sign*w*.30,1.8,d/2+.12,timber);
      box(.71,.055,.10,sign*w*.30,1.8,d/2+.12,timber);
      for(const side of [-1,1]) {
        const shutter=box(.23,.69,.075,sign*w*.30+side*.49,1.8,d/2+.09,timber);shutter.rotation.y=side*.35;
        for(let slat=0;slat<4;slat++)box(.21,.022,.02,sign*w*.30+side*.49,1.56+slat*.15,d/2+.145,cream);
      }
    }
    // Steps, door frame, small warm lintel canopy, and iron door handle.
    const stone=finish('#b5b7b0','masonry');
    box(1.5,.15,.7,0,.05,d/2+.35,stone);box(1.25,.15,.4,0,.20,d/2+.20,stone);
    for(const sign of [-1,1])box(.12,1.8,.15,sign*.53,.94,d/2+.12,timber);
    box(1.25,.15,.2,0,1.85,d/2+.12,timber);
    for(let i=-2;i<=2;i++)box(.014,1.49,.01,i*.16,.82,d/2+.087,timber);
    box(.07,.07,.05,.28,.89,d/2+.12,new THREE.MeshLambertMaterial({color:'#c6b17a'}));
    const awning=box(1.65,.13,.70,0,2.12,d/2+.26,finish('#768f79','roof'));awning.rotation.x=.18;
    for(const sign of [-1,1]) {
      const brace=box(.09,.52,.09,sign*.64,1.83,d/2+.26,timber);brace.rotation.x=-.65;
    }
    // Raised roof ridge and gable trim replace the featureless wedge silhouette.
    box(w+.82,.17,.25,0,4.79,0,timber);
    for(const sign of [-1,1]) {
      box(w+.84,.15,.19,0,2.88,sign*(d/2+.57),timber);
      for(const end of [-1,1]) {
        const length=Math.hypot(d/2+.57,1.9);
        const beam=box(.15,.14,length,end*(w/2+.37),3.82,sign*(d/4+.28),timber);
        beam.rotation.x=sign*Math.atan2(1.9,d/2+.57);
      }
    }
    const batches=new Map();
    for(const o of details){o.updateMatrix();o.geometry.applyMatrix4(o.matrix);if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(o.geometry);}
    for(const [material,geos] of batches){const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);geos.forEach(geo=>geo.dispose());}
  }
  g.userData.chimney = new THREE.Vector3(bx.x, y + 4.8, bx.z);
  return g;
}
