// Anime roll effects for a monster's boulder form (the warden's `roll`): afterimages of the ball
// trailing behind it (a motion blur drawn as a few fading copies), speed lines streaking back from its
// silhouette and a dust streak on the ground. All live in the rig's space (+Z is the way it rolls), so
// they move, scale and leave with the rig. Original procedural shapes; numbers in data/combat-fx.json
// `roll`. The line and streak geometry is shared by every rig; materials are per rig.
import * as THREE from 'three';

let lineGeo = null;
let groundGeo = null;

// one strip per line: a horizontal and a vertical quad (crossed, so it reads from the game camera and
// from the side), `t` 0 at the head and 1 at the tail, `seed` staggers the lines
function lines(count) {
  if (lineGeo) return lineGeo;
  const pos = [], t = [], seed = [], idx = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (i % 2) * 0.3;
    const x = Math.sin(a), y = Math.cos(a), s = (i * 0.618) % 1 + 0.001;
    // the second quad of the pair has a negative seed: the shader turns its width upright
    for (const sign of [1, -1]) {
      const b = pos.length / 3;
      for (const [tt, side] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
        pos.push(x, y, side); // ring position (unit radius) and the side across the strip
        t.push(tt);
        seed.push(sign * s);
      }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lineGeo.setAttribute('t', new THREE.Float32BufferAttribute(t, 1));
  lineGeo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  lineGeo.setIndex(idx);
  lineGeo.userData.shared = true;
  return lineGeo;
}

function ground() {
  if (groundGeo) return groundGeo;
  groundGeo = new THREE.PlaneGeometry(1, 1, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const uv = groundGeo.attributes.uv, t = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) t[i] = 1 - uv.getY(i);
  groundGeo.setAttribute('t', new THREE.BufferAttribute(t, 1));
  groundGeo.userData.shared = true;
  return groundGeo;
}

const LINE_VS = `
attribute float t;
attribute float seed;
uniform float uTime, uLen, uRadius, uWidth, uSpeed;
varying float vA;
void main() {
  float s = abs(seed);
  float phase = fract(uTime * uSpeed + s * 7.31);
  // each line shoots back from the silhouette and fades as it goes; lines take turns
  float len = uLen * (0.55 + 0.45 * fract(s * 3.7));
  float r = uRadius * (1.04 + 0.12 * fract(s * 5.3));
  vec3 p = vec3(position.x * r, uRadius + position.y * r, -(phase * 0.6 + t) * len);
  float w = uWidth * (1.0 - t * 0.85);
  if (seed < 0.0) p.y += position.z * w; else p.x += position.z * w;
  vA = (1.0 - t) * (1.0 - phase) * step(0.15, fract(s * 11.0 + floor(uTime * uSpeed + s * 7.31) * 0.37));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const GROUND_VS = `
attribute float t;
varying float vA;
void main() {
  vA = (1.0 - t) * (1.0 - t);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * vA);
}`;

/**
 * Build the effects for a rig's boulder form (`form`: the ball group, `ballMesh`: its toon mesh) and
 * return the controller the animator drives each frame with update(rolling, speed, dt).
 */
export function createRollFx(rig, form, ballMesh, cfg = {}) {
  const fx = new THREE.Group();
  fx.name = 'roll-fx';
  fx.visible = false;
  const radius = form.userData.radius;
  // afterimages: the ball itself, drawn flat in its own colours, more transparent the further back
  const ghosts = [];
  const n = cfg.afterimages ?? 3;
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshBasicMaterial({ map: ballMesh.material.map, color: new THREE.Color(cfg.ghostTint || '#ffe0c0'), transparent: true, opacity: 0, depthWrite: false });
    m.userData.rig = true;
    const g = new THREE.Mesh(ballMesh.geometry, m);
    g.renderOrder = 2;
    fx.add(g);
    ghosts.push(g);
  }
  const uniforms = {
    uTime: { value: 0 }, uLen: { value: radius * (cfg.lineLength ?? 3) }, uRadius: { value: radius }, uWidth: { value: radius * (cfg.lineWidth ?? 0.05) },
    uSpeed: { value: cfg.lineRate ?? 2.6 }, uColor: { value: new THREE.Color(cfg.lineColor || '#fff6e4') }, uOpacity: { value: 0 },
  };
  const lm = new THREE.ShaderMaterial({ uniforms, vertexShader: LINE_VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  lm.userData.rig = true;
  const lineMesh = new THREE.Mesh(lines(cfg.lines ?? 14), lm);
  lineMesh.frustumCulled = false;
  lineMesh.renderOrder = 3;
  fx.add(lineMesh);
  const gu = { uColor: { value: new THREE.Color(cfg.dustColor || '#c9b48c') }, uOpacity: { value: 0 } };
  const gm = new THREE.ShaderMaterial({ uniforms: gu, vertexShader: GROUND_VS, fragmentShader: FS, transparent: true, depthWrite: false });
  gm.userData.rig = true;
  const streak = new THREE.Mesh(ground(), gm);
  streak.position.y = 0.03;
  streak.renderOrder = 1;
  fx.add(streak);
  rig.root.add(fx);
  let on = 0;
  return {
    group: fx,
    /** rolling: the ball is rolling now; spin: its current angle; dt: frame time */
    update(rolling, spin, dt) {
      on += ((rolling ? 1 : 0) - on) * Math.min(1, dt * (rolling ? 14 : 6));
      fx.visible = on > 0.02;
      if (!fx.visible) return;
      uniforms.uTime.value += dt;
      uniforms.uOpacity.value = (cfg.lineOpacity ?? 0.85) * on;
      gu.uOpacity.value = (cfg.dustOpacity ?? 0.4) * on;
      const gap = radius * (cfg.ghostGap ?? 0.42);
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        g.position.copy(form.position);
        g.position.z -= gap * (i + 1);
        g.rotation.set(spin - 0.35 * (i + 1), 0, 0);
        g.scale.set(form.scale.x * (1 - 0.04 * i), form.scale.y * (1 - 0.06 * i), form.scale.z * (1.1 + 0.08 * i));
        g.material.opacity = (cfg.ghostOpacity ?? 0.42) * on * (1 - i / ghosts.length) ** 1.3;
      }
      lineMesh.position.set(form.position.x, form.position.y - radius, form.position.z);
      streak.position.z = form.position.z - radius * 0.3;
      streak.scale.set(radius * 1.5, 1, radius * (cfg.dustLength ?? 4));
    },
  };
}
