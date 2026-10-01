// Original physical attack shapes. Shared geometry and bounded debris buffers.
import * as THREE from 'three';
import { toon } from './toon.js';
import { makeDecal, conform } from './decal.js';

let quad, rock, cracks;
const shared = g => { g.userData.shared = true; return g; };
export function rockGeometry() {
  return rock ||= shared(new THREE.DodecahedronGeometry(1, 0));
}
export function arrowStreak(cfg) {
  quad ||= shared(new THREE.PlaneGeometry(1, 1));
  const f = cfg.projectile;
  const material = new THREE.ShaderMaterial({
    uniforms: { uLength: { value: f.trailLength }, uWidth: { value: f.trailWidth }, uT: { value: 0 }, uFlow: { value: f.flowSpeed },
      uColor: { value: new THREE.Color(cfg.colors.trail) }, uCore: { value: new THREE.Color(cfg.colors.core) }, uOpacity: { value: f.trailOpacity } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uLength,uWidth,uT,uFlow; varying vec2 vUv;
      void main(){vUv=uv;float taper=pow(max(0.,1.-uv.y),.65);
        vec3 p=vec3((uv.x-.5)*uWidth*taper,.015,-.35-uv.y*uLength);
        p.x+=sin(uv.y*12.-uT*uFlow)*.008*uv.y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform vec3 uColor,uCore;uniform float uOpacity;varying vec2 vUv;
      void main(){float edge=1.-smoothstep(.25,.5,abs(vUv.x-.5));
        vec3 c=mix(uColor,uCore,1.-smoothstep(.04,.2,abs(vUv.x-.5)));
        gl_FragColor=vec4(c,edge*pow(1.-vUv.y,.8)*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(quad, material); mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.userData.arrowStreak = true;
  return mesh;
}

function crackGeometry() {
  if (cracks) return cracks;
  const position = [], center = [], side = [], index = [];
  for (let ray = 0; ray < 9; ray++) {
    const angle = ray / 9 * Math.PI * 2;
    for (let step = 0; step < 5; step++) {
      const r = .12 + step * .21;
      const a = angle + Math.sin(ray * 7 + step * 4) * .11;
      for (const sign of [-1, 1]) {
        position.push(Math.sin(a) * r, 0, Math.cos(a) * r); center.push(Math.sin(a) * r, Math.cos(a) * r);
        side.push(Math.cos(a) * sign * (1 - r * .6), -Math.sin(a) * sign * (1 - r * .6));
      }
      if (step < 4) { const k = ray * 10 + step * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  cracks = shared(new THREE.BufferGeometry());
  cracks.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  cracks.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 2));
  cracks.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2)); cracks.setIndex(index);
  return cracks;
}
export function groundCracks(cfg, radius, world, x, z) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: cfg.cast.crackWidth / Math.max(.01, radius) }, uProgress: { value: 0 },
      uColor: { value: new THREE.Color(cfg.colors.shadow) }, uOpacity: { value: cfg.cast.opacity } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aCenter,aSide;uniform float uWidth;varying float vRadius;
      void main(){vRadius=length(aCenter);vec2 p=position.xz+aSide*uWidth;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p.x,position.y,p.y,1.);}`,
    fragmentShader: `uniform vec3 uColor;uniform float uProgress,uOpacity;varying float vRadius;
      void main(){float reveal=1.-smoothstep(uProgress,uProgress+.12,vRadius);
        gl_FragColor=vec4(uColor,reveal*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = makeDecal(crackGeometry(), material, world, .035);
  // makeDecal owns its terrain-conformed clone, even when its template is shared.
  mesh.geometry.userData.shared = false;
  mesh.position.set(x, 0, z); mesh.scale.set(radius, 1, radius); conform(mesh);
  mesh.userData.groundCracks = true;
  return mesh;
}

/** Small solid chips, reused for every earth impact; no expanding cloud. */
export class RockChips {
  constructor(scene, capacity = 96) {
    this.cap = capacity; this.count = 0;
    this.pos = new Float32Array(capacity * 3); this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity); this.total = new Float32Array(capacity); this.size = new Float32Array(capacity);
    this.mesh = new THREE.InstancedMesh(rockGeometry(), toon('#ffffff').clone(), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.pose = new THREE.Object3D(); this.color = new THREE.Color(); scene.add(this.mesh);
  }
  burst(e, cfg, groundY) {
    const f = cfg.burst; this.color.set(cfg.colors.debris);
    for (let j = 0; j < f.chipCount && this.count < this.cap; j++) {
      const i = this.count++, p = i * 3, a = j / Math.max(1, f.chipCount) * Math.PI * 2;
      const speed = f.chipSpeed * (.6 + Math.random() * .4);
      this.pos[p] = e.x; this.pos[p + 1] = groundY + .16; this.pos[p + 2] = e.z;
      this.vel[p] = Math.sin(a) * speed; this.vel[p + 1] = speed * (.7 + Math.random() * .35); this.vel[p + 2] = Math.cos(a) * speed;
      this.life[i] = this.total[i] = f.chipLife; this.size[i] = f.chipSize * (.7 + Math.random() * .5);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.upload();
  }
  upload() {
    const o = this.pose;
    for (let i = 0; i < this.count; i++) {
      const p = i * 3, age = this.total[i] - this.life[i], fade = Math.min(1, this.life[i] / .12), s = this.size[i] * fade;
      o.position.set(this.pos[p], this.pos[p + 1], this.pos[p + 2]); o.rotation.set(age * 11 + i, age * 7, age * 9);
      o.scale.set(s, s * .65, s * 1.15); o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.count = this.count; this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        if (i !== last) {
          for (let j = 0; j < 3; j++) { this.pos[i * 3 + j] = this.pos[last * 3 + j]; this.vel[i * 3 + j] = this.vel[last * 3 + j]; }
          this.life[i] = this.life[last]; this.total[i] = this.total[last]; this.size[i] = this.size[last];
          this.mesh.getColorAt(last, this.color); this.mesh.setColorAt(i, this.color);
          this.mesh.instanceColor.needsUpdate = true;
        }
        continue;
      }
      const p = i * 3; this.vel[p + 1] -= dt * 10;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
    }
    this.upload();
  }
  clear() { this.count = this.mesh.count = 0; }
  dispose() { this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.material.dispose(); }
}
