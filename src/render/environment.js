// Trees, rocks, town, ruins, bridge and small decoration, drawn from the shared layout.
// Heavy repeated props use InstancedMesh so the demo stays light on iPad.
import * as THREE from 'three';
import { toon, outlineMaterial, outlined, darker, seeThrough } from './toon.js';
import { createRng } from '../core/rng.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

/** Outline hull shader + see-through, for canopies (clone() drops onBeforeCompile). */
function seeThroughOutline(width) {
  const m = seeThrough(new THREE.MeshBasicMaterial());
  const see = m.onBeforeCompile;
  return (shader, r) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
    see(shader, r);
  };
}

const CHUNK = 22; // metres; each chunk is its own InstancedMesh so frustum culling skips off-screen props

function instanced(geo, mat, list, { shadow = true, outline = null, outlineWidth = 0.03, see = false } = {}) {
  const group = new THREE.Group();
  if (!list.length) return group;
  const chunks = new Map();
  for (const it of list) {
    const k = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push(it);
  }
  const colors = list.some((i) => i.color !== undefined);
  let hullMat = outline ? outlineMaterial(outline, outlineWidth) : null;
  if (see && hullMat) {
    hullMat = seeThrough(hullMat.clone());
    hullMat.onBeforeCompile = seeThroughOutline(outlineWidth);
  }
  for (const items of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
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
    if (hullMat) {
      const hull = new THREE.InstancedMesh(geo, hullMat, items.length);
      hull.instanceMatrix.copy(mesh.instanceMatrix);
      hull.instanceMatrix.needsUpdate = true;
      hull.computeBoundingSphere();
      group.add(hull);
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

export function createEnvironment(world) {
  const root = new THREE.Group();
  const rng = createRng(99);

  // ----- trees: trunk + clustered round canopy (like the reference) -----
  const trunks = [];
  const canopy = [];
  const willowLeaves = [];
  const greens = ['#5daa3c', '#4f9d37', '#6ab646', '#58a841'];
  for (const c of world.circles) {
    if (c.type !== 'tree' && c.type !== 'willow') continue;
    const s = c.scale * 0.85;
    trunks.push({ x: c.x, z: c.z, y: 0, s: 1, sx: s, sy: s * (c.type === 'willow' ? 1.1 : 1), sz: s, ry: c.rot });
    const zone = world.zoneAt(c.x);
    const hueShift = zone.id === 'forest' ? -0.06 : zone.id === 'ruins' ? 0.04 : 0;
    const blobs = c.type === 'willow' ? 3 : 4 + (rng.next() < 0.5 ? 1 : 0);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + c.rot;
      const r = i === 0 ? 0 : 0.95 * s;
      const col = new THREE.Color(rng.pick(greens));
      col.offsetHSL(hueShift * 0.3, 0, hueShift);
      canopy.push({
        x: c.x + Math.sin(a) * r * 0.9,
        z: c.z + Math.cos(a) * r * 0.9,
        y: (i === 0 ? 3.9 : 3.1 + rng.range(-0.2, 0.4)) * s,
        s: (i === 0 ? 1.55 : 1.25) * s * rng.range(0.9, 1.1),
        sy: (i === 0 ? 1.35 : 1.05) * s,
        ry: rng.range(0, 6),
        color: `#${col.getHexString()}`,
      });
    }
    if (c.type === 'willow') willowLeaves.push({ x: c.x, z: c.z, y: 2.2 * s, s: 1.6 * s, sy: 1.3 * s, ry: c.rot, color: '#6fb56a' });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 7);
  trunkGeo.translate(0, 1.6, 0);
  root.add(instanced(trunkGeo, toon('#7a5236'), trunks, { outline: '#3b2618', outlineWidth: 0.05 }));
  const canopyGeo = blobGeometry(1, 3, 0.06);
  root.add(instanced(canopyGeo, seeThrough(toon('#ffffff', { unique: true })), canopy, { outline: '#2f5a24', outlineWidth: 0.05, see: true }));
  const willowGeo = new THREE.ConeGeometry(1, 2.4, 9, 1, true);
  root.add(instanced(willowGeo, toon('#ffffff', { side: THREE.DoubleSide }), willowLeaves, { shadow: true }));

  // ----- rocks -----
  const rocks = [];
  for (const c of world.circles) if (c.type === 'rock') rocks.push({ x: c.x, z: c.z, y: c.scale * 0.35, s: c.scale, sy: c.scale * 0.72, ry: c.rot, color: rng.pick(['#a6a8ad', '#9a9ca3', '#b3b4b8']) });
  root.add(instanced(blobGeometry(0, 7, 0.18), toon('#ffffff'), rocks, { outline: '#4d4f58', outlineWidth: 0.04 }));

  // ----- ruins -----
  const pillars = [];
  const broken = [];
  const blocks = [];
  for (const c of world.circles) {
    if (c.type === 'pillar') pillars.push({ x: c.x, z: c.z, s: c.scale, ry: c.rot });
    if (c.type === 'pillar_broken') broken.push({ x: c.x, z: c.z, s: c.scale, ry: c.rot, rz: 0.08 });
    if (c.type === 'ruin_block') blocks.push({ x: c.x, z: c.z, y: c.scale * 0.45, s: c.scale, sy: c.scale * 0.8, ry: c.rot, rz: rng.range(-0.15, 0.15) });
  }
  const pillarGeo = pillarGeometry(4.6);
  const brokenGeo = pillarGeometry(2.1, true);
  const ruinMat = toon('#c9c3d4');
  root.add(instanced(pillarGeo, ruinMat, pillars, { outline: '#4e4760', outlineWidth: 0.04 }));
  root.add(instanced(brokenGeo, ruinMat, broken, { outline: '#4e4760', outlineWidth: 0.04 }));
  const blockGeo = new THREE.BoxGeometry(1.6, 1.1, 1.3);
  root.add(instanced(blockGeo, toon('#b9b2c6'), blocks, { outline: '#4e4760', outlineWidth: 0.04 }));
  // glowing rune stone at the centre of the arena
  const rc = world.data.ruins.centre;
  const altar = outlined(new THREE.CylinderGeometry(1.6, 1.9, 0.5, 8), toon('#a79fbd'), { outline: '#4e4760', width: 0.04 });
  altar.position.set(rc[0] + 6, 0.25, rc[1] - 6);
  root.add(altar);

  // ----- bridge -----
  root.add(createBridge(world.bridgeBox));

  // ----- town -----
  root.add(createTown(world, rng));

  // ----- decoration -----
  const d = world.decor;
  const bladeGeo = grassTuftGeometry();
  root.add(
    instanced(
      bladeGeo,
      toon('#ffffff', { side: THREE.DoubleSide }),
      d.grass.map((g) => ({ x: g.x, z: g.z, ry: g.rot, s: g.s, color: grassTint(world.zoneAt(g.x).id, g.s) })),
      { shadow: false }
    )
  );
  const flowerGeo = flowerGeometry();
  const flowerCols = ['#fff6d8', '#ffe066', '#f6b0d8', '#c9b8ff'];
  root.add(instanced(flowerGeo, toon('#ffffff'), d.flowers.map((f) => ({ x: f.x, z: f.z, s: f.s, ry: f.x * 3.1, color: flowerCols[f.color] })), { shadow: false }));
  const bushGeo = blobGeometry(1, 11, 0.07);
  const bushes = [];
  for (const bsh of d.bushes) {
    bushes.push({ x: bsh.x, z: bsh.z, y: 0.35 * bsh.s, s: 0.75 * bsh.s, sy: 0.55 * bsh.s, color: '#4f9a36' });
    bushes.push({ x: bsh.x + 0.5 * bsh.s, z: bsh.z + 0.2, y: 0.28 * bsh.s, s: 0.55 * bsh.s, sy: 0.45 * bsh.s, color: '#5caa3e' });
  }
  root.add(instanced(bushGeo, toon('#ffffff'), bushes, { outline: '#2f5a24', outlineWidth: 0.05 }));
  const reedGeo = new THREE.ConeGeometry(0.05, 1.2, 4);
  reedGeo.translate(0, 0.6, 0);
  const reeds = [];
  for (const r of d.reeds) for (let k = 0; k < 3; k++) reeds.push({ x: r.x + Math.sin(k * 2.1) * 0.2, z: r.z + Math.cos(k * 2.1) * 0.2, s: r.s, rz: Math.sin(k + r.rot) * 0.15, color: k === 1 ? '#7a9b3c' : '#5f8a35' });
  root.add(instanced(reedGeo, toon('#ffffff'), reeds, { shadow: false }));
  const lilyGeo = new THREE.CircleGeometry(0.4, 10, 0.3, Math.PI * 1.8);
  lilyGeo.rotateX(-Math.PI / 2);
  root.add(instanced(lilyGeo, toon('#5aa640'), d.lilies.map((l) => ({ x: l.x, z: l.z, y: 0.08, s: l.s, ry: l.rot })), { shadow: false }));

  // fences + lanterns
  const posts = [];
  const rails = [];
  for (const f of d.fences) {
    const dx = Math.sin(f.angle);
    const dz = Math.cos(f.angle);
    for (const k of [-0.5, 0.5]) posts.push({ x: f.x + dx * f.len * k, z: f.z + dz * f.len * k, ry: f.angle });
    for (const h of [0.55, 1.0]) rails.push({ x: f.x, z: f.z, y: h, ry: f.angle, sz: f.len });
  }
  const postGeo = new THREE.BoxGeometry(0.22, 1.35, 0.22);
  postGeo.translate(0, 0.67, 0);
  root.add(instanced(postGeo, toon('#8a5c3a'), posts, { outline: '#3b2618', outlineWidth: 0.03 }));
  const railGeo = new THREE.BoxGeometry(0.1, 0.12, 1);
  root.add(instanced(railGeo, toon('#9b6a44'), rails, { outline: '#3b2618', outlineWidth: 0.02 }));
  for (const l of d.lanterns) root.add(lantern(l.x, l.z));

  return root;
}

function grassTint(zone, s) {
  const base = { settlement: '#86c24e', meadow: '#8fcb4c', forest: '#5ea73a', wetland: '#5aa85f', ruins: '#8fae5f' }[zone] || '#86c24e';
  const c = new THREE.Color(base);
  c.offsetHSL(0, 0, (s - 1) * 0.08);
  return `#${c.getHexString()}`;
}

function grassTuftGeometry() {
  const pos = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.12;
    const bx = Math.sin(a) * r;
    const bz = Math.cos(a) * r;
    const h = 0.35 + (i % 2) * 0.15;
    const lean = 0.18;
    const px = -Math.cos(a) * 0.05;
    const pz = Math.sin(a) * 0.05;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.sin(a) * lean, h, bz + Math.cos(a) * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // point normals up so blades shade like the ground
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
}

function flowerGeometry() {
  const g = new THREE.IcosahedronGeometry(0.11, 0);
  g.scale(1, 0.6, 1);
  g.translate(0, 0.22, 0);
  return g;
}

function pillarGeometry(h, broken = false) {
  const parts = [];
  const base = new THREE.BoxGeometry(1.5, 0.4, 1.5);
  base.translate(0, 0.2, 0);
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

/** Minimal geometry merge (position + normal), enough for static props. */
export function mergeGeometries(geos) {
  const pos = [];
  const nrm = [];
  for (let g of geos) {
    g = g.index ? g.toNonIndexed() : g;
    g.computeVertexNormals();
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

function createBridge(box) {
  const g = new THREE.Group();
  g.position.set(box.x, 0, box.z);
  g.rotation.y = box.angle;
  const plankMat = toon('#a8744a');
  const n = Math.round((box.hx * 2) / 0.55);
  for (let i = 0; i < n; i++) {
    const p = outlined(new THREE.BoxGeometry(0.5, 0.18, box.hz * 2), i % 2 ? plankMat : toon('#9a6a42'), { outline: '#4a2e1a', width: 0.02 });
    const x = -box.hx + 0.28 + i * 0.55;
    p.position.set(x, 0.32 + Math.cos((x / box.hx) * 1.4) * 0.25, 0);
    g.add(p);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const x = -box.hx + (i / 4) * box.hx * 2;
      const post = outlined(new THREE.BoxGeometry(0.2, 1.1, 0.2), toon('#7a5236'), { outline: '#3b2618', width: 0.02 });
      post.position.set(x, 0.8 + Math.cos((x / box.hx) * 1.4) * 0.25, side * (box.hz - 0.1));
      g.add(post);
    }
    const rail = outlined(new THREE.BoxGeometry(box.hx * 2, 0.12, 0.12), toon('#8a5c3a'), { outline: '#3b2618', width: 0.02 });
    rail.position.set(0, 1.35, side * (box.hz - 0.1));
    g.add(rail);
  }
  return g;
}

function lantern(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
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

function createTown(world, rng) {
  const g = new THREE.Group();
  const roofCols = ['#b8543f', '#4f6fa8', '#8f5a3c', '#5e8a4a'];
  for (const bx of world.boxes) {
    if (bx.type !== 'house') continue;
    g.add(house(bx, rng.pick(roofCols)));
  }
  // workbench: table + anvil + crates
  const t = world.data.town;
  const wb = new THREE.Group();
  wb.position.set(t.workbench[0], 0, t.workbench[1] - 1.6);
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
  const crate = outlined(new THREE.BoxGeometry(0.8, 0.8, 0.8), toon('#b7885a'), { outline: '#3b2618', width: 0.02 });
  crate.position.set(1.9, 0.4, 0.2);
  crate.rotation.y = 0.3;
  wb.add(crate);
  const sign = outlined(new THREE.BoxGeometry(1.2, 0.7, 0.08), toon('#e9d9b0'), { outline: '#3b2618', width: 0.02 });
  sign.position.set(0, 1.9, -0.55);
  wb.add(sign);
  const hammer = outlined(new THREE.BoxGeometry(0.5, 0.12, 0.12), toon('#c9ccd4'), { outline: '#26272c', width: 0.015 });
  hammer.position.set(0.3, 1.12, 0.1);
  hammer.rotation.y = 0.6;
  wb.add(hammer);
  g.add(wb);
  // notice board for the trainer spot
  const board = outlined(new THREE.BoxGeometry(1.8, 1.2, 0.12), toon('#a8744a'), { outline: '#3b2618', width: 0.02 });
  board.position.set(t.trainer[0] - 1.8, 1.5, t.trainer[1] + 0.5);
  g.add(board);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), toon('#f4ecd6'));
  paper.position.set(t.trainer[0] - 1.8, 1.5, t.trainer[1] + 0.57);
  g.add(paper);
  // well in the plaza
  const well = outlined(new THREE.CylinderGeometry(1.1, 1.2, 0.8, 12, 1, true), toon('#b8b2a8', { side: THREE.DoubleSide }), { outline: '#4b4640', width: 0.03 });
  well.position.set(-86, 0.4, -4);
  g.add(well);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12), toon('#4f9fd0'));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-86, 0.55, -4);
  g.add(water);
  return g;
}

function house(bx, roofCol) {
  const g = new THREE.Group();
  g.position.set(bx.x, 0, bx.z);
  g.rotation.y = bx.angle;
  const w = bx.hx * 2 - 0.4;
  const d = bx.hz * 2 - 0.4;
  const walls = outlined(new THREE.BoxGeometry(w, 2.8, d), toon('#efe2c6'), { outline: '#6b5a44', width: 0.03 });
  walls.position.y = 1.4;
  g.add(walls);
  // timber frame
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
  // roof prism
  const roofGeo = new THREE.CylinderGeometry(0.01, (d / 2) * 1.35, w + 0.8, 4, 1);
  const roof = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.6, 0);
  shape.lineTo(0, 1.9);
  shape.lineTo(d / 2 + 0.6, 0);
  shape.lineTo(-d / 2 - 0.6, 0);
  const prism = new THREE.ExtrudeGeometry(shape, { depth: w + 0.7, bevelEnabled: false });
  prism.translate(0, 0, -(w + 0.7) / 2);
  prism.rotateY(Math.PI / 2);
  void roofGeo;
  const roofMesh = outlined(prism, toon(roofCol), { outline: darker(roofCol, 0.4), width: 0.03 });
  roof.add(roofMesh);
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
  return g;
}
