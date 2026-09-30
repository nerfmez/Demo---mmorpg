// Terrain mesh (from the shared heightfield) and stylised water.
// The terrain is split into tiles so off-screen parts are culled. Per-vertex attributes carry
// what the surface is (road, paving, mud, bare dirt) and the zone colours; the fragment shader
// paints soft cel patches, blade speckles, rocky cliff faces, drifting cloud shadows.
import * as THREE from 'three';
import { toBoxLocal } from '../core/math.js';
import { rasterPolyline, boxBlur, valueNoise } from '../core/terrain.js';
import { timeUniform } from './patch.js';
import { bakeWaterContact, ownContactTexture } from './water-contact.js';
import { animeStudy, animeConfig, artReviewLayout } from './anime-study.js';

const TILE = 32;

import { NOISE_GLSL, GROUND_COLOR_GLSL } from './ground-color.js';
export { NOISE_GLSL } from './ground-color.js';

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Per-grid-vertex surface data: splat (road, paving, mud, dirt) and blurred zone tints. */
const surfaceCache = new WeakMap();
export function surfaceData(world) {
  if(surfaceCache.has(world)) return surfaceCache.get(world);
  const hf = world.heightfield;
  const { w, h, ox, oz, res } = hf;
  const n = w * h;
  const wd = world.data;
  const road = new Float32Array(n);
  const mud = new Float32Array(n);
  const stone = new Float32Array(n);
  const dirt = new Float32Array(n);
  const coast = new Float32Array(n * 2);
  const grid = { ox, oz, res, w, h };
  for (const r of world.roads) {
    const half = r.width / 2;
    rasterPolyline(grid, r.points, half + 1.5, (k, d) => {
      const x=ox+(k%w)*res, z=oz+Math.floor(k/w)*res;
      const worn=(valueNoise(x*.22,z*.22,71)-.5)*.7+(valueNoise(x*.85,z*.85,72)-.5)*.22;
      road[k] = Math.max(road[k], 1 - smooth(half - .6 + worn, half + 1.05 + worn, d));
    });
  }
  // Authored free paths join district thresholds to the existing road corridors.
  for(const building of wd.town.buildings) if(building.entryPath||wd.town.styleSlice?.buildingIds.includes(building.id)) {
    const half=building.entryPath?.length? .85:1.2;
    const points=building.entryPath||[[building.x,building.z+building.hz],[building.x,wd.town.centre[1]]];
    rasterPolyline(grid,points,half+1,(k,d)=>{
      const x=ox+(k%w)*res,z=oz+Math.floor(k/w)*res;
      const wear=(valueNoise(x*.4,z*.4,77)-.5)*.3;
      road[k]=Math.max(road[k],1-smooth(half-.35+wear,half+.7+wear,d));
    });
  }
  if(artReviewLayout)rasterPolyline(grid,animeConfig.sample.path,1.6,(k,d)=>{road[k]=Math.max(road[k],1-smooth(.65,1.5,d));});
  if (wd.river) {
    const half = wd.river.width / 2;
    rasterPolyline(grid, wd.river.points, half + 3, (k, d) => {
      mud[k] = Math.max(mud[k], 1 - smooth(half - 0.3, half + 2.4, d));
    });
  }
  const town = wd.town;
  const ruins = wd.ruins;
  const b = world.bounds;
  for (let j = 0; j < h; j++) {
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const k = j * w + i;
      for (const [px, pz, pr] of wd.ponds) {
        const d = Math.hypot(x - px, z - pz);
        if (d < pr + 3) mud[k] = Math.max(mud[k], 1 - smooth(pr - 0.3, pr + 2.2, d));
      }
      if (wd.sea) {
        // sandy beach along the sea
        const c = world.coastAt(x, z), d = c.distance;
        const beach = wd.sea.beach || 14;
        coast[k * 2] = c.kind === 'beach' ? 1 - smooth(beach - 1, beach + 2.5, d) : 0;
        if(c.kind !== 'beach' && d >= 0 && d < 5.5) {
          const wear=(valueNoise(x*.28,z*.28,74)-.5)*1.1;
          stone[k]=Math.max(stone[k],1-smooth(2.3+wear,4.8+wear,d));
        }
        coast[k * 2 + 1] = -d;
      }
      const td = Math.hypot(x - town.centre[0], z - town.centre[1]);
      const plazaWear=(valueNoise(x*.17,z*.17,75)-.5)*2;
      if (td < town.plazaRadius + 3) stone[k] = Math.max(stone[k], 1 - smooth(town.plazaRadius - 1.2 + plazaWear, town.plazaRadius + 1.4 + plazaWear, td));
      if(town.styleSlice && z > -47 && z < -18 && Math.abs(x) < 46) {
        // A continuous market apron reaches the curved quay. Overlapping masks
        // avoid the straight grass seam between a rectangle and the shore strip.
        const c=world.coastAt(x,z), wear=(valueNoise(x*.18,z*.18,76)-.5)*1.6;
        const side=1-smooth(33+wear,44+wear,Math.abs(x));
        const back=smooth(-45+wear,-40+wear,z);
        const edge=smooth(-.3,.5,c.distance);
        stone[k]=Math.max(stone[k],side*back*edge);
      }
      if (ruins) {
        const rd = Math.hypot(x - ruins.centre[0], z - ruins.centre[1]);
        stone[k] = Math.max(stone[k], 1 - smooth(ruins.ringRadius + 0.5, ruins.ringRadius + 2.5, rd));
      }
      const inside = x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
      const zn = inside ? world.zoneAt(x, z) : null;
      if (zn && zn.id === 'ruins' && stone[k] < 0.5 && valueNoise(x * 0.23, z * 0.23, 3) > 0.68) stone[k] = 0.62;
      const dirtBias = zn ? { highlands: 0.18, wolf_den: 0.14, ruins: 0.08 }[zn.id] || 0 : 0.1;
      dirt[k] = smooth(0.62 - dirtBias, 0.72 - dirtBias, valueNoise(x * 0.07, z * 0.07, 11) * 0.8 + valueNoise(x * 0.3, z * 0.3, 12) * 0.2);
      for(const surface of wd.harbor?.workSurfaces||[]){
        const p=toBoxLocal(surface,x,z),radius=Math.hypot(p.lx/surface.rx,p.lz/surface.rz);
        if(radius>1.3)continue;
        const wear=(valueNoise(x*.30,z*.30,78)-.5)*.15;
        const patch=1-smooth(.62+wear,1.18+wear,radius);
        dirt[k]=Math.max(dirt[k],patch*.92);
        road[k]=Math.max(road[k],patch*.55);
      }
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
  const cache = new Map();
  const col = (hex) => {
    if (!cache.has(hex)) cache.set(hex, new THREE.Color(hex));
    return cache.get(hex);
  };
  for (let j = 0; j < h; j++) {
    const z = oz + j * res;
    for (let i = 0; i < w; i++) {
      const x = ox + i * res;
      const zn = world.zoneAt(Math.min(b.maxX - 0.1, Math.max(b.minX, x)), Math.min(b.maxZ - 0.1, Math.max(b.minZ, z)));
      const [L, D] = zn.palette || ['#9ccf5a', '#78b046'];
      const k = j * w + i;
      const ab=animeConfig.bounds;
      const blend=animeStudy?smooth(ab.minX-4,ab.minX+4,x)*(1-smooth(ab.maxX-4,ab.maxX+4,x))*smooth(ab.minZ-4,ab.minZ+4,z)*(1-smooth(ab.maxZ-4,ab.maxZ+4,z)):0;
      const mix=animeStudy?Math.max(blend,.5):0; // zones keep half of their own tint outside the sample area
      const cl = mix?col(L).clone().lerp(col(animeConfig.palette.groundLight),mix):col(L);
      const cd = mix?col(D).clone().lerp(col(animeConfig.palette.groundDark),mix):col(D);
      lr[k] = cl.r;
      lg[k] = cl.g;
      lb[k] = cl.b;
      dr[k] = cd.r;
      dg[k] = cd.g;
      db[k] = cd.b;
    }
  }
  const blur = (a) => boxBlur(boxBlur(a, w, h, 6), w, h, 4);
  [lr, lg, lb, dr, dg, db] = [lr, lg, lb, dr, dg, db].map(blur);
  const result = { road, mud, stone, dirt, coast, lr, lg, lb, dr, dg, db };
  surfaceCache.set(world,result);
  return result;
}

export function createTerrain(world) {
  const hf = world.heightfield;
  const { w, h, ox, oz, res, data } = hf;
  const surf = surfaceData(world);
  const mat = terrainMaterial(world);
  const group = new THREE.Group();
  group.name = 'terrain';
  const H = (i, j) => data[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
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
      for (let j = 0; j < chh; j++)
        for (let i = 0; i < cw; i++) {
          const a = j * vw + i;
          const b2 = a + vw;
          idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
      geo.setAttribute('aCoast', new THREE.BufferAttribute(coast, 2));
      geo.setAttribute('aTintL', new THREE.BufferAttribute(tintL, 3));
      geo.setAttribute('aTintD', new THREE.BufferAttribute(tintD, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      group.add(mesh);
    }
  }
  return { group, material: mat };
}

function terrainMaterial(world) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bossList = world.data.bosses || [];
  const arena = (bossList.find((b) => b.final) || bossList[0])?.arena || { x: 9999, z: 9999, r: 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uArena = { value: new THREE.Vector3(arena.x, arena.z, arena.r) };
    shader.uniforms.uWater = { value: world.waterLevel };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aSplat; attribute vec3 aTintL; attribute vec3 aTintD; attribute vec2 aCoast; varying vec2 vCoast;
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSplat = aSplat; vCoast = aCoast; vTintL = aTintL; vTintD = aTintD; vUp = normal.y;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos; varying vec4 vSplat; varying vec3 vTintL; varying vec3 vTintD; varying float vUp; varying vec2 vCoast;
uniform float uTime; uniform vec3 uArena; uniform float uWater;
${GROUND_COLOR_GLSL}`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
{
  vec2 w = vWorldPos.xz;
  float y = vWorldPos.y;
  vec3 col=groundColor(w,y,vTintL,vTintD,vSplat,vCoast,vUp,uWater);
  // boss arena rune circle
  float ad = distance(w, uArena.xy);
  float ring = (1.0-smoothstep(0.0,0.35,abs(ad-(uArena.z-3.0))))+(1.0-smoothstep(0.0,0.25,abs(ad-(uArena.z-4.2))));
  col = mix(col, vec3(0.55, 0.50, 0.66), clamp(ring, 0.0, 1.0) * 0.75);
  // under the water line: darker, bluish
  col = mix(col, col * vec3(0.70, 0.81, 0.80), (1.0-smoothstep(uWater - 0.4, uWater + 0.05, y)));
  // drifting cloud shadows
  col *= groundCloud(w,uTime);
  diffuseColor.rgb = col;
}`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-shared-paint-v7';
  return mat;
}

// ---------- water ----------

// Height and analytic slope of two crossing swells. The same curved primary
// phase drives shore arrival and object impacts, rather than painted crest lines.
const SEA_SWELL_GLSL = /* glsl */ `
  uniform float uTime; uniform vec4 uSurf; uniform vec4 uMotion; uniform vec4 uSwell;
  float seaPhase(vec2 p){
    return (p.y+uTime*uMotion.w/uSurf.z)*6.2831853/uMotion.w
      +uSwell.z*(sin(p.x*.15+uTime*.12)+.35*sin(p.x*.39-uTime*.19));
  }
  vec3 seaSwell(vec2 p){
    float k=6.2831853/uMotion.w, a=seaPhase(p);
    float bendSlope=uSwell.z*(.15*cos(p.x*.15+uTime*.12)+.1365*cos(p.x*.39-uTime*.19));
    float b=k*.61*dot(p,vec2(.48,.88))+uTime*6.2831853/uSurf.z*.73
      +.45*sin(p.y*.13-uTime*.17);
    float height=uSwell.x*(cos(a)+.18*cos(2.0*a))+uSwell.y*cos(b);
    vec2 slope=-uSwell.x*(sin(a)+.36*sin(2.0*a))*vec2(bendSlope,k)
      -uSwell.y*sin(b)*vec2(k*.61*.48,k*.61*.88+.0585*cos(p.y*.13-uTime*.17));
    return vec3(height,slope);
  }
`;

/** Broad swash advances over the sand and drains back; one shared GPU clock, no CPU mesh churn. */
function seaMaterial(world, contacts) {
  const surf = world.data.sea.surf || {};
  const material=new THREE.ShaderMaterial({
    uniforms: { uSwell:{value:new THREE.Vector4(surf.swellHeight ?? .32,surf.crossSwellHeight ?? .11,surf.swellBend ?? 1.1,surf.swellShading ?? 3.0)},uContacts:{value:contacts.texture},uContactBounds:{value:contacts.bounds},uContact:{value:new THREE.Vector4(contacts.range,surf.contactWidth??.42,surf.contactIntensity??.85,contacts.texel)},uTime: timeUniform, uSurf: {value:new THREE.Vector4(surf.runup ?? 2.6, surf.retreat ?? 1.6, surf.period ?? 7.5, surf.foamWidth ?? .2)}, uFoam:{value:new THREE.Vector3(surf.foamScale ?? 2.0,surf.foamIntensity ?? .95,surf.portFoam ?? .68)}, uFoamColor:{value:new THREE.Color(surf.foamColor ?? '#edf7f2')}, uMotion:{value:new THREE.Vector4(surf.foamDrift ?? .45,surf.foamLifetime ?? 2.4,surf.causticSpeed ?? .35,surf.waveSpacing ?? 9)} },
    transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float depth; attribute float shore; attribute float beachWash; attribute float swellGrid;
      varying float vDepth; varying float vShore; varying vec2 vW;
      varying float vBeachWash;
      uniform sampler2D uContacts; uniform vec4 uContactBounds; uniform vec4 uContact;
      ${SEA_SWELL_GLSL}
      void main(){
        vBeachWash=beachWash;vDepth=depth;vShore=shore;
        vec4 wp=modelMatrix*vec4(position,1.0);vW=wp.xz;
        vec2 uv=(vW-uContactBounds.xy)/uContactBounds.zw;
        float valid=step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0);
        vec4 contact=texture2D(uContacts,uv);
        float distance=mix(uContact.x,(contact.r-.5)*uContact.x*2.0,valid);
        float mask=smoothstep(.25,1.2,depth)*smoothstep(.6,2.8,shore)
          *smoothstep(.15,.85,distance)*mix(1.0,.35+.65*contact.a,valid);
        // The terrain film and solid waterlines stay joined. Far four-corner
        // filler planes get slope shading only, avoiding giant tilted quads.
        wp.y+=seaSwell(vW).x*mask*swellGrid;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFoam; uniform vec3 uFoamColor; uniform sampler2D uContacts; uniform vec4 uContactBounds; uniform vec4 uContact;
      varying float vDepth; varying float vShore; varying vec2 vW; varying float vBeachWash;
      ${SEA_SWELL_GLSL}
      ${NOISE_GLSL}
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
        vec2 contactUV=(vW-uContactBounds.xy)/uContactBounds.zw;
        float contactValid=step(0.0,contactUV.x)*step(0.0,contactUV.y)*step(contactUV.x,1.0)*step(contactUV.y,1.0);
        vec4 contactData=texture2D(uContacts,contactUV);
        float contactD=mix(uContact.x,(contactData.r-.5)*uContact.x*2.0,contactValid);
        if(contactD < -uContact.w*.15)discard;
        vec2 contactNormal=contactData.gb*2.0-1.0;
        contactNormal/=max(length(contactNormal),.001);
        float exposure=mix(1.0,contactData.a,contactValid);
        float cycle=seaPhase(coast+normal*uSurf.y);
        float surge=.5-.5*cos(cycle);
        float edge=mix(uSurf.y,-uSurf.x,surge)+sin(vW.x*.34+uTime*.25)*.16;
        edge=mix(0.0,edge,vBeachWash);
        float behind=vShore-edge;
        if(behind < -.14) discard;
        float cover=smoothstep(-.14,.12,behind);
        float d=max(0.0,vDepth);
        vec3 col=mix(vec3(.22,.48,.46),vec3(.10,.34,.41),smoothstep(0.0,2.5,d));
        col=mix(col,vec3(.06,.24,.34),smoothstep(2.0,7.0,d));
        float drift=vnoise(vW*.18+vec2(uTime*.025,-uTime*.07));
        col+=(drift-.5)*.035;
        // Broad lit and shaded water faces show the swell volume. Neither the
        // second swell nor its specular reflection is classified as white foam.
        vec3 swell=seaSwell(vW);
        float swellMask=smoothstep(.25,1.2,d)*smoothstep(.6,2.8,vShore)
          *smoothstep(.15,.85,contactD)*(.35+.65*exposure);
        vec3 waterNormal=normalize(vec3(-swell.y*swellMask,1.0,-swell.z*swellMask));
        float face=dot(waterNormal,normalize(vec3(-.4,.55,.7)))-.55;
        col+=vec3(.13,.19,.18)*face*uSwell.w;
        col=max(col,vec3(.015,.035,.045));
        float reflection=smoothstep(.04,.18,swell.z*swellMask)
          *(.55+.45*sin(vW.x*.43+vW.y*.18-uTime*.32));
        col=mix(col,vec3(.22,.48,.51),reflection*.30);
        // Submerged light ripples deform independently and softly ebb in brightness.
        // They never remain a crisp, world-fixed grid on top of the water.
        if(d<3.0){
          vec2 lightP=vW*.28+vec2(uTime*.035,-uTime*.06);
          lightP+=vec2(sin(vW.y*.31+uTime*.47),cos(vW.x*.28-uTime*.39))*.65;
          vec2 lightCell=foamCell(lightP,uTime*uMotion.z,0.0);
          float caustic=1.0-smoothstep(.015,.13,abs(lightCell.x-.39));
          float lightPulse=.5+.5*sin(uTime*.8+vW.x*.16+vW.y*.11);
          col+=vec3(.022,.035,.028)*caustic*lightPulse*(1.0-smoothstep(.0,3.0,d));
        }
        float jag=(vnoise(coast*1.6+vec2(uTime*.28,-uTime*.19))-.5)*.16;
        float rim=1.0-smoothstep(uSurf.w,uSurf.w+.07,abs(behind+jag));
        float foam=0.0,softFoam=0.0;
        if(vShore<65.0){
          float turns=cycle/6.2831853,swashAge=fract(turns),generation=floor(turns);
          float build=smoothstep(.04,.22,swashAge);
          float drain=1.0-smoothstep(.48,.84,swashAge);
          float sheetWidth=mix(.35,2.5,smoothstep(.06,.38,swashAge));
          // Swash material follows the moving edge, then stretches and dissolves
          // during drainage. The next patch is reseeded only while it is invisible.
          vec2 swashP=(vW-normal*edge)*uFoam.x;
          swashP+=normal*swashAge*uMotion.x;
          vec2 sheet=foamSheet(swashP,swashAge*uSurf.z,generation,uSurf.z*.88);
          float trail=smoothstep(.04,.22,behind)*(1.0-smoothstep(sheetWidth*.5,sheetWidth,behind));
          float broken=smoothstep(.17,.55,vnoise(swashP*.7+generation*8.3));
          float wash=rim*(.35+.60*build)*drain*mix(.40,1.0,broken)
                     +sheet.x*trail*build*drain;
          float washMist=sheet.y*trail*build*drain;
          // Beach foam belongs to the shallow swash, never to a following
          // offshore swell. Drainage removes the rim before the next arrival.
          float shoreWash=(1.0-smoothstep(.2,1.25,vShore))*vBeachWash;
          foam=wash*shoreWash*uFoam.y*cover;
          softFoam=washMist*.42*shoreWash*cover;
        }
        {
          // A wave reaches the actual waterline of a hull/pile/rock/wall first.
          // Foam blooms there, spreads along its contour, and decays after impact.
          if(contactD<uContact.x-.03){
            vec2 hit=vW-contactNormal*max(0.0,contactD);
            float hitCoord=seaPhase(hit)/6.2831853;
            float impactAge=fract(hitCoord)*uSurf.z;
            float impact=smoothstep(.0,.16,impactAge)*(1.0-smoothstep(.45,uMotion.y,impactAge));
            float spread=uContact.y*(.28+1.8*smoothstep(.0,.9,impactAge));
            float band=1.0-smoothstep(spread*.20,spread,max(0.0,contactD));
            float incidence=.20+.80*max(0.0,contactNormal.y);
            vec2 collisionFoam=foamSheet((hit+contactNormal*contactD*.5)*uFoam.x,impactAge,floor(hitCoord),uMotion.y);
            float contactRim=(1.0-smoothstep(.025,.11,max(0.0,contactD)))*.42;
            // A short return ripple travels outward from the struck contour;
            // the exposed face reflects more strongly than the sheltered side.
            float returnFront=impactAge*.65;
            float reflected=(1.0-smoothstep(.025,.11,abs(contactD-returnFront)))*impact*incidence*sqrt(exposure);
            col=mix(col,vec3(.28,.52,.51),reflected*.55);
            float collision=(contactRim+collisionFoam.x*band)*impact*incidence*sqrt(exposure)*uContact.z;
            foam=max(foam,collision*cover);
            softFoam=max(softFoam,collisionFoam.y*band*impact*.20*cover);
          }
        }
        // A pale teal bed separates foam holes from the darker water, with
        // cream-white membranes and broken leading crests rather than stripes.
        col=mix(col,vec3(.41,.67,.61),softFoam*.40);
        col=mix(col,uFoamColor,clamp(foam,0.0,1.0));
        float alpha=mix(.22,.86,smoothstep(-1.0,5.0,vShore))*cover;
        alpha=max(alpha,mix(.72,0.0,vBeachWash)*cover);
        alpha=max(alpha,foam*.94);
        gl_FragColor=vec4(col,alpha);
        #include <colorspace_fragment>
      }`,
  });
  material.userData.waterContact={sections:contacts.sections,segments:contacts.segments,texel:contacts.texel};
  ownContactTexture(material,contacts.texture);
  return material;
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float depth; attribute float along;
      varying float vDepth; varying float vAlong; varying vec2 vW;
      void main(){ vDepth = depth; vAlong = along; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vDepth; varying float vAlong; varying vec2 vW;
      ${NOISE_GLSL}
      void main(){
        float d = vDepth + (vnoise(vW * 1.3 + uTime * 0.4) - 0.5) * 0.06;
        if (d <= 0.0) discard;
        vec3 deep = vec3(0.09, 0.27, 0.31);
        vec3 mid = vec3(0.19, 0.43, 0.41);
        vec3 shallow = vec3(0.37, 0.54, 0.43);
        vec3 col = mix(shallow, mid, smoothstep(0.05, 0.45, d));
        col = mix(col, deep, smoothstep(0.5, 1.2, d));
        // flowing streaks (rivers) and ripples (ponds)
        float s = vnoise(vec2(vW.x * 2.4 + vW.y*.2 - uTime * .7, vW.y * 0.55));
        col = mix(col, vec3(0.80, 0.95, 1.0), step(0.83, s) * 0.30 * smoothstep(0.2, 0.6, d));
        // sun glints
        float g = vnoise(vW * 2.6 + vec2(uTime * 0.7, -uTime * 0.5));
        col = mix(col, vec3(1.0), step(0.92, g) * 0.6);
        // foam along the shore
        float foam = 1.0 - smoothstep(0.015, 0.065 + 0.012 * sin(uTime * 1.4 + vW.x), d);
        float ribbon=(1.0-smoothstep(.016,.032,abs(d-(.27+.035*sin(vW.x*1.2+vW.y*.7-uTime*.8)))))*step(.40,vnoise(vW*.6));
        col=mix(col,vec3(.7,.88,.82),ribbon*.38);
        col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.9);
        float a = mix(0.38, 0.87, smoothstep(0.0, 0.8, d));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** River strip + ponds at the water level; depth comes from the heightfield. */
export function createWater(world, scenery = null) {
  const group = new THREE.Group();
  const mat = waterMaterial();
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
    const cols = 12;
    const pos = [];
    const depth = [];
    const along = [];
    const idx = [];
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
        pos.push(x, wl, z);
        depth.push(wl - hY(x, z));
        along.push(acc);
      }
    }
    for (let i = 0; i < dense.length - 1; i++)
      for (let c = 0; c < cols; c++) {
        const a = i * (cols + 1) + c;
        const b2 = a + cols + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    group.add(waterMesh(pos, depth, along, idx, mat));
  }
  for (const [px, pz, pr] of world.data.ponds || []) {
    const segs = 40;
    const rings = 8;
    const R = pr + 1.6;
    const pos = [];
    const depth = [];
    const along = [];
    const idx = [];
    for (let r = 0; r <= rings; r++)
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = (r / rings) * R;
        const x = px + Math.sin(a) * rr;
        const z = pz + Math.cos(a) * rr;
        pos.push(x, wl, z);
        depth.push(wl - hY(x, z));
        along.push(a * pr);
      }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segs; s++) {
        const a = r * (segs + 1) + s;
        const b2 = a + segs + 1;
        idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
      }
    group.add(waterMesh(pos, depth, along, idx, mat));
  }
  const sea = world.data.sea;
  if (sea) {
    const seaMat = seaMaterial(world,bakeWaterContact(world,scenery));
    // Match the terrain grid so the thin film cannot cut through sand at coarse triangle edges.
    // Cull in tiles; only the few swash tiles in the camera view reach the GPU.
    const hf = world.heightfield;
    const x0 = hf.ox;
    const x1 = hf.ox + (hf.w - 1) * hf.res;
    const zMin = hf.oz + Math.floor((Math.min(...sea.shore.map((p) => p[1])) - 6 - hf.oz) / hf.res) * hf.res;
    const z1 = Math.max(...sea.shore.map((p) => p[1])) + 40;
    const step = hf.res;
    const nx = Math.ceil((x1 - x0) / step);
    const nz = Math.ceil((z1 - zMin) / step);
    for(let tj=0;tj<nz;tj+=TILE) for(let ti=0;ti<nx;ti+=TILE) {
    const cw=Math.min(TILE,nx-ti),ch=Math.min(TILE,nz-tj);
    const pos = [], depth = [], along = [], shore = [], washMask = [], idx = [];
    for (let j = 0; j <= ch; j++)
      for (let i = 0; i <= cw; i++) {
        const x = x0 + (ti+i) * step;
        const z = zMin + (tj+j) * step;
        const c = world.coastAt(x, z);
        const shoreD = -c.distance;
        // Only beaches carry the thin film over terrain. Port water uses the
        // level base plane; the shader lifts open water and pins solid joins.
        pos.push(x, c.kind==='beach' ? Math.max(wl + .015, hY(x,z) + .025) : wl+.015, z);
        depth.push(wl - hY(x, z));
        along.push(x * 0.2);
        shore.push(shoreD); washMask.push(c.kind === 'beach' ? 1 : 0);
      }
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < cw; i++) {
        const a = j * (cw + 1) + i;
        const b2 = a + cw + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    const wash = waterMesh(pos, depth, along, idx, seaMat, shore, washMask);
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
  return group;
}

function waterMesh(pos, depth, along, idx, mat, shore = null, washMask = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  if(shore) { g.setAttribute('shore',new THREE.Float32BufferAttribute(shore,1)); g.setAttribute('beachWash',new THREE.Float32BufferAttribute(washMask || shore.map(() => 1),1)); g.setAttribute('swellGrid',new THREE.Float32BufferAttribute(shore.map(() => pos.length>12 ? 1 : 0),1)); }
  g.setIndex(idx);
  g.computeBoundingSphere();
  if(mat.uniforms.uSwell)g.boundingSphere.radius+=Math.abs(mat.uniforms.uSwell.value.x)*1.18+Math.abs(mat.uniforms.uSwell.value.y);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 1;
  return m;
}
