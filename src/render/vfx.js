// Skill and combat effects. Reads game events and live projectiles/areas; never changes the game.
// Shapes follow the gameplay hit areas (arc, radius, path), so what you see is what hits.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { glowTexture } from './monsters.js';
import { toon } from './toon.js';

const ELEMENT = {
  physical: { core: 0xfff3c4, glow: 0xffc24a, dots: 0xffe08a },
  fire: { core: 0xfff0b0, glow: 0xff7a2a, dots: 0xffa040 },
  cold: { core: 0xeaffff, glow: 0x58c8ff, dots: 0xa8e8ff },
  earth: { core: 0xf4e3c0, glow: 0xb08a5a, dots: 0xd8c09a },
  poison: { core: 0xeaffb0, glow: 0x86d13a, dots: 0xb6ec5a },
  arcane: { core: 0xf0e8ff, glow: 0x9a7cff, dots: 0xc6b4ff },
  none: { core: 0xeafff4, glow: 0x6fe0b0, dots: 0xb4ffe0 },
};
const el = (e) => ELEMENT[e] || ELEMENT.physical;

function additive(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

/** Ring sector geometry facing +Z at angle 0, with a sweep attribute 0..1 across the arc. */
function sectorGeometry(inner, outer, arcRad, segs = 28) {
  const pos = [];
  const sweep = [];
  const rad = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = -arcRad / 2 + arcRad * t;
    for (const [r, k] of [[inner, 0], [outer, 1]]) {
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      sweep.push(t);
      rad.push(k);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('sweep', new THREE.Float32BufferAttribute(sweep, 1));
  g.setAttribute('rad', new THREE.Float32BufferAttribute(rad, 1));
  g.setIndex(idx);
  return g;
}

function slashMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(0xffffff) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `attribute float sweep; attribute float rad; varying float vS; varying float vR;
      void main(){ vS = sweep; vR = rad; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform vec3 uColor; uniform vec3 uCore; varying float vS; varying float vR;
      void main(){
        // the blade edge sweeps right->left; a crescent: thick near the outer rim, thin inside
        float head = clamp(uT * 1.6, 0.0, 1.0);
        float s = 1.0 - vS;
        if (s > head) discard;
        float tail = smoothstep(0.0, 0.55, head - s);
        float fade = 1.0 - smoothstep(0.55, 1.0, uT);
        float rim = smoothstep(0.15, 0.95, vR) * (1.0 - smoothstep(0.93, 1.0, vR));
        float edge = smoothstep(0.7, 0.98, vR);
        vec3 col = mix(uColor, uCore, edge);
        float a = rim * (1.0 - tail * 0.85) * fade;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

function discMaterial(kind) {
  // soft animated discs for persistent areas (fire patch, healing spring) and telegraphs
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 1 }, uColor: { value: new THREE.Color(0xffffff) }, uColor2: { value: new THREE.Color(0xffffff) }, uFill: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: kind === 'telegraph' ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT; uniform float uA; uniform vec3 uColor; uniform vec3 uColor2; uniform float uFill; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
      void main(){
        float d = length(vP);
        if (d > 1.0) discard;
        float a = 0.0; vec3 col = uColor;
        ${
          kind === 'fire'
            ? `float f = n(vP * 3.5 + vec2(0.0, -uT * 2.5)) * 0.7 + n(vP * 7.0 - uT * 3.0) * 0.3;
               float body = smoothstep(1.0, 0.55, d + (f - 0.5) * 0.5);
               a = body * smoothstep(0.35, 0.65, f + 0.2) ; col = mix(uColor, uColor2, smoothstep(0.4, 0.8, f));`
            : kind === 'heal'
            ? `float r1 = fract(d * 2.2 - uT * 0.8); float ring = smoothstep(0.0, 0.08, r1) * smoothstep(0.25, 0.1, r1);
               a = (0.28 + ring * 0.5) * smoothstep(1.0, 0.85, d); col = mix(uColor, uColor2, ring);`
            : `// telegraph: faint fill that grows with uFill, crisp edge
               float edge = smoothstep(0.9, 0.97, d) * smoothstep(1.0, 0.97, d);
               float fill = step(d, uFill) * 0.35;
               a = edge * 0.9 + fill; col = mix(uColor, uColor2, step(d, uFill));`
        }
        a *= uA;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

export class Vfx {
  constructor(scene) {
    this.scene = scene;
    this.fx = new Particles(3000, { additive: true });
    this.dust = new Particles(800, { additive: false });
    scene.add(this.fx.points, this.dust.points);
    this.active = []; // {obj, t, dur, update(t,k), dispose}
    this.projectiles = new Map();
    this.areas = new Map();
    this.telegraphs = new Map();
    this.discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    this.glow = glowTexture();
  }

  setPointScale(h) {
    this.fx.uniforms.uScale.value = h * 0.9;
    this.dust.uniforms.uScale.value = h * 0.9;
  }

  spawn(obj, dur, update) {
    this.scene.add(obj);
    this.active.push({ obj, t: 0, dur, update });
  }

  sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity }));
    s.scale.set(size, size, 1);
    return s;
  }

  // ---------- one-shot effects ----------

  slash(e) {
    const c = el(e.element);
    const g = sectorGeometry(e.range * 0.35, e.range + 0.2, (e.arc * Math.PI) / 180);
    const m = new THREE.Mesh(g, slashMaterial(c.glow));
    m.position.set(e.x, 0.95, e.z);
    m.rotation.y = e.angle;
    m.rotation.z = 0.12;
    m.renderOrder = 6;
    this.spawn(m, 0.28, (t) => {
      m.material.uniforms.uT.value = t;
    });
    // a few sparks along the arc
    for (let i = 0; i < 8; i++) {
      const a = e.angle + ((i / 7 - 0.5) * e.arc * Math.PI) / 180;
      const r = e.range * (0.8 + Math.random() * 0.3);
      this.fx.add(e.x + Math.sin(a) * r, 0.95, e.z + Math.cos(a) * r, Math.sin(a) * 2, 0.6, Math.cos(a) * 2, { color: c.dots, size: 0.22, life: 0.3 });
    }
  }

  monsterSwing(e) {
    const g = sectorGeometry(e.range * 0.4, e.range, (e.arc * Math.PI) / 180);
    const m = new THREE.Mesh(g, slashMaterial(0xff8a5a));
    m.position.set(e.x, 0.7, e.z);
    m.rotation.y = e.angle;
    this.spawn(m, 0.3, (t) => (m.material.uniforms.uT.value = t));
  }

  impact(e) {
    const c = el(e.element);
    this.fx.burst(e.x, 1.0, e.z, 10, { color: c.dots, size: 0.28, speed: 4, life: 0.35, up: 0.8 });
    const s = this.sprite(c.glow, 1.6, 0.9);
    s.position.set(e.x, 1.0, e.z);
    this.spawn(s, 0.2, (t) => {
      s.material.opacity = 0.9 * (1 - t);
      s.scale.setScalar(1.2 + t * 1.2);
    });
  }

  hitSpark(e) {
    const c = el(e.element);
    if (e.dot) {
      this.fx.add(e.x + (Math.random() - 0.5) * 0.6, 0.6, e.z + (Math.random() - 0.5) * 0.6, 0, 1.4, 0, { color: c.dots, size: 0.22, life: 0.5 });
      return;
    }
    this.fx.burst(e.x, 0.9, e.z, e.crit ? 14 : 6, { color: e.crit ? 0xffffff : c.dots, size: e.crit ? 0.35 : 0.24, speed: e.crit ? 6 : 4, life: 0.3, up: 0.6 });
    if (e.shell) this.fx.burst(e.x, 1.0, e.z, 6, { color: 0xd8f0a0, size: 0.2, speed: 3, life: 0.25 });
  }

  burst(e) {
    if (e.kind === 'stone_burst') return this.stoneBurst(e);
    if (e.kind === 'slam') return this.slam(e);
    const c = el(e.element);
    this.fx.burst(e.x, 0.3, e.z, 18, { color: c.dots, size: 0.35, speed: e.radius * 2.5, life: 0.5, up: 0.4 });
  }

  stoneBurst(e) {
    const c = el(e.element);
    const cold = e.element === 'cold';
    const n = 7;
    const group = new THREE.Group();
    group.position.set(e.x, 0, e.z);
    const mat = toon(cold ? '#bfe9ff' : '#b89a78');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = i === 0 ? 0 : e.radius * (0.35 + Math.random() * 0.45);
      const h = (i === 0 ? 1.8 : 1.0 + Math.random() * 0.6) * (e.echo ? 0.8 : 1);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 + Math.random() * 0.15, h, 5), mat);
      cone.position.set(Math.sin(a) * r, -h, Math.cos(a) * r);
      cone.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      cone.userData.h = h;
      cone.castShadow = true;
      group.add(cone);
    }
    this.spawn(group, 0.9, (t) => {
      const up = t < 0.15 ? t / 0.15 : t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
      group.children.forEach((cn) => (cn.position.y = (up - 0.5) * cn.userData.h));
    });
    this.dust.burst(e.x, 0.2, e.z, 16, { color: cold ? 0xdff4ff : 0xcbb08a, size: 0.8, sizeEnd: 1.4, speed: e.radius * 1.8, life: 0.7, up: 0.3, drag: 3 });
    this.fx.burst(e.x, 0.5, e.z, 10, { color: c.dots, size: 0.25, speed: 5, life: 0.4, up: 1.2 });
    this.ring(e.x, e.z, e.radius, cold ? 0xa8e8ff : 0xffe0a0, 0.35);
  }

  slam(e) {
    this.dust.burst(e.x, 0.2, e.z, 26, { color: 0xb49a78, size: 1.0, sizeEnd: 1.8, speed: e.radius * 2.2, life: 0.8, up: 0.25, drag: 3 });
    this.ring(e.x, e.z, e.radius, 0xffb070, 0.4);
    this.shake = 0.35;
  }

  ring(x, z, radius, color, dur = 0.35) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), additive(color, 0.9));
    m.position.set(x, 0.08, z);
    this.spawn(m, dur, (t) => {
      m.scale.setScalar(radius * (0.6 + t * 0.5));
      m.material.opacity = 0.9 * (1 - t);
    });
  }

  ward(e, playerObj) {
    const color = e.reflect ? 0xffb86a : 0x8fd8ff;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `varying float vF; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normal); vF = 1.0 - abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uA; varying float vF; void main(){ float a = (pow(vF, 2.5) * 0.9 + 0.06) * uA; gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
      })
    );
    m.scale.set(0.9, 1.15, 0.9);
    this.wardMesh?.removeFromParent();
    this.wardMesh = m;
    playerObj.add(m);
    m.position.y = 1.0;
    this.fx.burst(e.x, 1, e.z, 16, { color, size: 0.3, speed: 3, life: 0.5, up: 1 });
  }

  updateWard(barrier, t) {
    if (!this.wardMesh) return;
    const on = barrier > 0.5;
    this.wardMesh.visible = on;
    this.wardMesh.material.uniforms.uA.value = on ? 0.75 + Math.sin(t * 5) * 0.1 : 0;
    this.wardMesh.rotation.y += 0.01;
  }

  levelUp(x, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5, 24, 1, true), additive(0xffd76a, 0.6));
    m.position.set(x, 2.5, z);
    this.spawn(m, 1.2, (t) => {
      m.material.opacity = 0.6 * (1 - t);
      m.scale.set(1 + t * 0.4, 1, 1 + t * 0.4);
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add(x + Math.sin(a) * 0.9, Math.random() * 0.5, z + Math.cos(a) * 0.9, 0, 3 + Math.random() * 3, 0, { color: 0xffe79a, size: 0.25, life: 1.0, drag: 1 });
    }
  }

  blink(fromX, fromZ, x, z, color = 0xb4a2ff) {
    this.fx.burst(fromX, 1, fromZ, 16, { color, size: 0.3, speed: 3, life: 0.4, up: 1 });
    this.fx.burst(x, 1, z, 16, { color, size: 0.3, speed: 3, life: 0.4, up: 1 });
  }

  dashTrail(x, z, kind) {
    const color = kind === 'roll' ? 0xd8c7a0 : 0xbfe6ff;
    if (kind === 'roll') this.dust.add(x, 0.2, z, 0, 0.3, 0, { color, size: 0.7, sizeEnd: 1.1, life: 0.45, drag: 2 });
    else this.fx.add(x, 1.0, z, 0, 0, 0, { color, size: 0.55, sizeEnd: 0.1, life: 0.25 });
  }

  death(e, big = false) {
    this.dust.burst(e.x, 0.5, e.z, big ? 40 : 14, { color: 0xe8dcc8, size: big ? 1.2 : 0.7, sizeEnd: big ? 2 : 1.1, speed: big ? 5 : 3, life: 0.7, up: 0.5, drag: 3 });
    this.fx.burst(e.x, 0.8, e.z, big ? 30 : 8, { color: 0xfff0b0, size: 0.28, speed: 4, life: 0.5, up: 1 });
  }

  pickup(x, z, color) {
    this.fx.burst(x, 0.8, z, 6, { color, size: 0.2, speed: 2, life: 0.35, up: 1.5 });
  }

  heal(x, z) {
    for (let i = 0; i < 5; i++) this.fx.add(x + (Math.random() - 0.5) * 0.8, 0.4 + Math.random(), z + (Math.random() - 0.5) * 0.8, 0, 1.6, 0, { color: 0x8dffc8, size: 0.25, life: 0.7, drag: 1 });
  }

  // ---------- persistent visuals synced to the game ----------

  syncProjectiles(game, dt, time) {
    const seen = new Set();
    for (const pr of game.projectiles) {
      seen.add(pr.id);
      let v = this.projectiles.get(pr.id);
      const element = pr.owner === 'player' ? pr.element : pr.kind === 'spit' ? 'poison' : 'arcane';
      const c = el(element);
      if (!v) {
        v = new THREE.Group();
        const size = pr.owner === 'player' ? 0.9 : 0.8;
        v.add(this.sprite(c.glow, size * 1.8, 0.85));
        const core = this.sprite(c.core, size * 0.8, 1);
        v.add(core);
        this.scene.add(v);
        this.projectiles.set(pr.id, v);
      }
      v.position.set(pr.x, pr.y ?? 1, pr.z);
      v.children[1].scale.setScalar(0.7 + Math.sin(time * 30 + pr.id) * 0.08);
      // ribbon-like trail of soft dots along the real path
      const back = { x: -pr.vx / pr.speed, z: -pr.vz / pr.speed };
      for (let k = 0; k < 2; k++) {
        const o = Math.random() * 0.35;
        this.fx.add(pr.x + back.x * o, (pr.y ?? 1) + (Math.random() - 0.5) * 0.12, pr.z + back.z * o, back.x * 1.2, 0.3, back.z * 1.2, { color: c.dots, size: 0.32, sizeEnd: 0.05, life: 0.28, drag: 4 });
      }
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        v.removeFromParent();
        this.projectiles.delete(id);
      }
    }
  }

  syncAreas(game, dt, time) {
    const seen = new Set();
    for (const a of game.areas) {
      seen.add(a.id);
      let v = this.areas.get(a.id);
      if (!v) {
        v = this.makeArea(a);
        if (!v) continue;
        this.areas.set(a.id, v);
        this.scene.add(v.obj);
      }
      v.update(a, time, dt);
    }
    for (const [id, v] of this.areas) {
      if (!seen.has(id)) {
        v.obj.removeFromParent();
        this.areas.delete(id);
      }
    }
  }

  makeArea(a) {
    if (a.kind === 'burning_ground') {
      const m = new THREE.Mesh(this.discGeo, discMaterial('fire'));
      m.material.uniforms.uColor.value.set(0xff5a1a);
      m.material.uniforms.uColor2.value.set(0xffd060);
      m.position.set(a.x, 0.07, a.z);
      m.scale.setScalar(a.radius);
      return {
        obj: m,
        update: (ar, t, dt) => {
          const live = ar.t - ar.delay;
          m.material.uniforms.uT.value = t;
          m.material.uniforms.uA.value = Math.min(1, live * 5) * Math.min(1, (ar.duration - live) * 2);
          if (Math.random() < dt * 14) this.fx.add(ar.x + (Math.random() - 0.5) * ar.radius * 1.4, 0.2, ar.z + (Math.random() - 0.5) * ar.radius * 1.4, 0, 1.8, 0, { color: 0xff9a40, size: 0.28, life: 0.6, drag: 1 });
        },
      };
    }
    if (a.kind === 'healing_spring') {
      const g = new THREE.Group();
      const m = new THREE.Mesh(this.discGeo, discMaterial('heal'));
      m.material.uniforms.uColor.value.set(0x3fbf9a);
      m.material.uniforms.uColor2.value.set(0xbfffe8);
      m.scale.setScalar(a.radius);
      g.add(m);
      g.position.set(a.x, 0.08, a.z);
      return {
        obj: g,
        update: (ar, t, dt) => {
          const live = ar.t - ar.delay;
          m.visible = live >= 0;
          m.material.uniforms.uT.value = t;
          m.material.uniforms.uA.value = Math.min(1, live * 4) * Math.min(1, (ar.duration - live) * 2);
          if (live >= 0 && Math.random() < dt * 22) {
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * ar.radius;
            this.fx.add(ar.x + Math.sin(ang) * r, 0.1, ar.z + Math.cos(ang) * r, 0, 1.5 + Math.random(), 0, { color: 0x9dffd8, size: 0.26, life: 0.8, drag: 0.8 });
          }
        },
      };
    }
    if (a.kind === 'stone_burst') {
      // aim marker during the delay (player skill)
      const m = new THREE.Mesh(this.discGeo, discMaterial('telegraph'));
      const cold = a.element === 'cold';
      m.material.uniforms.uColor.value.set(cold ? 0xbfe8ff : 0xffe2a8);
      m.material.uniforms.uColor2.value.set(cold ? 0x8fd0ff : 0xffc870);
      m.position.set(a.x, 0.06, a.z);
      m.scale.setScalar(a.radius);
      return {
        obj: m,
        update: (ar) => {
          const k = Math.min(1, ar.t / Math.max(0.01, ar.delay));
          m.material.uniforms.uFill.value = k;
          m.material.uniforms.uA.value = ar.t < ar.delay ? 0.7 : 0;
        },
      };
    }
    if (a.kind === 'shockwave') {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), additive(0xffa060, 0.9));
      m.position.set(a.x, 0.1, a.z);
      return {
        obj: m,
        update: (ar) => {
          m.scale.setScalar(ar.radius);
          m.material.opacity = 0.9 * (1 - (ar.t - ar.delay) / ar.duration);
          if (Math.random() < 0.6) {
            const ang = Math.random() * Math.PI * 2;
            this.dust.add(ar.x + Math.sin(ang) * ar.radius, 0.2, ar.z + Math.cos(ang) * ar.radius, 0, 0.4, 0, { color: 0xc2a684, size: 0.7, sizeEnd: 1.1, life: 0.4, drag: 2 });
          }
        },
      };
    }
    return null;
  }

  /** Monster wind-up tells: ground circle for the slam, lane for charges. */
  syncTelegraphs(game) {
    const seen = new Set();
    for (const m of game.monsters) {
      const w = m.windup;
      if (m.dead || !w || m.state !== 'windup') continue;
      let kind = null;
      if (w.name === 'slam') kind = 'slam';
      else if (w.name === 'gore' || w.name === 'charge') kind = 'lane';
      if (!kind) continue;
      const key = `${m.id}:${w.name}`;
      seen.add(key);
      let v = this.telegraphs.get(key);
      if (!v) {
        if (kind === 'slam') {
          const mesh = new THREE.Mesh(this.discGeo, discMaterial('telegraph'));
          mesh.material.uniforms.uColor.value.set(0xff6a3a);
          mesh.material.uniforms.uColor2.value.set(0xff9a5a);
          v = { mesh, kind };
        } else {
          const atk = m.def.attacks[w.name];
          const len = atk.speed * atk.duration;
          const geo = new THREE.PlaneGeometry(m.r * 1.6, len).rotateX(-Math.PI / 2).translate(0, 0, len / 2);
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.25, depthWrite: false }));
          v = { mesh, kind };
        }
        this.scene.add(v.mesh);
        this.telegraphs.set(key, v);
      }
      const k = Math.min(1, m.stateT / w.total);
      v.mesh.position.set(m.x, 0.07, m.z);
      if (v.kind === 'slam') {
        v.mesh.scale.setScalar(w.radius || m.def.attacks.slam.radius);
        v.mesh.material.uniforms.uFill.value = k;
        v.mesh.material.uniforms.uA.value = 0.9;
      } else {
        v.mesh.rotation.y = w.angle;
        v.mesh.material.opacity = 0.12 + 0.25 * k;
      }
    }
    for (const [key, v] of this.telegraphs) {
      if (!seen.has(key)) {
        v.mesh.removeFromParent();
        this.telegraphs.delete(key);
      }
    }
  }

  update(dt) {
    this.fx.update(dt);
    this.dust.update(dt);
    const keep = [];
    for (const a of this.active) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.update?.(k, a);
      if (a.t >= a.dur) {
        a.obj.removeFromParent();
        a.obj.traverse?.((o) => {
          if (o.geometry && o.geometry !== this.discGeo) o.geometry.dispose();
          if (o.material && o.material.dispose && !o.material.isMeshToonMaterial) o.material.dispose();
        });
      } else keep.push(a);
    }
    this.active = keep;
  }
}
