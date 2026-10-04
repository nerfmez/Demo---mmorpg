// Presentation only: borrow the game's renderer for one cached full-body image.
// Every temporary target/hero is disposed; no additional WebGL context is created.
import * as THREE from 'three';
import { buildHumanoid, DEFAULT_LOOK } from '../render/hero.js';
import { disposeObject } from '../render/dispose.js';

export function equipmentAvatar(renderer, appearance, gear) {
  const width = 420, height = 585;
  const target = new THREE.WebGLRenderTarget(width, height, {colorSpace: THREE.SRGBColorSpace});
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  const hero = buildHumanoid(appearance || DEFAULT_LOOK, gear);
  try {
    const scene = new THREE.Scene();
    scene.add(hero.root);
    hero.root.rotation.y = .28;
    scene.add(new THREE.HemisphereLight('#fff4dd', '#52667c', 2.4));
    const light = new THREE.DirectionalLight('#fff5df', 2.7);
    light.position.set(-2, 4, 5);
    scene.add(light);
    const box = new THREE.Box3().setFromObject(hero.root);
    const size = box.getSize(new THREE.Vector3()), middle = box.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(28, width / height, .01, 100);
    camera.position.set(0, middle.y + .1, size.y * 2.25);
    camera.lookAt(0, middle.y, 0);
    renderer.setRenderTarget(target);
    renderer.setClearColor('#000000', 0);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'), image = context.createImageData(width, height);
    for (let row = 0; row < height; row++) image.data.set(pixels.subarray((height - 1 - row) * width * 4, (height - row) * width * 4), row * width * 4);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    target.dispose();
    disposeObject(hero.root);
    disposeObject(hero.scarf?.mesh);
  }
}
