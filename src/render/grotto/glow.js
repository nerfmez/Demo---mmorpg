// Many soft glows in one draw: camera-facing quads instanced from a list of
// {x, y, z, size, color, alpha}. For the static halos of corals, crystals, chests and pearls; the
// few glows that animate stay sprites of their own.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const VERT = `
attribute vec3 aCenter;
attribute vec4 aColor;
attribute float aSize;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mvPosition = viewMatrix * vec4(aCenter, 1.0);
  mvPosition.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, t.a * vColor.a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function glowField(list) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.uv = base.attributes.uv;
  const centre = new Float32Array(list.length * 3), colour = new Float32Array(list.length * 4), size = new Float32Array(list.length);
  const c = new THREE.Color();
  list.forEach((q, i) => {
    centre.set([q.x, q.y, q.z], i * 3);
    c.set(q.color);
    colour.set([c.r, c.g, c.b, q.alpha ?? 0.4], i * 4);
    size[i] = q.size;
  });
  g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centre, 3));
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colour, 4));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  g.instanceCount = list.length;
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
  });
  m.uniforms.uMap.value = glowTexture(); // after the merge, which would clone the texture
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'glow-field';
  return mesh;
}
