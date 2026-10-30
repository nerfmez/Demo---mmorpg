// Spiral shells and the grotto's big creatures: the giant beach shell that hides the entrance,
// the Pearl Snail on its throne and small decorative shells. One generator (a tube coiling out
// along a growing spiral, like a real shell's growth) makes all of them; its open end is the
// aperture, lined inside with glowing nacre.
import * as THREE from 'three';
import { toon, toonRamp, outlineMaterial } from '../toon.js';
import { nacreTexture } from './textures.js';

/**
 * A coiled shell. Options: turns, r0 (radius at the apex), grow (radius gain per turn, as a
 * factor), coil (centre distance in radii), drop (apex height per radius), ribs (per turn),
 * rib (rib height), spikes (count per turn on the shoulder, 0 = none), colours a/b (bands), lip.
 * Returns {geometry, aperture: {centre, dir, radius}} in shell space.
 */
export function shellGeometry(o = {}) {
  const turns = o.turns ?? 3, r0 = o.r0 ?? 0.08, grow = o.grow ?? 2.4, coil = o.coil ?? 1.05, drop = o.drop ?? 1.4;
  const ribs = o.ribs ?? 9, rib = o.rib ?? 0.06, aspect = o.aspect ?? 1.15;
  const segT = Math.ceil(turns * 46), segP = 22;
  const b = Math.log(grow) / (Math.PI * 2);
  const end = turns * Math.PI * 2;
  const ca = new THREE.Color(o.a ?? '#f4dcc4'), cb = new THREE.Color(o.b ?? '#c97a64'), cin = new THREE.Color(o.inner ?? '#ffe9e4');
  const shoulder = o.shoulder ? new THREE.Color(o.shoulder) : null;
  const suture = Math.atan2(drop, -coil); // where each whorl rests on the one before it
  const pos = [], col = [], idx = [];
  const centre = (th) => { const r = r0 * Math.exp(b * th); return [coil * r * Math.cos(th), -drop * r, coil * r * Math.sin(th), r]; };
  for (let i = 0; i <= segT; i++) {
    const th = (i / segT) * end;
    const [cx, cy, cz, rBase] = centre(th);
    const lip = o.lip ? 1 + o.lip * Math.max(0, (th - end + 0.6) / 0.6) ** 2 : 1;
    const ribK = 1 + rib * Math.max(0, Math.sin(th * ribs)) ** 6;
    const er = [Math.cos(th), 0, Math.sin(th)];
    const band = THREE.MathUtils.smoothstep(0.5 + 0.5 * Math.sin(th * (o.bands ?? 3.3)), 0.35, 0.65); // crisp painted bands
    for (let j = 0; j <= segP; j++) {
      const ph = (j / segP) * Math.PI * 2;
      const cord = 1 + 0.025 * Math.sin(ph * 9);
      let r = rBase * ribK * cord * lip;
      // spikes on the shoulder (the outer upper side of each whorl)
      if (o.spikes) {
        const s = Math.max(0, Math.cos(ph - 0.7)) ** 18 * Math.max(0, Math.sin(th * o.spikes)) ** 10;
        r *= 1 + s * (o.spikeLen ?? 0.7);
      }
      const ex = Math.cos(ph) * aspect, ey = Math.sin(ph);
      pos.push(cx + r * ex * er[0], cy + r * ey, cz + r * ex * er[2]);
      // inner side of the whorl (toward the axis) stays pale, the outer side carries the bands
      const outer = THREE.MathUtils.clamp(Math.cos(ph) * 0.8 + 0.4, 0, 1);
      const c = ca.clone().lerp(cb, band * outer).lerp(cin, (1 - outer) * 0.35);
      // a light spiral cord along the shoulder and a dark suture line make the coil read from afar
      if (shoulder) c.lerp(shoulder, THREE.MathUtils.smoothstep(Math.cos(ph - 0.55), 0.86, 0.96));
      c.multiplyScalar(1 - 0.5 * THREE.MathUtils.smoothstep(Math.cos(ph - suture), 0.9, 0.985));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segT; i++) for (let j = 0; j < segP; j++) {
    const a = i * (segP + 1) + j, b2 = a + segP + 1;
    idx.push(a, a + 1, b2, a + 1, b2 + 1, b2); // outward-facing: the banded outside is the front
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const [ax, ay, az, ar] = centre(end);
  // the opening lies in the plane of the axis and the radius, so it faces along the coil (e_theta)
  const dir = new THREE.Vector3(-Math.sin(end), 0, Math.cos(end));
  return { geometry: g, aperture: { centre: new THREE.Vector3(ax, ay, az), dir, radius: ar * (o.lip ? 1 + o.lip : 1) } };
}

/** A shell mesh: banded outside, glowing nacre inside (seen through the aperture). */
function shellMesh(spec, { nacreGlow = 0.45, outline = '#5a3a40', innerColor = '#ffffff' } = {}) {
  const { geometry, aperture } = shellGeometry(spec);
  const group = new THREE.Group();
  const outside = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: toonRamp() }));
  outside.castShadow = true;
  outside.receiveShadow = true;
  const inside = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color: innerColor, map: nacreTexture(), side: THREE.BackSide, emissive: '#ffd6ea', emissiveIntensity: nacreGlow, gradientMap: toonRamp() }));
  group.add(outside, inside);
  if (outline) {
    const hull = new THREE.Mesh(geometry, outlineMaterial(outline, 0.05));
    group.add(hull);
  }
  group.userData.inside = inside.material;
  return { group, aperture };
}

/**
 * Turn a shell so its aperture faces +z (the prop's facing), resting on the ground, with the
 * aperture centre over the origin. `roll` turns it about its opening; `sink` buries the base.
 */
function orient(group, aperture, { roll = 0, sink = 0.3, tilt = 0 } = {}) {
  const q = new THREE.Quaternion().setFromUnitVectors(aperture.dir, new THREE.Vector3(0, 0, 1));
  const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
  const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
  group.quaternion.copy(qt).multiply(qr).multiply(q);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const a = aperture.centre.clone().multiplyScalar(group.scale.x).applyQuaternion(group.quaternion);
  group.position.set(-a.x, -box.min.y - sink, -a.z);
  const holder = new THREE.Group();
  holder.add(group);
  holder.userData.aperture = { y: a.y - box.min.y - sink, radius: aperture.radius * group.scale.x };
  return holder;
}

/** A small decorative shell (beach, treasure). */
export function buildSmallShell(scale = 0.5, colours = ['#f3d9c0', '#d9866a']) {
  const { group, aperture } = shellMesh({ turns: 3.4, r0: 0.05, grow: 2.3, drop: 1.6, ribs: 10, a: colours[0], b: colours[1], lip: 0.25 }, { nacreGlow: 0.2, outline: '#6a4a3e' });
  const holder = orient(group, aperture, { roll: 0.6, sink: 0.05 });
  holder.scale.setScalar(scale);
  return holder;
}

/**
 * The Pearl Snail: a giant sea snail with a spiked, banded shell, a golden foot, eye stalks
 * that glow and a crown of feelers, guarding a pearl. Static for now (idle breathing and sway);
 * its fight comes when the dungeon joins the game.
 */
export function buildPearlSnail() {
  const root = new THREE.Group();
  root.name = 'pearl-snail';
  const gold = toon('#d9a54e'), goldDark = toon('#a8742e'), eye = toon('#bff6ff', { emissive: '#5fe0ff', emissiveIntensity: 1.2 });
  const outline = outlineMaterial('#4a2e1c', 0.04);
  const withHull = (mesh) => { const g = new THREE.Group(); mesh.castShadow = true; g.add(mesh, new THREE.Mesh(mesh.geometry, outline)); return g; };
  // the foot: a long low body lying along z, spotted
  const footGeo = new THREE.CapsuleGeometry(1.6, 4.4, 6, 14);
  footGeo.rotateX(Math.PI / 2);
  footGeo.scale(1.15, 0.5, 1);
  const spots = new Float32Array(footGeo.attributes.position.count * 3), fp = footGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const s = Math.sin(fp.getX(i) * 3.1) * Math.sin(fp.getZ(i) * 2.3) > 0.55 ? 0.72 : 1;
    const under = fp.getY(i) < -0.2 ? 0.8 : 1;
    spots[i * 3] = spots[i * 3 + 1] = spots[i * 3 + 2] = s * under;
  }
  footGeo.setAttribute('color', new THREE.BufferAttribute(spots, 3));
  const foot = withHull(new THREE.Mesh(footGeo, new THREE.MeshToonMaterial({ color: '#d9a54e', vertexColors: true, gradientMap: toonRamp() })));
  foot.position.set(0, 0.75, -0.2);
  root.add(foot);
  // the neck rising at the front, and the head
  const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.9, 2.4), new THREE.Vector3(0, 1.7, 3.3), new THREE.Vector3(0, 2.5, 3.5), new THREE.Vector3(0, 3.0, 3.2)]);
  const neck = withHull(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.95, 10), gold));
  root.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 3.1, 3.3);
  root.add(head);
  const skull = withHull(new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), gold));
  skull.scale.set(1.25, 0.78, 1.35);
  head.add(skull);
  // eye stalks
  const stalks = [];
  for (const side of [-1, 1]) {
    const stalk = new THREE.Group();
    stalk.position.set(side * 0.55, 0.6, 0.4);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.3, 0.9, 0.2), new THREE.Vector3(side * 0.5, 1.8, 0.5)]);
    stalk.add(withHull(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.16, 6), goldDark)));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), eye);
    orb.position.set(side * 0.5, 1.9, 0.5);
    stalk.add(orb);
    head.add(stalk);
    stalks.push(stalk);
  }
  // a crown of curling golden feelers
  for (let i = 0; i < 4; i++) {
    const a = (i / 3 - 0.5) * 2.2, side = Math.sin(a);
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.6, 0.5, -0.4), new THREE.Vector3(side * 1.0, 0.7, -0.9), new THREE.Vector3(side * 1.2, 1.05, -0.8)]);
    const f = withHull(new THREE.Mesh(new THREE.TubeGeometry(c, 10, 0.09, 5), goldDark));
    f.position.set(side * 0.5, 0.75, -0.3);
    head.add(f);
  }
  // lower feelers reaching forward toward the pearl
  for (const side of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.6, -0.8, 1.0), new THREE.Vector3(side * 0.9, -1.6, 1.6)]);
    const f = withHull(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.14, 6), gold));
    f.position.set(side * 0.6, -0.4, 0.9);
    head.add(f);
  }
  // the shell: purple-blue bands with gold, spiked shoulder, sitting on the back of the foot
  const { group: shell, aperture } = shellMesh({ turns: 2.9, r0: 0.16, grow: 2.35, coil: 1.18, drop: 0.45, ribs: 8, rib: 0.1, spikes: 7, spikeLen: 0.45, a: '#7a6ad6', b: '#3a3584', inner: '#e3b866', shoulder: '#f0c766', bands: 1.6, lip: 0.2, aspect: 1.05 }, { nacreGlow: 0.3, outline: '#1e1b3a' });
  const shellHolder = orient(shell, aperture, { roll: -Math.PI / 2, sink: -0.6 });
  // the aperture faces forward-down onto the foot
  shellHolder.rotation.x = 0.35; // the opening leans down onto the foot; the spiral shows to the sides
  shellHolder.scale.setScalar(0.68);
  shellHolder.position.set(0, 1.1, -1.4);
  root.add(shellHolder);
  return {
    root,
    update(dt, t) {
      const b = Math.sin(t * 1.3);
      shellHolder.scale.set(0.68 + b * 0.008, 0.68 - b * 0.01, 0.68 + b * 0.008);
      head.rotation.set(Math.sin(t * 0.8) * 0.06, Math.sin(t * 0.55) * 0.18, Math.sin(t * 0.7) * 0.05);
      head.position.y = 3.1 + b * 0.08;
      stalks.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.9 + i * 2.1) * 0.18; s.rotation.x = Math.sin(t * 1.4 + i) * 0.12; });
    },
  };
}
