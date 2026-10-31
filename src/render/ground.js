// Terrain mesh (from the shared heightfield) and stylised water.
// The terrain is split into tiles so off-screen parts are culled. Per-vertex attributes carry
// what the surface is (road, paving, mud, bare dirt) and the zone colours; the fragment shader
// paints soft cel patches, blade speckles, rocky cliff faces, drifting cloud shadows.
import { edgeCliffsAt } from '../core/edge-cliffs.js';
import {acceptedAt,acceptedScenes,sceneSample,sceneWeight} from '../core/accepted-scenes.js';
import {pondEdgeDistance,pondReach,pondRim} from '../core/ponds.js';
import * as THREE from 'three';
import {finishSteps} from './build-queue.js';
import {clipRegionGeometrySteps} from './region-ownership.js';
import {terrainDomain} from './terrain-domain.js';
import { toBoxLocal, pointInPolygon, distToPolyline } from '../core/math.js';
import { valueNoise } from '../core/terrain.js';
import {rasterPolylineSteps,boxBlurSteps} from './ground-work.js';
import { timeUniform } from './patch.js';
import { waterContactSteps, ownContactTexture } from './water-contact.js';
import { animeStudy, animeConfig, artReviewLayout } from './anime-study.js';
import { groundBrushUniform,groundBrushUniformSteps } from './ground-brush.js';
import { coveredTerrainCell } from './city-terrain.js';
import { cityFloorAt } from '../core/city.js';
import { outsideClearingWeight, outsideRoadVisible, sceneSurround, sceneClearingFade, paintZoneAt, seamBandAt } from '../core/ground-regions.js';
import art from '../../data/art.json' with {type:'json'};
import { regionShift } from './region-shift.js';

const TILE = 32;

import { NOISE_GLSL, GROUND_COLOR_GLSL } from './ground-color.js';
import { groundFieldSteps } from './ground-field.js';
export { NOISE_GLSL } from './ground-color.js';

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Per-grid-vertex surface data: splat (road, paving, mud, dirt) and blurred zone tints. */
const surfaceCache = new WeakMap();
export function surfaceData(world) {
  if(surfaceCache.has(world)) return surfaceCache.get(world);
  const steps = surfaceSteps(world);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Per-cell ground surfaces, yielding every few rows (open-world streaming). */
export function* surfaceSteps(world, {domain = terrainDomain(world)} = {}) {
  if(surfaceCache.has(world)) return surfaceCache.get(world);
  const hf = world.heightfield;
  const { w, h, ox, oz, res } = hf;
  const n = w * h;
  const wd = world.data;
  const road = new Float32Array(n);
  const mud = new Float32Array(n);
  const stone = new Float32Array(n);
  const dirt = new Float32Array(n);
  const bank = new Float32Array(n), grassBanks = new Set(world.data.acceptedScenes?.grassBanks || []);
  const coast = new Float32Array(n * 2);
  // Planned town ground (streets, courts, lawns) instead of wild-meadow noise; blurred for the shader.
  const planned = new Float32Array(n), townZones = new Set(art.ground.townZones || []);
  for (let k = 0; k < n; k++) {
    if(k&&k%1024===0)yield;
    const x = ox + (k % w) * res, z = oz + Math.floor(k / w) * res, b = world.bounds;
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && townZones.has(world.zoneAt(x, z).id)) planned[k] = 1;
  }
  const grid = { ox, oz, res, w, h };
  for (const r of world.roads) {
    if(!outsideRoadVisible(wd.city,r.id))continue;
    const half = r.width / 2;
    yield* rasterPolylineSteps(grid, r.points, half + 1.5, (k, d) => {
      const x=ox+(k%w)*res, z=oz+Math.floor(k/w)*res;
      const worn=((valueNoise(x*.22,z*.22,71)-.5)*.7+(valueNoise(x*.85,z*.85,72)-.5)*.22)*(1-planned[k]*.65);
      road[k] = Math.max(road[k], 1 - smooth(half - .6 + worn, half + 1.05 + worn, d));
    });
  }
  // Authored free paths join district thresholds to the existing road corridors.
  for(const building of wd.town.buildings) if(building.entryPath||wd.town.styleSlice?.buildingIds.includes(building.id)) {
    const half=building.entryPath?.length? .85:1.2;
    const points=building.entryPath||[[building.x,building.z+building.hz],[building.x,wd.town.centre[1]]];
    yield* rasterPolylineSteps(grid,points,half+1,(k,d)=>{
      const x=ox+(k%w)*res,z=oz+Math.floor(k/w)*res;
      const wear=(valueNoise(x*.4,z*.4,77)-.5)*.3;
      road[k]=Math.max(road[k],1-smooth(half-.35+wear,half+.7+wear,d));
    });
  }
  if(artReviewLayout)yield* rasterPolylineSteps(grid,animeConfig.sample.path,1.6,(k,d)=>{road[k]=Math.max(road[k],1-smooth(.65,1.5,d));});
  if (wd.river) {
    const half = wd.river.width / 2;
    yield* rasterPolylineSteps(grid, wd.river.points, half + 3, (k, d) => {
      mud[k] = Math.max(mud[k], 1 - smooth(half - 0.3, half + 2.4, d));
    });
  }
  const town = wd.town;
  const ruins = wd.ruins;
  const b = world.bounds;
  const surround = wd.acceptedScenes?.enabled ? wd.acceptedScenes.surround : null;
  for (let j = 0; j < h; j++) {
    if (j && j % 4 === 0) yield;
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const k = j * w + i;
      for (const pond of wd.ponds) {
        const reach = pondReach(pond) + 3;
        if (Math.abs(x - pond[0]) > reach || Math.abs(z - pond[1]) > reach) continue;
        const e = pondEdgeDistance(pond, x, z);
        if (e < 3) mud[k] = Math.max(mud[k], 1 - smooth(-0.3, 2.2, e));
      }
      if (wd.sea) {
        // sandy beach along the sea
        const c = domain.coastAt(x, z), d = c.distance;
        const beach = c.beach;
        // 1 on open sand, easing through a sandy-soil back-beach band to 0 at the meadow
        coast[k * 2] = c.kind === 'beach' ? 1 - smooth(beach - 1, beach + (art.ground.backBeach ?? 3.5), d) : 0;
        // ground raised well above the sea (a headland or terrace top) is not beach
        if (art.ground.beachTop) coast[k * 2] *= 1 - smooth(art.ground.beachTop[0], art.ground.beachTop[1], hf.data[k]);
        // Remove only the obsolete coarse cobble paint beside the source cape;
        // its heightfield, cliffs, shoreline and existing dirt paths remain.
        const cape=wd.city?.capeTransition?.bounds;
        const capeJoin=cape&&x>=cape[0]&&x<=cape[1]&&z>=cape[2]&&z<=cape[3];
        if(!capeJoin&&['quay','shipyard','breakwater'].includes(c.kind) && d >= 0 && d < 5.5) {
          const wear=(valueNoise(x*.28,z*.28,74)-.5)*1.1;
          stone[k]=Math.max(stone[k],1-smooth(2.3+wear,4.8+wear,d));
        }
        coast[k * 2 + 1] = -d;
      }
      const td = Math.hypot(x - town.centre[0], z - town.centre[1]);
      const plazaWear=(valueNoise(x*.17,z*.17,75)-.5)*2;
      if (!town.surfaces?.length && td < town.plazaRadius + 3) stone[k] = Math.max(stone[k], 1 - smooth(town.plazaRadius - 1.2 + plazaWear, town.plazaRadius + 1.4 + plazaWear, td));
      if(!town.surfaces?.length && town.styleSlice && z > -47 && z < -18 && Math.abs(x) < 46) {
        const c=world.coastAt(x,z), wear=(valueNoise(x*.18,z*.18,76)-.5)*1.6;
        const side=1-smooth(33+wear,44+wear,Math.abs(x));
        const back=smooth(-45+wear,-40+wear,z);
        const edge=smooth(-.3,.5,c.distance);
        stone[k]=Math.max(stone[k],side*back*edge);
      }
      for (const surface of town.surfaces || []) {
        const points=surface.points, edge=distToPolyline(x,z,points);
        const distance=pointInPolygon(points,x,z)?edge:-edge;
        const wear=(valueNoise(x*.24,z*.24,76)-.5)*(.85-planned[k]*.55);
        const patch=smooth(-1.1+wear,.65+wear,distance)*smooth(-.1,.5,wd.sea?-coast[k*2+1]:1);
        if(surface.kind==='paving') {
          const street=surface.preserveRoad ? 1-smooth(.25,.85,road[k]) : 1;
          stone[k]=Math.max(stone[k],patch*(surface.strength ?? 1)*street);
        }
        else {dirt[k]=Math.max(dirt[k],patch*.72);road[k]=Math.max(road[k],patch*.38);}
      }
      if (ruins && ruins.paving !== false) { // a grassy stone ring opts out of the paved floor
        const rd = Math.hypot(x - ruins.centre[0], z - ruins.centre[1]);
        stone[k] = Math.max(stone[k], 1 - smooth(ruins.ringRadius + 0.5, ruins.ringRadius + 2.5, rd));
      }
      const inside = x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
      const zn = inside ? world.zoneAt(x, z) : null;
      if (zn && zn.id === 'ruins' && stone[k] < 0.5 && valueNoise(x * 0.23, z * 0.23, 3) > 0.68) stone[k] = 0.62;
      // zone.soil: a zone's own bias for the open soil patches (Moonroot's woods: none, as the concept)
      const dirtBias = zn ? zn.soil ?? ({ highlands: 0.18, wolf_den: 0.14, ruins: 0.08 }[zn.id] || 0) : 0.1;
      // Round the accepted scenes the soil patches give way to their grass.
      const soilFade = surround ? 1 - surround.soilFade * sceneSurround(wd, x, z, surround.soilRing) : 1;
      dirt[k] = Math.max(dirt[k], (1 - planned[k]) * soilFade * smooth(0.62 - dirtBias, 0.72 - dirtBias, valueNoise(x * 0.07, z * 0.07, 11) * 0.8 + valueNoise(x * 0.3, z * 0.3, 12) * 0.2));
      for(const surface of wd.harbor?.workSurfaces||[]){
        const p=toBoxLocal(surface,x,z),radius=Math.hypot(p.lx/surface.rx,p.lz/surface.rz);
        if(radius>1.3)continue;
        const wear=(valueNoise(x*.30,z*.30,78)-.5)*.15;
        const patch=1-smooth(.62+wear,1.18+wear,radius);
        dirt[k]=Math.max(dirt[k],patch*.92);
        road[k]=Math.max(road[k],patch*.55);
      }
      const accepted=acceptedAt(wd,x,z),aw=accepted?sceneWeight(accepted,x,z):0;
      if(!cityFloorAt(wd.city,x,z)&&!world.isWater(x,z)){
        // An accepted scene paints its own paths: the town's earth clearing gives
        // way to its grass, in the scene and in a ring round it, except along routes.
        const raw=outsideClearingWeight(wd.city,x,z),clearing=raw&&raw*(1-(surround?sceneClearingFade(wd,world.roads,x,z):aw));
        dirt[k]=Math.max(dirt[k],clearing*.97);
        road[k]=Math.max(road[k],clearing*.92);
      }
      // Scene trails narrow to a point across the feather instead of fading out
      // square at the bounds; a connector or road that continues one paints itself.
      if(accepted){const d=sceneSample(accepted,'trails',x,z),t=(1-aw)*1.8;road[k]=Math.max(road[k],(1-smooth(-.25-t,.45-t,d))*smooth(0,.25,aw));stone[k]*=1-aw;dirt[k]*=1-aw;
        // scenes whose rock faces are their own meshes keep grass on their banks
        if(grassBanks.has(accepted.id))bank[k]=aw;}
      // an edge cliff's plateau is grass on its slopes too, never sand; its face is a rock mesh
      if(edgeCliffsAt(wd,x,z)>-Infinity){bank[k]=1;coast[k*2]=0;if(accepted)road[k]=0;}
      road[k] *= 1 - stone[k] * .7;
    }
  }
  // zone colours, blurred so borders blend
  let lr = new Float32Array(n);
  let lg = new Float32Array(n);
  let lb = new Float32Array(n);
  let dr = new Float32Array(n);
  let dg = new Float32Array(n);
  let db = new Float32Array(n);
  const cache = new Map(), groundPair = wd.look?.ground || [animeConfig.palette.groundLight, animeConfig.palette.groundDark];
  const col = (hex) => {
    if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
    return cache.get(hex);
  };
  for (let j = 0; j < h; j++) {
    if (j && j % 4 === 0) yield;
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const zn = paintZoneAt(world, x, z);
      const [L, D] = zn.palette || ['#9ccf5a', '#78b046'];
      const k = j * w + i;
      const ab=animeConfig.bounds;
      const blend=animeStudy?smooth(ab.minX-4,ab.minX+4,x)*(1-smooth(ab.maxX-4,ab.maxX+4,x))*smooth(ab.minZ-4,ab.minZ+4,z)*(1-smooth(ab.maxZ-4,ab.maxZ+4,z)):0;
      const mix=animeStudy?Math.max(blend,.5):0; // zones keep half of their own tint outside the sample area
      // a map's own ground colours (look.ground [light, dark]) stand in for the game's anime pair
      const cl = mix?col(L).clone().lerp(col(groundPair[0]),mix):col(L);
      const cd = mix?col(D).clone().lerp(col(groundPair[1]),mix):col(D);
      // The accepted scenes keep the map's zone colours too, so their grass matches.
      lr[k] = cl.r;
      lg[k] = cl.g;
      lb[k] = cl.b;
      dr[k] = cd.r;
      dg[k] = cd.g;
      db[k] = cd.b;
    }
  }
  // Open seams: zone tints fade to the shared seam tint (atlas.seams profile), so the
  // neighbouring map's paint meets this one along the border; local patches fade out.
  for (const seam of world.seams || []) {
    if (!seam.profile?.[0]?.[2]) continue;
    const band = seam.band ?? 24;
    for (let j = 0; j < h; j++){
      if(j%4===0)yield;
      for (let i = 0; i < w; i++) {
        const x = ox + i * res, z = oz + j * res, along = seam.alongX ? x : z;
        const past = Math.max(seam.span[0] - along, along - seam.span[1], 0);
        const inside = ((seam.alongX ? z : x) - b[seam.edge]) * -seam.outward;
        // a wandering depth (world metres, so both maps see the same border shape)
        const [ox0, oz0] = world.data.atlas?.offset || [0, 0], reach = seamBandAt(x + ox0, z + oz0, band);
        // past the span's ends (the backdrop beyond the map edges) the shared tint carries on a long
        // way, so the two maps' outer ground never meets on a straight line either
        if (past >= band * 6 || inside >= reach) continue;
        const m = (1 - smooth(0, reach, Math.max(0, inside))) * (1 - smooth(0, band * 6, past));
        const at = seam.profile[Math.max(0, Math.min(seam.profile.length - 1, Math.round(((along - seam.profile[0][0]) / (seam.profile[seam.profile.length - 1][0] - seam.profile[0][0] || 1)) * (seam.profile.length - 1))))];
        const cl = col(at[2]), cd = col(at[3]), k = j * w + i;
        lr[k] += (cl.r - lr[k]) * m; lg[k] += (cl.g - lg[k]) * m; lb[k] += (cl.b - lb[k]) * m;
        // Map-local soil/stone patches fade to meadow; roads (both maps draw them) stay.
        dirt[k] *= 1 - m; mud[k] *= 1 - m; stone[k] *= 1 - m; planned[k] *= 1 - m;
        dr[k] += (cd.r - dr[k]) * m; dg[k] += (cd.g - dg[k]) * m; db[k] += (cd.b - db[k]) * m;
      }
    }
    yield;
  }
  // Preserve native planting density/positions. Decorative join paint is
  // applied after native surface masks and never clears existing meadow clumps.
  const plantingRoad = domain.roadExtensions?.length ? road.slice() : null;
  for (const r of domain.roadExtensions || []) {
    if (!outsideRoadVisible(r.sourceCity,r.id)) continue;
    const half = r.width / 2;
    yield* rasterPolylineSteps(grid,r.points,half+1.5,(k,d)=>{
      const x=ox+(k%w)*res,z=oz+Math.floor(k/w)*res;
      // Keep the source's wear samples when only the region origin changes.
      const nx=x+r.noiseShift[0],nz=z+r.noiseShift[1];
      const worn=((valueNoise(nx*.22,nz*.22,71)-.5)*.7+(valueNoise(nx*.85,nz*.85,72)-.5)*.22)*(1-planned[k]*.65);
      const mask=(1-smooth(half-.6+worn,half+1.05+worn,d))*domain.roadWeight(r,x,z);
      const scene=acceptedAt(wd,x,z); // an accepted scene keeps only its own paths
      road[k]=Math.max(road[k],mask*(scene?1-sceneWeight(scene,x,z):1));
    });
  }
  yield;
  const blur = function*(a){return yield* boxBlurSteps(yield* boxBlurSteps(a,w,h,6),w,h,4);};
  const blurred=[];for(const field of [lr,lg,lb,dr,dg,db])blurred.push(yield* blur(field));
  [lr,lg,lb,dr,dg,db]=blurred;
  const result = { road, plantingRoad, mud, stone, dirt, coast, lr, lg, lb, dr, dg, db, bank, town: yield* blur(planned) };
  surfaceCache.set(world,result);
  return result;
}

// The baked low-frequency ground fields (see ground-field.js), shared by terrain and grass.
// Built once per world; owned for the page lifetime like the shared brush atlas.
const fieldCache = new WeakMap();
export function groundFieldUniforms(world) {
  if (!fieldCache.has(world)) {
    const steps = groundFieldUniformSteps(world);
    for (;;) if (steps.next().done) break;
  }
  return fieldCache.get(world);
}

/** Bake the ground fields in slices (open-world streaming); cached per world. */
export function* groundFieldUniformSteps(world) {
  if (!fieldCache.has(world)) {
    const hf = world.heightfield, offset = world.data.atlas?.offset || [0, 0];
    const f = yield* groundFieldSteps(hf.ox, hf.oz, (hf.w - 1) * hf.res, (hf.h - 1) * hf.res, art.ground.fieldTexels ?? 2, offset);
    const textures = f.data.map((data) => {
      const t = new THREE.DataTexture(data, f.width, f.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; t.userData.shared = true;
      return t;
    });
    fieldCache.set(world, { uField0: { value: textures[0] }, uField1: { value: textures[1] }, uField2: { value: textures[2] }, uFieldRect: { value: new THREE.Vector4(...f.rect) }, uNoiseOffset: { value: new THREE.Vector2(...offset) } });
  }
  return fieldCache.get(world);
}

/** Free a map's cached ground data when its region is dropped (open-world streaming). */
export function releaseGroundCaches(world) {
  surfaceCache.delete(world);
  const fields = fieldCache.get(world);
  if (fields) for (const k of ['uField0', 'uField1', 'uField2']) fields[k].value.dispose();
  fieldCache.delete(world);
}

export function createTerrain(world) {
  const steps = terrainSteps(world);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Terrain tiles, yielding every few tiles so a neighbouring map can stream in. */
export function* terrainSteps(world, {adopt,domain = terrainDomain(world)} = {}) {
  const hf = world.heightfield;
  const { w, h, ox, oz, res } = hf;
  // Private render samples only. The rule-world heightfield is never modified.
  const data = new Float32Array(hf.data.length);
  for (let j = 0; j < h; j++) {
    if (j % 4 === 0) yield;
    for (let i = 0; i < w; i++) data[j*w+i] = domain.height(ox+i*res,oz+j*res,hf.data[j*w+i]);
  }
  const surf = yield* surfaceSteps(world, {domain});
  yield* groundFieldUniformSteps(world); // baked now, not at the first draw
  const mat = new THREE.MeshLambertMaterial({color:0xffffff});
  let completed=false;
  try {
  const brush=yield* groundBrushUniformSteps(mat);
  terrainMaterial(world,mat,brush);
  const group = new THREE.Group();
  group.name = 'terrain';adopt?.(group);
  const H = (i, j) => data[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
  // Past an open seam the neighbouring map draws its own ground; never overlap it.
  yield;
  let tiles = 0;
  for (let tj = 0; tj < h - 1; tj += TILE) {
    for (let ti = 0; ti < w - 1; ti += TILE) {
      const cw = Math.min(TILE, w - 1 - ti);
      const chh = Math.min(TILE, h - 1 - tj);
      const vw = cw + 1;
      const vh = chh + 1;
      const pos = new Float32Array(vw * vh * 3);
      const nrm = new Float32Array(vw * vh * 3);
      const splat = new Float32Array(vw * vh * 4);
      const tintL = new Float32Array(vw * vh * 3);
      const tintD = new Float32Array(vw * vh * 3);
      const coast = new Float32Array(vw * vh * 2);
      const townMask = new Float32Array(vw * vh), bankMask = new Float32Array(vw * vh);
      for (let j = 0; j < vh; j++)
        for (let i = 0; i < vw; i++) {
          const gi = ti + i;
          const gj = tj + j;
          const k = gj * w + gi;
          const v = j * vw + i;
          pos[v * 3] = ox + gi * res;
          pos[v * 3 + 1] = data[k];
          pos[v * 3 + 2] = oz + gj * res;
          const nx = (H(gi - 1, gj) - H(gi + 1, gj)) / (2 * res);
          const nz = (H(gi, gj - 1) - H(gi, gj + 1)) / (2 * res);
          const inv = 1 / Math.hypot(nx, 1, nz);
          nrm[v * 3] = nx * inv;
          nrm[v * 3 + 1] = inv;
          nrm[v * 3 + 2] = nz * inv;
          splat[v * 4] = surf.road[k];
          splat[v * 4 + 1] = surf.stone[k];
          splat[v * 4 + 2] = surf.mud[k];
          splat[v * 4 + 3] = surf.dirt[k];
          townMask[v] = surf.town[k];
          bankMask[v] = surf.bank[k];
          coast[v * 2] = surf.coast[k * 2];
          coast[v * 2 + 1] = surf.coast[k * 2 + 1];
          tintL[v * 3] = surf.lr[k];
          tintL[v * 3 + 1] = surf.lg[k];
          tintL[v * 3 + 2] = surf.lb[k];
          tintD[v * 3] = surf.dr[k];
          tintD[v * 3 + 1] = surf.dg[k];
          tintD[v * 3 + 2] = surf.db[k];
        }
      const idx = [];
      let coveredTriangles = 0;
      for (let j = 0; j < chh; j++)
        for (let i = 0; i < cw; i++) {
          const a = j * vw + i;
          const b2 = a + vw;
          // The opaque source slab fully covers these native terrain quads.
          // Keep the shared heightfield/collisions and a conservative edge band;
          // omit only hidden render indices, never source-city geometry.
          const x=pos[a*3]+res/2,z=pos[a*3+2]+res/2;
          if(coveredTerrainCell(world.data.city,x,z,Math.max(pos[a*3+1],pos[(a+1)*3+1],pos[b2*3+1],pos[(b2+1)*3+1]),res)){coveredTriangles+=2;continue;}
          if(!domain.owns(x,z))continue;
          idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
      geo.setAttribute('aCoast', new THREE.BufferAttribute(coast, 2));
      geo.setAttribute('aTown', new THREE.BufferAttribute(townMask, 1));
      geo.setAttribute('aBank', new THREE.BufferAttribute(bankMask, 1));
      geo.setAttribute('aTintL', new THREE.BufferAttribute(tintL, 3));
      geo.setAttribute('aTintD', new THREE.BufferAttribute(tintD, 3));
      geo.setIndex(idx);
      geo.userData.cityCoveredTriangles=coveredTriangles;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      if (idx.length) group.add(mesh);
      else geo.dispose();
      tiles++; yield;
    }
  }
  completed=true;return { group, material: mat };
  }finally{if(!completed)mat.dispose();}
}

function terrainMaterial(world,mat,brush) {
  const bossList = world.data.bosses || [];
  const arena = (bossList.find((b) => b.final) || bossList[0])?.arena || { x: 9999, z: 9999, r: 1 };
  const shift = regionShift();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uArena = { value: new THREE.Vector3(arena.x, arena.z, arena.r) };
    shader.uniforms.uWater = { value: world.waterLevel };
    shader.uniforms.uGroundBrush=brush;
    shader.uniforms.uRegionShift=shift;
    // acceptedScenes.bankShade: a scene's steep grass banks keep the darker cel tone they were
    // reviewed with (Moonroot's camp terrace), so a bank still reads as a bank from above
    const bs=world.data.acceptedScenes?.bankShade,tone=new THREE.Color(bs?.tone??'#ffffff');
    shader.uniforms.uBankShade={value:new THREE.Vector4(tone.r,tone.g,tone.b,bs?.strength??0)};
    Object.assign(shader.uniforms, groundFieldUniforms(world));
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aSplat; attribute vec3 aTintL; attribute vec3 aTintD; attribute vec2 aCoast; attribute float aTown; attribute float aBank; varying vec2 vCoast; varying float vTown; varying float vBankSlope;
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp; uniform vec3 uRegionShift;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz - uRegionShift; vSplat = aSplat; vCoast = aCoast; vTintL = aTintL; vTintD = aTintD; vUp = mix(normal.y, 1.0, aBank); vBankSlope = aBank * (1.0 - normal.y); vTown = aTown;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp; varying vec2 vCoast; varying float vTown; varying float vBankSlope;
uniform float uTime; uniform vec3 uArena; uniform float uWater; uniform vec4 uBankShade;
${GROUND_COLOR_GLSL}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
{
  vec2 w = vWorldPos.xz;
  float y = vWorldPos.y;
  vec3 col=groundColor(w,y,vTintL,vTintD,vSplat,vCoast,vUp,uWater,vTown);
  // a scene's grass bank: the steep face takes a darker cel tone, in two soft steps
  // (1 - normal.y: about .05 on a 18 degree slope, .13 at 30 degrees)
  float bankFace=smoothstep(.035,.06,vBankSlope)*.55+smoothstep(.10,.14,vBankSlope)*.45;
  col=mix(col,col*uBankShade.rgb,bankFace*uBankShade.a);
  // boss arena rune circle
  float ad = distance(w, uArena.xy);
  float ring = (1.0-smoothstep(0.0,0.35,abs(ad-(uArena.z-3.0))))+(1.0-smoothstep(0.0,0.25,abs(ad-(uArena.z-4.2))));
  col = mix(col, vec3(0.55, 0.50, 0.66), clamp(ring, 0.0, 1.0) * 0.75);
  // under the water line: darker, bluish
  col = mix(col, col * vec3(0.70, 0.81, 0.80), (1.0-smoothstep(uWater - 0.4, uWater + 0.05, y)));
  // drifting cloud shadows (world metres, so they drift on across a seam)
  col *= groundCloud(w+uNoiseOffset,uTime);
  diffuseColor.rgb = col;
}`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-shared-paint-v12';
  return mat;
}

// ---------- water ----------

/** Broad swash advances over the sand and drains back; one shared GPU clock, no CPU mesh churn. */
function seaMaterial(world, contacts, domain) {
  const surf = world.data.sea.surf || {};
  const join = domain.neighbourSea?.surf || surf;
  const atlasOffset = new THREE.Vector2(...(world.data.atlas?.offset || [0, 0]));
  const material=new THREE.ShaderMaterial({
    uniforms: { uRegionShift: regionShift(), uCrest:{value:new THREE.Vector4(surf.crestBend ?? 1.0,surf.crestWidth ?? .13,surf.crestLength ?? 12,surf.crestOpacity ?? .24)},uContacts:{value:contacts.texture},uContactBounds:{value:contacts.bounds},uContact:{value:new THREE.Vector4(contacts.range,surf.contactWidth??.42,surf.contactIntensity??.85,contacts.texel)},uTime: timeUniform, uSurf: {value:new THREE.Vector4(surf.runup ?? 2.6, surf.retreat ?? 1.6, surf.period ?? 7.5, surf.foamWidth ?? .2)}, uFoam:{value:new THREE.Vector3(surf.foamScale ?? 2.0,surf.foamIntensity ?? .95,surf.portFoam ?? .68)}, uFoamColor:{value:new THREE.Color(surf.foamColor ?? '#edf7f2')}, uMotion:{value:new THREE.Vector4(surf.foamDrift ?? .45,surf.foamLifetime ?? 2.4,surf.causticSpeed ?? .35,surf.waveSpacing ?? 9)}, uSparkle:{value:new THREE.Vector4(surf.sparkleDensity ?? .03,surf.sparkleSize ?? .09,surf.sparkleScale ?? 1.4,surf.reflectionPatches ?? .06)} },
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float depth; attribute float shore; attribute float beachWash; attribute float coastJoin;
      varying float vDepth; varying float vShore; varying vec2 vW; varying vec2 vLocal;
      varying float vBeachWash; varying float vCoastJoin;
      uniform vec3 uRegionShift; uniform vec2 uAtlasOffset;
      void main(){vCoastJoin=coastJoin;vBeachWash=beachWash;vDepth=depth;vShore=shore;vec4 wp=modelMatrix*vec4(position,1.0);vLocal=wp.xz-uRegionShift.xz;vW=vLocal+uAtlasOffset;gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec4 uSurf; uniform vec3 uFoam; uniform vec3 uFoamColor; uniform vec4 uMotion; uniform sampler2D uContacts; uniform vec4 uContactBounds; uniform vec4 uContact; uniform vec4 uCrest; uniform vec4 uSparkle;
      varying float vDepth; varying float vShore; varying vec2 vW; varying vec2 vLocal; varying float vBeachWash;
      uniform vec3 uJoinCoast; varying float vCoastJoin;
      ${NOISE_GLSL}
      // the arrival beach's light web (scenes/beach), shared with the ponds' water below
      vec2 webHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
      vec2 webVoro(vec2 x,float t){vec2 n=floor(x),f=fract(x);float f1=8.,f2=8.;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j);vec2 o=.5+.42*sin(t+6.2831*webHash(n+g));vec2 r=g+o-f;float d=dot(r,r);if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}
        return vec2(sqrt(f1),sqrt(f2)-sqrt(f1));}
      float webGap(vec2 x,float t){vec2 v=webVoro(x,t);return v.x/(v.x+v.y+1e-4);}
      // Graphic anime water: a curved crest with finite rounded strokes.
      // The row changes halfway between invisible crests, so reseeding cannot pop.
      vec3 portWave(vec2 p){
        float base=(p.y+uTime*uMotion.w/uSurf.z)/uMotion.w;
        float row=floor(base+.5);
        float offset=hash12(vec2(row,93.7))*uCrest.z;
        float cell=floor((p.x-offset)/uCrest.z);
        float seed=hash12(vec2(cell,row));
        float centre=(cell+.5)*uCrest.z+offset+(seed-.5)*uCrest.z*.12;
        // The longest stroke plus its jitter stays inside its own cell; the
        // gap hides the phase change between independently curved arc groups.
        float halfLength=uCrest.z*(.28+.13*hash12(vec2(cell+8.3,row)));
        float along=(p.x-centre)/halfLength,tip=clamp(along,-1.0,1.0);
        float bend=uCrest.x*(.45*sin(p.x*.19+uTime*.15+row*.37)
          +.12*sin(p.x*.43-uTime*.10+row*2.1)
          // the crest bows forward toward the quay it travels to (-z), its ends trailing behind
          -(.65+.20*seed)*(tip*tip-.35));
        float width=uCrest.y*sqrt(max(0.0,1.0-along*along))*(.8+.4*seed);
        return vec3(base+bend/uMotion.w,along,width);
      }
      float portWaveCoord(vec2 p){return portWave(p).x;}
      vec2 portCrest(vec2 p){
        vec3 arc=portWave(p);
        float base=(p.y+uTime*uMotion.w/uSurf.z)/uMotion.w;
        float across=(arc.x-floor(base+.5))*uMotion.w;
        // anti-alias from the continuous phase: 'across' jumps by a whole spacing at the row seam,
        // and its derivative there would smear a straight bright line along the seam
        float aa=max(fwidth(base)*uMotion.w,.035),ends=smoothstep(0.0,.12,1.0-abs(arc.y));
        return vec2(1.0-smoothstep(arc.z*.45,arc.z+aa,abs(across)),
                    1.0-smoothstep(arc.z*.6,arc.z+aa,abs(across-.18)))*ends;
      }
      // Seeds themselves move: the membranes stretch, pinch off and reconnect,
      // rather than a fixed cellular texture sliding beneath a brightness mask.
      vec2 foamCell(vec2 p,float motion,float generation){
        vec2 cell=floor(p),local=fract(p);float nearest=9.0,second=9.0;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 offset=vec2(float(x),float(y)),id=cell+offset+generation*17.3;
          vec2 seed=vec2(hash12(id),hash12(id+37.2));
          vec2 centre=offset+.5+.34*sin(seed*6.2831853+vec2(motion,-motion*.83))-local;
          float distance=dot(centre,centre);
          if(distance<nearest){second=nearest;nearest=distance;}else second=min(second,distance);
        }
        return vec2(sqrt(nearest),sqrt(second)-sqrt(nearest));
      }
      // One finite-lived patch: thick young foam opens holes, tears into remnants,
      // then disappears. Each incoming wave receives a different seed generation.
      vec2 foamSheet(vec2 p,float age,float generation,float lifetime){
        float life=clamp(age/lifetime,0.0,1.0);
        p+=vec2(sin(p.y*.9+age*1.1),cos(p.x*.8-age*.9))*(.48+.35*life);
        // Unequal branching water channels, with fine tears at their edges.
        // Multi-scale continuous fields avoid repeated circular/leopard pores.
        vec2 q=p+vec2(generation*13.1,-generation*7.3);
        float pores=fbm3(q*1.3+vec2(age*uMotion.x,-age*uMotion.x*.8));
        pores+=vnoise(q*3.8+vec2(age*.65,-age*.43))*.22;
        float aa=max(fwidth(pores),.025);
        float threshold=mix(.40,.80,life);
        float membrane=smoothstep(threshold,threshold+aa,pores);
        float erosion=vnoise(q*2.1+vec2(age*.7,-age*.5));
        float fragments=smoothstep(life*.74,life*.74+.18,erosion);
        float decay=1.0-smoothstep(.28,1.0,life);
        float white=membrane*fragments*decay;
        float mist=smoothstep(threshold-.075,threshold+.05,pores)*fragments*decay;
        return vec2(white,mist);
      }
      void main(){
        // Only the coastal seam band reconciles the two authored foam styles.
        float foamWidth=mix(uSurf.w,uJoinCoast.y,vCoastJoin);
        float sparkleDensity=mix(uSparkle.x,uJoinCoast.z,vCoastJoin);
        // Recover the waterward normal from the existing signed coast distance.
        // This advects foam perpendicular to both side coasts of the U-shaped bay.
        vec2 dx=dFdx(vW),dy=dFdy(vW);
        float determinant=dx.x*dy.y-dx.y*dy.x;
        vec2 normal=vec2(0.0,1.0);
        if(abs(determinant)>.000001){
          normal=vec2(dFdx(vShore)*dy.y-dFdy(vShore)*dx.y,
                      dFdy(vShore)*dx.x-dFdx(vShore)*dy.x)/determinant;
          normal/=max(length(normal),.001);
        }
        vec2 coast=vW-normal*vShore;
        float spacing=uMotion.w,speed=spacing/uSurf.z;
        vec2 contactUV=(vLocal-uContactBounds.xy)/uContactBounds.zw;
        float contactValid=step(0.0,contactUV.x)*step(0.0,contactUV.y)*step(contactUV.x,1.0)*step(contactUV.y,1.0);
        vec4 contactData=texture2D(uContacts,contactUV);
        float contactD=mix(uContact.x,(contactData.r-.5)*uContact.x*2.0,contactValid);
        if(contactD < -uContact.w*.15)discard;
        vec2 contactNormal=contactData.gb*2.0-1.0;
        contactNormal/=max(length(contactNormal),.001);
        float exposure=mix(1.0,contactData.a,contactValid);
        float cycle=(coast.y+normal.y*uSurf.y+uTime*speed+sin(coast.x*.19+uTime*.15)*.22)*6.2831853/spacing;
        float surge=.5-.5*cos(cycle);
        float edge=mix(uSurf.y,-uSurf.x,surge)+sin(vW.x*.34+uTime*.25)*.16;
        edge=mix(0.0,edge,vBeachWash);
        float behind=vShore-edge;
        if(behind < -.14) discard;
        float cover=smoothstep(-.14,.12,behind);
        // The arrival beach's water (scenes/beach buildSea), lifted whole: its depth colours,
        // light web, sparkles, fine messy foam at the moving edge and round rocks, cloud shade
        // and colour grade. It is worked in the scene's units (0.8 m): dz is the distance from the
        // still shoreline, wet the distance inside the moving water's edge.
        float t=uTime;
        vec2 q=vW/.8;
        float dz=vShore/.8,wet=behind/.8;
        float depth=clamp(dz*.36,0.,2.7);
        // clear water: pale green over the sand, turquoise, then blue; the map's open sea, far past
        // anything the scene shows, settles a little deeper
        vec3 col=mix(vec3(.292,.738,.521),vec3(.060,.631,.552),smoothstep(.0,.8,depth));
        col=mix(col,vec3(.025,.521,.631),smoothstep(.8,1.8,depth));
        col=mix(col,vec3(.011,.309,.546),smoothstep(1.8,2.7,depth));
        col=mix(col,vec3(.006,.205,.440),smoothstep(30.0,90.0,vShore));
        float alpha=mix(.46,.56,smoothstep(.0,1.,depth));
        alpha=mix(alpha,.78,smoothstep(1.2,2.6,depth));
        alpha=mix(alpha,.88,smoothstep(20.0,40.0,vShore));
        // the light web: small rounded, wobbly cells separated by soft, faint pale-green gaps;
        // large stretches of it fade away, so it never reads as one even net (thinner far out).
        // One cell size, the middle of the scene's 1.15-1.75: the scene scales its coordinates by
        // depth, which near its origin is harmless, but at map coordinates hundreds of metres out
        // the same scaling shears the cells into streaks wherever the depth changes.
        float near=1.-smoothstep(.3,1.5,depth);
        vec2 pS=q*1.45;
        pS+=.36*vec2(vnoise(pS*1.1+vec2(t*.18,0.)),vnoise(pS*1.1+vec2(5.,-t*.15)))-.18;
        float gS=webGap(pS,t*.35);
        float keep=smoothstep(.42,.74,vnoise(pS*.45+vec2(t*.05,-t*.04)+17.));
        keep*=smoothstep(.25,.62,vnoise(q*.26+vec2(-t*.03,t*.02)+3.));
        keep*=mix(1.0,.45,smoothstep(25.0,70.0,vShore));
        float line=smoothstep(mix(.78,.74,near),mix(.9,.86,near),gS)*keep;
        float glow=smoothstep(mix(.55,.5,near),mix(.9,.86,near),gS)*mix(.35,1.,keep);
        // the cells themselves are slightly darker, greener blobs, most visible in the shallows
        float blob=(1.-glow)*mix(.15,.5,near)*smoothstep(-.3,.6,dz);
        col=mix(col,col*vec3(.102,.301,.227)*1.15,blob*.5);
        alpha+=blob*near*.12;
        col=mix(col,vec3(.807,1.,.644),line*mix(.26,.36,near));
        col+=vec3(.658,1.,.552)*glow*keep*.08;
        alpha+=line*.12;
        // sparkles: small stars of sunlight blinking on the web
        vec2 sc=q*vec2(1.,1.25)+vec2(t*.1,0.),cid=floor(sc),cf=fract(sc)-.5;
        vec2 so=(webHash(cid)-.5)*.6;float hs=hash12(cid+5.3);
        float tw=pow(max(0.,sin(t*2.2+hs*40.)),6.)*step(.74,hs);
        vec2 sd2=cf-so;float sdist=length(sd2);
        float spark=(1.-smoothstep(.03,.075,sdist))+.9*(1.-smoothstep(.0,.016,min(abs(sd2.x),abs(sd2.y))))*(1.-smoothstep(.0,.24,sdist));
        spark*=tw*smoothstep(.15,.5,depth);
        // foam: white, fine and messy. A ragged rim with small holes at the water's edge, then thin
        // tangled threads that break up and thin out seaward. The scene's two rocks are here every
        // contact the water meets: rocks, piles, hulls and quay walls (contactD, metres).
        float rockD=contactD/.8;
        float b=1.-smoothstep(.0,2.1,max(wet,0.));
        vec2 fq=q*2.3;float fg=0.;
        if(wet<2.4||rockD<1.){fq+=.7*vec2(vnoise(fq*.6+vec2(t*.55,0.)),vnoise(fq*.6+vec2(3.,-t*.45)))-.35;fg=webGap(fq,t*.7);}
        float fth=mix(.96,.78,b*b);
        // threads break into loose strands: a fine mask cuts most cell walls open
        float thr=smoothstep(fth,fth+.025,fg)*smoothstep(.34,.5,vnoise(fq*1.6+vec2(t*.7,0.)))*smoothstep(.3,.55,vnoise(q*1.2+vec2(0.,-t*.4))+b*.25);
        float foam=thr*smoothstep(.0,.12,b);
        float rimW=.18+.42*vnoise(vec2(q.x*.9,t*.5))*vnoise(vec2(q.x*2.7+4.,t*.7));
        float rim=1.-smoothstep(rimW*.5,rimW,wet+.1*(vnoise(q*4.)-.5));
        if(rim>0.)rim*=mix(1.,smoothstep(.45,.55,webGap(q*3.4+vec2(0.,-t*.2),t)),smoothstep(.03,.14,wet));
        foam=max(foam,rim);
        if(contactD<uContact.x-.03){
          float rb=1.-smoothstep(.0,.9,abs(rockD));
          foam=max(foam,smoothstep(mix(.95,.6,rb),mix(.95,.6,rb)+.03,fg)*rb);
          foam=max(foam,(1.-smoothstep(.04,.16,abs(rockD)))*smoothstep(.3,.6,vnoise(q*2.)));
        }
        // the harbour keeps its curved incoming crests (no beach there for a wash to run up)
        if(vBeachWash<.999){
          float zone=smoothstep(1.0,2.3,vShore)*(1.0-smoothstep(38.0,65.0,vShore));
          vec2 port=portCrest(vW)*zone*exposure*smoothstep(.15,.65,contactD)*(1.0-vBeachWash);
          col=mix(col,vec3(.10,.32,.38),port.y*.17);
          foam=max(foam,port.x*uCrest.w);
        }
        // soft cloud shadows drifting across the water
        float cs=smoothstep(.5,.64,vnoise(q*.06+vec2(t*.022,t*.010))*.65+vnoise(q*.159+vec2(t*.058,t*.026)+3.)*.35);
        col*=mix(vec3(1.),vec3(.82,.86,.95),cs*.7);
        spark*=1.-cs;
        col=mix(col,vec3(1.),foam);
        col+=vec3(1.)*spark*(1.-foam);
        alpha=max(alpha,max(foam,spark));
        // the thin sheet of the wash over the sand; foam stays opaque white
        alpha=max(alpha*mix(.55,1.,smoothstep(-.9,.1,dz)),foam);
        alpha*=smoothstep(.0,.05,wet);
        // harbour water stays full against its walls
        alpha=max(alpha,mix(.72,0.0,vBeachWash)*cover);
        // the scene's grade for its sea: more saturation and a firmer contrast, in gamma-2
        {vec3 g=sqrt(max(col,0.0));float l=dot(g,vec3(.299,.587,.114));g=max((mix(vec3(l),g,1.2)-.5)*1.16+.5,0.0);col=g*g;}
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`,
  });
  material.userData.waterStyle='anime-curved-port-crest';
  // Wave/paint phase is global; contact UVs above retain this map's coordinates.
  material.uniforms.uAtlasOffset = {value: atlasOffset};
  material.uniforms.uJoinCoast = {value: new THREE.Vector3(join.foamScale ?? 2, join.foamWidth ?? .2, join.sparkleDensity ?? .03)};
  material.userData.waterContact={sections:contacts.sections,segments:contacts.segments,texel:contacts.texel};
  ownContactTexture(material,contacts.texture);
  return material;
}

// Fresh water (streams and ponds), in the sea's cel style: soft depth bands from a pale
// turquoise over the bed to deep teal, drifting sky patches, sparse twinkling glints and a
// broken lace of foam that laps at the waterline. Streams carry streaks moving downstream
// (flow coordinates: along/across in metres); ponds get slow drip rings instead.
// `tone` (0 shallow .. 1 deep) is the look's depth: a pond's real depth, a stream's channel.
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform, uRegionShift: regionShift() },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float depth; attribute float along; attribute float across; attribute float tone; attribute float flow; attribute float shore;
      varying float vDepth; varying float vAlong; varying float vAcross; varying float vTone; varying float vFlow; varying float vShore; varying vec2 vW;
      uniform vec3 uRegionShift;
      void main(){ vDepth = depth; vAlong = along; vAcross = across; vTone = tone; vFlow = flow; vShore = shore;
        vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xz - uRegionShift.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vDepth; varying float vAlong; varying float vAcross; varying float vTone; varying float vFlow; varying float vShore; varying vec2 vW;
      ${NOISE_GLSL}
      // the arrival beach's light web (scenes/beach): cell points wobble in place; x is the
      // distance to the nearest point, y to the cell border
      vec2 webHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
      vec2 webVoro(vec2 x,float t){vec2 n=floor(x),f=fract(x);float f1=8.,f2=8.;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j);vec2 o=.5+.42*sin(t+6.2831*webHash(n+g));vec2 r=g+o-f;float d=dot(r,r);if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}
        return vec2(sqrt(f1),sqrt(f2)-sqrt(f1));}
      // rounded cells: nearest/second-nearest ratio; its contours are circles, so the cells read as
      // soft blobs and the gaps widen into small pools where three cells meet
      float webGap(vec2 x,float t){vec2 v=webVoro(x,t);return v.x/(v.x+v.y+1e-4);}
      void main(){
        // the waterline breathes a little, so the edge laps instead of standing still;
        // shore: metres to the waterline (per vertex, from the bank's real crossing)
        float lap = .07*sin(uTime*1.25+vnoise(vW*.45)*6.2831) + (vnoise(vW * 1.3 + uTime * 0.3) - 0.5) * 0.08;
        float shore = vShore - lap;
        float d = vDepth;
        if (shore <= 0.0 || d <= 0.0) discard;
        float tone = clamp(vTone, 0.0, 1.0);
        vec3 shallow = vec3(0.22, 0.54, 0.50), mid = vec3(0.14, 0.47, 0.50), deep = vec3(0.07, 0.32, 0.43);
        vec3 col = mix(shallow, mid, smoothstep(0.12, 0.36, tone));
        col = mix(col, deep, smoothstep(0.60, 0.78, tone));
        // the bed shows through the shallows as soft mottling
        col += (vnoise(vW * 1.6) - 0.5) * 0.06 * (1.0 - smoothstep(0.1, 0.45, tone));
        // flow space: a stream runs along +along; a pond has none
        vec2 fp = vec2(vAlong, vAcross);
        // cel-shaded sky reflection: pale patches on a turned, warped domain (no grid rows)
        vec2 skyP = mat2(.80,-.60,.60,.80) * vW * .09 + vec2(uTime * .012, uTime * .005);
        skyP.x -= vFlow * uTime * .05;
        vec2 skyW = vec2(vnoise(vW * .21 + uTime * .02), vnoise(vW.yx * .25 - uTime * .017)) - .5;
        float sky = smoothstep(.57, .61, vnoise(skyP + skyW * 1.2)), webAlpha = 0.0;
        col += vec3(.06, .10, .10) * sky * smoothstep(0.15, 0.5, tone) * (1.0 - .75 * vFlow);
        // the light web, as on the arrival beach's sea: small rounded wobbly cells parted by soft
        // pale-green gaps, brighter in the shallows; whole stretches fade, so it never reads as one even
        // net. The cell points wobble in place. Ponds only: a stream shows its current instead.
        if (vFlow < 0.5) {
          float near = 1.0 - smoothstep(.12, .55, tone);
          // in the beach scene's metres (its scale 0.8)
          vec2 q = vW / .8;
          // one cell size: scaling world coordinates by a factor that varies with depth would shear
          // the cells into dotted streaks wherever the depth changes
          vec2 pS = q * 1.45;
          pS += .36 * vec2(vnoise(pS * 1.1 + vec2(uTime * .18, 0.)), vnoise(pS * 1.1 + vec2(5., -uTime * .15))) - .18;
          float gS = webGap(pS, uTime * .35);
          float keep = smoothstep(.42, .74, vnoise(pS * .45 + vec2(uTime * .05, -uTime * .04) + 17.));
          keep *= smoothstep(.25, .62, vnoise(q * .26 + vec2(-uTime * .03, uTime * .02) + 3.));
          float web = smoothstep(mix(.78, .74, near), mix(.9, .86, near), gS) * keep;
          float glow = smoothstep(mix(.55, .5, near), mix(.9, .86, near), gS) * mix(.35, 1., keep);
          // the cells themselves are slightly darker, greener blobs, most visible in the shallows
          float blob = (1. - glow) * mix(.15, .5, near) * smoothstep(.0, .6, vShore);
          col = mix(col, col * vec3(.102, .301, .227) * 1.15, blob * .5);
          col = mix(col, vec3(.807, 1., .644), web * mix(.26, .36, near));
          col += vec3(.658, 1., .552) * glow * keep * .08;
          webAlpha = web * .12 + blob * near * .12;
        }
        if (vFlow > 0.5) {
          // current lines: thin lanes along the stream, each broken into dashes of its own
          // that travel downstream (no noise iso-bands, which close into rings)
          float laneP = fp.y * .85 + (vnoise(vec2(fp.x * .14, fp.y * .35)) - .5) * 1.1 + sin(fp.x * .31 + fp.y) * .12;
          float lane = floor(laneP), inLane = abs(fract(laneP) - .5);
          float n = vnoise(vec2(fp.x * .2 - uTime * (1.0 + hash12(vec2(lane, 4.0)) * .5), lane * 7.3));
          // a dash swells from a point and tapers out again, like a fold of the current
          float dash = smoothstep(.54, .72, n);
          // never thinner than a pixel (a hairline would break into dots); the dash fades instead
          float aa = fwidth(laneP), w = max(mix(.02, .06, dash), aa);
          float line = 1.0 - smoothstep(w * .3, w + aa, inLane);
          float banks = smoothstep(.3, 1.2, vShore);
          col = mix(col, vec3(.72, .91, .87), line * dash * banks * (.22 + .18 * hash12(vec2(lane, 9.0))));
        } else {
          // slow drip rings: a few cells at a time grow a thin ring that fades as it widens
          vec2 rp = vW / 3.4, rc = floor(rp);
          float seed = hash12(rc), age = fract(uTime * .22 + seed * 7.0);
          float on = step(.86, hash12(rc + floor(uTime * .22 + seed * 7.0) * 1.37));
          vec2 c = rc + .25 + .5 * vec2(hash12(rc + 3.1), hash12(rc + 7.7));
          float ring = 1.0 - smoothstep(.0, .035, abs(length(rp - c) - age * .42));
          col = mix(col, vec3(.72, .90, .86), ring * on * (1.0 - age) * (1.0 - age) * .4 * smoothstep(0.12, 0.4, tone));
        }
        // sun glints: sparse four-point stars twinkling on open water
        vec2 gp = vW / 2.3, gc = floor(gp), gl = fract(gp) - .5;
        float gt = uTime * .8 + hash12(gc) * 7.0, gseed = hash12(gc + floor(gt) * 13.1);
        vec2 gq = gl - (vec2(hash12(gc + 3.7), hash12(gc + 9.1)) - .5) * .6;
        float star = max(1.0 - smoothstep(.0, .05, abs(gq.x) * .25 + abs(gq.y)), 1.0 - smoothstep(.0, .05, abs(gq.y) * .25 + abs(gq.x)));
        col = mix(col, vec3(1.0, .98, .90), star * step(.965, gseed) * sin(fract(gt) * 3.14159) * smoothstep(.2, .5, tone) * .85);
        // the waterline: a broken lace of foam, and a pale wet ribbon just inside it
        vec2 lp = vW * 1.9 + vec2(uTime * .12, -uTime * .09) - vec2(vFlow * uTime * .6, 0.0);
        float broken = smoothstep(.30, .55, vnoise(lp));
        float lace = (1.0 - smoothstep(.06, .24, shore)) * mix(.35, 1.0, broken);
        float ribbonAt = .55 + .12 * sin(vW.x * 1.1 + vW.y * .8 - uTime * .9);
        float ribbon = (1.0 - smoothstep(.04, .11, abs(shore - ribbonAt))) * smoothstep(.45, .6, vnoise(vW * .8 + 5.0));
        col = mix(col, vec3(.62, .84, .78), ribbon * .35);
        col = mix(col, vec3(.96, .98, .95), lace * .85);
        // clear over the bank, so the bed shows; fuller over deep water
        float a = min(1.0, mix(0.30, 0.86, smoothstep(0.05, 0.6, tone)) + webAlpha) * smoothstep(0.0, 0.03, shore);
        a = max(a, lace * .9);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** River strip + ponds at the water level; depth comes from the heightfield. */
export const createWater=(...args)=>finishSteps(waterSteps(...args));
export function* waterSteps(world, scenery = null, {adopt,owner,domain = terrainDomain(world)} = {}) {
  const group = new THREE.Group();
  adopt?.(group);
  const mat = waterMaterial();owner?.material(mat);
  const wl = world.waterLevel;
  const hY = world.terrainY;
  const river = world.data.river;
  if (river) {
    const pts = river.points;
    const half = river.width / 2 + 1.6;
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    dense.push(pts[pts.length - 1]);
    const cols = 16;
    const pos = [], depth = [], along = [], across = [], tone = [], flow = [], idx = [];
    let acc = 0;
    for (let i = 0; i < dense.length; i++) {
      const p0 = dense[Math.max(0, i - 1)];
      const p1 = dense[Math.min(dense.length - 1, i + 1)];
      let tx = p1[0] - p0[0];
      let tz = p1[1] - p0[1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
      for (let c = 0; c <= cols; c++) {
        const s = (c / cols) * 2 - 1;
        const x = dense[i][0] - tz * s * half;
        const z = dense[i][1] + tx * s * half;
        const dp = wl - hY(x, z), channel = 1 - Math.min(1, Math.abs(s * half) / (river.width / 2));
        pos.push(x, wl, z);
        depth.push(dp);
        along.push(acc);
        across.push(s * half);
        // a shallow stream reads by its channel: pale over the gravel at the banks, deeper in the middle
        tone.push(Math.min(1, Math.max(dp / 1.2, channel * channel * 0.55)));
        flow.push(1);
      }
    }
    // metres to the waterline across each row: where the depth crosses zero on either bank
    const shore = new Array(depth.length).fill(0), centre = cols / 2;
    for (let i = 0; i < dense.length; i++)
      for (const side of [-1, 1]) {
        const at = (c) => i * (cols + 1) + c;
        let edge = Math.abs(across[at(side < 0 ? 0 : cols)]);
        for (let c = centre; side < 0 ? c > 0 : c < cols; c += side) {
          const d0 = depth[at(c)], d1 = depth[at(c + side)];
          if (d0 > 0 && d1 <= 0) { const u = d0 / (d0 - d1); edge = Math.abs(across[at(c)]) * (1 - u) + Math.abs(across[at(c + side)]) * u; break; }
        }
        for (let c = centre; side < 0 ? c >= 0 : c <= cols; c += side) shore[at(c)] = edge - Math.abs(across[at(c)]);
      }
    for (let i = 0; i < dense.length - 1; i++)
      for (let c = 0; c < cols; c++) {
        const a = i * (cols + 1) + c;
        const b2 = a + cols + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    group.add(freshWaterMesh(pos, {depth, along, across, tone, flow, shore}, idx, mat));
  }
  // A pond in polar rings out to its rim (rimAt(angle), angle = atan2(dz, dx)) plus 1.6 m of
  // bank, about 0.6 m apart (reach: the largest rim plus the bank), so the waterline follows the outline.
  const pond = (px, pz, rimAt, reach, depthAt) => {
    const segs = Math.max(40, Math.ceil((2 * Math.PI * reach) / 0.6));
    const rings = Math.max(8, Math.ceil(reach / 0.6));
    const pos = [], depth = [], along = [], across = [], tone = [], flow = [], shore = [], idx = [];
    for (let r = 0; r <= rings; r++)
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2, rim = rimAt(Math.atan2(Math.cos(a), Math.sin(a)));
        const rr = (r / rings) * (rim + 1.6);
        const x = px + Math.sin(a) * rr;
        const z = pz + Math.cos(a) * rr;
        const [dp, toShore] = depthAt(x, z);
        pos.push(x, wl, z);
        depth.push(dp);
        shore.push(toShore);
        along.push(0);
        across.push(0);
        tone.push(Math.min(1, Math.max(0, dp / 1.2)));
        flow.push(0);
      }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s;
        const b2 = a + segs + 1;
        idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
      }
    group.add(freshWaterMesh(pos, {depth, along, across, tone, flow, shore}, idx, mat));
  };
  // A scene that exports its pond's waterline (Mirror Pond: 72 radii from -PI) is drawn to that
  // outline; the circles in `ponds` that fill it are only its collision.
  // Glimmer Wetland exports several pools, each drawn the same way.
  const scenePonds = acceptedScenes(world.data).flatMap((s) => s.pond ? [s.pond] : s.pools || []);
  for (const sp of scenePonds) {
    const n = sp.radius.length, rimAt = (a) => {
      const f = ((a + Math.PI) / (2 * Math.PI)) * n, i = Math.floor(f), u = f - i;
      return sp.radius[((i % n) + n) % n] * (1 - u) + sp.radius[(i + 1) % n] * u;
    };
    // the water ends just past the scene's waterline even where the ground there is low
    pond(sp.x, sp.z, rimAt, Math.max(...sp.radius) + 1.6, (x, z) => {
      const dx = x - sp.x, dz = z - sp.z, toRim = rimAt(Math.atan2(dz, dx)) + 0.3 - Math.hypot(dx, dz), ground = wl - hY(x, z);
      return [Math.min(ground, toRim * 0.55), Math.min(toRim, ground / 0.55)];
    });
  }
  for (const p of world.data.ponds || []) {
    if (scenePonds.some((sp) => Math.hypot(p[0] - sp.x, p[1] - sp.z) + p[2] <= Math.max(...sp.radius) + 1)) continue;
    // the water ends at the carved bank's waterline (0.64 m past the rim, core/terrain.js carve),
    // even where the bank runs into lower ground: no water stands where the player can walk
    // (metres to the waterline: the bank outside the rim rises 0.55 m per metre)
    pond(p[0], p[1], (a) => pondRim(p, a), pondReach(p) + 1.6, (x, z) => {
      const toRim = 0.64 - pondEdgeDistance(p, x, z), ground = wl - hY(x, z);
      return [Math.min(ground, toRim * 0.55), Math.min(toRim, ground / 0.55)];
    });
  }
  const sea = world.data.sea;
  if (sea) {
    const contact=yield* waterContactSteps(world,scenery);
    group.userData.contactSections=contact.sections;
    const seaMat = seaMaterial(world,contact,domain);owner?.material(seaMat);
    // Match the terrain grid so the thin film cannot cut through sand at coarse triangle edges.
    // Cull in tiles; only the few swash tiles in the camera view reach the GPU.
    const hf = world.heightfield;
    const x0 = hf.ox;
    const x1 = hf.ox + (hf.w - 1) * hf.res;
    const coast = sea.coastline || sea.shore;
    // bays cut into the land (sea.bays) reach further north than the shoreline
    const zMin = Math.max(hf.oz, hf.oz + Math.floor((Math.min(...coast.map((p) => p[1]), ...(sea.bays || []).flatMap((b) => b.points.map((p) => p[1]))) - 6 - hf.oz) / hf.res) * hf.res);
    const z1 = Math.max(...coast.map((p) => p[1])) + 40;
    const step = hf.res;
    const nx = Math.ceil((x1 - x0) / step);
    const nz = Math.ceil((z1 - zMin) / step);
    for(let tj=0;tj<nz;tj+=TILE) for(let ti=0;ti<nx;ti+=TILE) {
    yield;
    const cw=Math.min(TILE,nx-ti),ch=Math.min(TILE,nz-tj);
    const pos = [], depth = [], along = [], shore = [], washMask = [], coastJoin = [], idx = [];
    for (let j = 0; j <= ch; j++)
      for (let i = 0; i <= cw; i++) {
        const x = x0 + (ti+i) * step;
        const z = zMin + (tj+j) * step;
        const c = domain.coastAt(x, z);
        const shoreD = -c.distance;
        // Only beaches carry the thin film over terrain. Port water stays flat.
        // Source city slabs are raised solid land, not beach film. A raised
        // swash vertex here made a bright strip along the imported shore edge.
        const beachFilm=c.kind==='beach'&&!cityFloorAt(world.data.city,x,z);
        // The film stops at filmTop above the water: on a headland or terrace that
        // stands beside the shoreline it sinks under the ground instead of climbing it.
        const ground=hY(x,z),filmTop=sea.surf?.filmTop??Infinity;
        pos.push(x, beachFilm ? (ground > wl + filmTop ? ground - .4 : Math.max(wl + .015, ground + .025)) : wl+.015, z);
        depth.push(wl - hY(x, z));
        along.push(x * 0.2);
        shore.push(shoreD); washMask.push(beachFilm ? 1 : 0); coastJoin.push(c.blend);
      }
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < cw; i++) {
        const a = j * (cw + 1) + i;
        const b2 = a + cw + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    const wash = waterMesh(pos, depth, along, idx, seaMat, shore, washMask, coastJoin);
    wash.name = 'sea-swash';
    group.add(wash);
    }
    const far = [x0 - 400, wl, z1, x1 + 400, wl, z1, x0 - 400, wl, z1 + 500, x1 + 400, wl, z1 + 500];
    group.add(waterMesh(far, [5, 5, 5, 5], [0, 0, 0, 0], [0, 2, 1, 1, 2, 3], seaMat, [40,40,500,500]));
    for (const side of [-1, 1]) {
      const xa = side < 0 ? x0 - 400 : x1;
      const xb = side < 0 ? x0 : x1 + 400;
      group.add(waterMesh([xa, wl, zMin + 10, xb, wl, zMin + 10, xa, wl, z1, xb, wl, z1], [5, 5, 5, 5], [0, 0, 0, 0], [0, 2, 1, 1, 2, 3], seaMat, [0,0,40,40]));
    }
  }
  for(const mesh of [...group.children]){
    owner?.geometry(mesh.geometry);
    mesh.geometry=yield* clipRegionGeometrySteps(mesh.geometry,world,owner);
    mesh.geometry.computeBoundingSphere();
    if(!(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)){mesh.removeFromParent();owner?owner.release(mesh.geometry):mesh.geometry.dispose();}
    yield;
  }
  return group;
}

function freshWaterMesh(pos, attributes, idx, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [name, values] of Object.entries(attributes)) g.setAttribute(name, new THREE.Float32BufferAttribute(values, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}

function waterMesh(pos, depth, along, idx, mat, shore = null, washMask = null, coastJoin = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  if(shore) { g.setAttribute('shore',new THREE.Float32BufferAttribute(shore,1)); g.setAttribute('beachWash',new THREE.Float32BufferAttribute(washMask || shore.map(() => 1),1)); g.setAttribute('coastJoin',new THREE.Float32BufferAttribute(coastJoin || shore.map(() => 0),1)); }
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}
