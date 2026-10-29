// The giant clam that keeps a pearl (reference: docs/reference/giant-clam-pearl.png), rebuilt from
// that one picture with the img2threejs staged review (blockout -> structure -> form -> material,
// each compared with the reference): two hinged valves fanned into five radial folds whose lips
// zigzag, a lavender nacre band inside, cream crests and pale teal furrows outside, barnacles and
// coral sprigs, folded peach flesh in the cup and an iridescent pearl. Cel-shaded like the game.
// Metres; front (the gape) faces +Z; it rests on y = 0. The lid opens about the hinge at the back.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonRamp, outlineMaterial } from '../toon.js';

const FAN = 1.05;   // half the folds' spread from the hinge (rad)
const HINGE_HALF = 0.55; // the hinge is a line across the back, not a point: the folds run nearly parallel
const REACH = 0.82; // hinge to lip at the middle (m)
const FOLDS = 5;    // radial folds across each valve
const HINGE_Z = -0.4;

const C = (hex) => new THREE.Color(hex); // sRGB in, linear out (vertex colours are linear)
const CREAM = C('#ece6d2'), TEAL = C('#6aa0b2'), NACRE = C('#dac7ea'), NACRE_DEEP = C('#c2acd8'), LIP = C('#e6d8f0');
const FLESH = C('#ecc6b8'), CREASE = C('#c4917f'), BARNACLE = C('#a49e90'), CORAL = C('#cf6b52');

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const s = Math.sin(n * 91.345 + 47.13) * 43758.5453; return s - Math.floor(s); };

/** A point on a valve. u across the fan (0..1), v from the hinge (0) to the lip (1); dir +1 lid, -1 cup. */
function valvePoint(u, v, dir, inset = 0) {
  const th = (u - 0.5) * 2 * FAN;
  // +1 on a fold's crest: rounded lobes with narrow furrows between them, as on the reference
  const wave = Math.cos(Math.PI * FOLDS * (u - 0.5));
  const rib = 1 - 2 * Math.pow(1 - (wave + 1) / 2, 1.6);
  const edge = Math.abs(th / FAN);
  const reach = REACH * (1 - 0.2 * edge ** 4) * (1 + 0.035 * rib * v); // scalloped outline from above
  const r = reach * v * (1 - inset * 0.6);
  // deepest a third of the way out; the back stays tall so the valves close over the hinge
  const dome = (dir > 0 ? 0.66 : 0.46) * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.75)), 0.7)) * Math.pow(1 - 0.9 * edge * edge, 0.5) * (1 - 0.3 * smooth(0.85, 1, v)); // a broad round arch seen from the front
  // the folds are rounded lobes on the dome and only a gentle wave at the lip
  const fold = (0.13 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.15)), 0.6) + 0.045 * v) * rib;
  const y = dir * (Math.max(0, dome - inset) + fold * (1 - inset * 2));
  const along = (u - 0.5) * 2 * HINGE_HALF * Math.pow(1 - 0.25 * v, 1);
  return { x: (along + r * Math.sin(th) * 0.78) * 1.12, y, z: HINGE_Z + r * Math.cos(th), rib, th };
}

function gridGeometry(nu, nv, at, colour, flip = false) {
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = at(i / nu, j / nv);
      pos.push(p.x, p.y, p.z);
      const c = colour(i / nu, j / nv, p);
      col.push(c.r, c.g, c.b);
    }
  }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** One valve: the outer shell, the nacre inside and the thick lip between them. */
function valveGeometry(dir) {
  const NU = 80, NV = 22, T = 0.05;
  const outerCol = (u, v, p) => {
    // pale teal in the furrows and along the lip, cream on the crests, a dry-brush zigzag between
    const jag = 0.22 * Math.sin(v * 46 + u * 9) + 0.12 * Math.sin(v * 97 + u * 31);
    const t = smooth(0.15, -0.55, p.rib + jag) * smooth(0.2, 0.55, v) + 0.35 * smooth(0.82, 1, v) * smooth(0.6, -0.2, p.rib + jag);
    return CREAM.clone().lerp(TEAL, Math.min(1, t));
  };
  const innerCol = (u, v) => NACRE_DEEP.clone().lerp(NACRE, smooth(0.35, 0.9, v));
  const outer = gridGeometry(NU, NV, (u, v) => valvePoint(u, v, dir), outerCol, dir < 0);
  const inner = gridGeometry(NU, NV, (u, v) => valvePoint(u, v * 0.985, dir, T), innerCol, dir > 0);
  // the lip: a band from the outer edge to the inner edge
  const lip = gridGeometry(NU, 1, (u, k) => valvePoint(u, k ? 0.985 : 1, dir, k ? T : 0), () => LIP, dir > 0);
  return mergeGeometries([outer, inner, lip]);
}

function mantleGeometry() {
  // the soft flesh filling the cup: a low mound inside the lip with radial wavy folds
  const at = (u, v) => {
    const p = valvePoint(0.04 + u * 0.92, v * 0.9, -1, 0.07);
    const th = (u - 0.5) * 2 * FAN;
    const wave = 0.045 * Math.sin(th * 13 + v * 5 + Math.sin(th * 4) * 1.5) * smooth(0.2, 0.75, v);
    const mound = 0.33 * Math.pow(Math.sin(Math.PI * Math.min(1, v / 0.9)), 0.8) * (1 - 0.4 * (th / FAN) ** 2);
    return { x: p.x, y: Math.max(p.y, -0.32) * 0.55 + mound + wave - 0.02, z: p.z, wave };
  };
  return gridGeometry(64, 14, at, (u, v, p) => FLESH.clone().lerp(CREASE, smooth(0.0, -0.03, p.wave) * 0.8), false);
}

function pearlGeometry(r) {
  // iridescence painted into the colours: cyan, lavender and pink sheen bands around a white core
  const g = new THREE.IcosahedronGeometry(r, 4);
  const n = g.attributes.position, col = [], v = new THREE.Vector3();
  const bands = [C('#f2eef4'), C('#7fe0ea'), C('#c39cf0'), C('#f0a9cc'), C('#f2eef4')];
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i).normalize();
    const t = (Math.atan2(v.y + 0.3 * v.x, v.z) / Math.PI + 1) * 0.9 + v.x * 0.5 + 0.15 * Math.sin(v.y * 5);
    const k = ((t % 1) + 1) % 1 * (bands.length - 1), a = Math.floor(k);
    const c = bands[a].clone().lerp(bands[a + 1], k - a).lerp(C('#ffffff'), 0.7 * smooth(0.6, 0.98, v.z * 0.6 + v.y * 0.55 - v.x * 0.3));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function placed(geo, p, normal, s, spin) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  return geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(s, s, s)));
}

function surfaceNormal(u, v, dir) {
  const e = 0.004, a = valvePoint(u, v, dir), b = valvePoint(u + e, v, dir), c = valvePoint(u, v + e, dir);
  const n = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).cross(new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z)).normalize();
  return n.y * dir < 0 ? n.negate() : n;
}

function tinted(geo, colour) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const col = [];
  for (let i = 0; i < g.attributes.position.count; i++) col.push(colour.r, colour.g, colour.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Barnacles (low ringed cones) and coral sprigs (forked twigs) on a valve's outer face. */
function encrustation(dir, barnacles, sprigs) {
  const parts = [];
  for (const [u, v, s] of barnacles) {
    const p = valvePoint(u, v, dir), n = surfaceNormal(u, v, dir);
    const cone = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2); // a low dome
    cone.scale(1, 0.45, 1);
    parts.push(tinted(placed(cone, p, n, s, hash(u * 7 + v) * 6), BARNACLE));
  }
  for (const [u, v, s] of sprigs) {
    const p = valvePoint(u, v, dir), n = surfaceNormal(u, v, dir);
    for (const [ax, az, len, lean] of [[0, 0, 1, 0], [0.45, 0, 0.6, 0.7], [-0.4, 0.2, 0.55, -0.8]]) {
      const twig = new THREE.CylinderGeometry(0.05, 0.08, len, 5);
      twig.translate(0, len / 2, 0);
      twig.rotateZ(lean);
      twig.translate(ax * 0.35, ax ? 0.45 : 0, az * 0.35);
      parts.push(tinted(placed(twig, p, n, s, hash(u + v * 3) * 6), CORAL));
    }
  }
  return parts;
}

/**
 * The clam as a Group: nodes {cup, lidPivot, lid, mantle, pearl} and sockets {pearl}. open(t) sets
 * the lid (0 shut, 1 the reference's ~29 degrees). Shared materials; geometry is the caller's to dispose.
 */
export function buildGiantClam({ outline = true } = {}) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const pearlMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), emissive: C('#b9a8e8'), emissiveIntensity: 0.18 });
  const edge = outline ? outlineMaterial('#3a3046', 0.012) : null;
  const root = new THREE.Group();
  root.name = 'giant-clam';
  const mesh = (geo, m, name) => {
    const g = new THREE.Group();
    g.name = name;
    const body = new THREE.Mesh(geo, m);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    if (edge) g.add(new THREE.Mesh(geo, edge));
    return g;
  };
  // the cup rests on its belly: lift it so its lowest point touches the ground
  const cupGeo = mergeGeometries([valveGeometry(-1), ...encrustation(-1, [[0.2, 0.75, 0.06], [0.83, 0.68, 0.05], [0.62, 0.85, 0.045]], [[0.1, 0.8, 0.13]])].map((g) => (g.index ? g.toNonIndexed() : g)));
  cupGeo.computeBoundingBox();
  const lift = -cupGeo.boundingBox.min.y;
  const cup = mesh(cupGeo, mat, 'cup');
  root.add(cup);
  const mantle = mesh(mantleGeometry(), mat, 'mantle');
  root.add(mantle);
  const pearlR = 0.27;
  const pearl = mesh(pearlGeometry(pearlR), pearlMat, 'pearl');
  pearl.position.set(0.03, 0.08 + pearlR * 0.8, 0.12);
  root.add(pearl);
  const lidPivot = new THREE.Group();
  lidPivot.name = 'lidPivot';
  lidPivot.position.set(0, 0, HINGE_Z);
  const lidGeo = mergeGeometries([valveGeometry(1), ...encrustation(1,
    [[0.46, 0.55, 0.07], [0.55, 0.42, 0.05], [0.33, 0.62, 0.06], [0.68, 0.6, 0.065], [0.24, 0.45, 0.045], [0.6, 0.75, 0.05], [0.78, 0.5, 0.04], [0.4, 0.8, 0.045]],
    [[0.06, 0.62, 0.15], [0.94, 0.6, 0.14]])].map((g) => (g.index ? g.toNonIndexed() : g)));
  lidGeo.translate(0, 0, -HINGE_Z);
  const lid = mesh(lidGeo, mat, 'lid');
  lidPivot.add(lid);
  root.add(lidPivot);
  // the hinge ligament closes the back where the two valves meet
  const ligament = mesh(tinted(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10).rotateZ(Math.PI / 2), C('#8a7a70')), mat, 'hinge');
  ligament.position.set(0, 0.03, HINGE_Z + 0.05);
  root.add(ligament);
  for (const o of [cup, mantle, pearl, lidPivot, ligament]) o.position.y += lift;
  const open = (t) => { lidPivot.rotation.x = -0.5 * t; };
  open(1);
  root.userData.nodes = { cup, lidPivot, lid, mantle, pearl };
  root.userData.sockets = { pearl };
  root.userData.open = open;
  return root;
}
