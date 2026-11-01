// The bear's paw swipe from a CC0 humanoid clip: Quaternius Universal Animation Library 2, `Zombie_Scratch`
// (fetch with scripts/pose-retarget/fetch-ual.sh). A bear that rears to swipe holds its body like a person:
// the spine is the bear's body and chest, the arms its forelegs, the legs its hind legs. For each frame this
// writes the direction of each body part in the body's own frame (x left, y up, z forward; the pelvis turned
// to face +z at the first frame) into data/beast-clips.json as `clips.swipe` with `absolute: true` (the
// directions are the pose itself, like the rear pose in render/beast-clips.js, not turns from the wolf's
// standing pose) and `hit`: the fraction where the striking paw moves fastest.
// Usage: node scripts/beast-clips/extract-swipe.mjs [path/to/UAL2.glb]
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = process.argv[2] || path.join(root, 'tests/browser/out/ual/UAL2.glb');
const CLIP = 'Zombie_Scratch', FPS = 20;
const buf = fs.readFileSync(src);
const gltf = await new Promise((ok, no) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, no));
const scene = gltf.scene, clip = gltf.animations.find((c) => c.name === CLIP);
if (!clip) throw new Error('no clip ' + CLIP);
const node = (n) => { const o = scene.getObjectByName(n); if (!o) throw new Error('no bone ' + n); return o; };
const wp = (n) => node(n).getWorldPosition(new THREE.Vector3());
const mixer = new THREE.AnimationMixer(scene);
mixer.clipAction(clip).play();
// the pelvis's facing at the first frame: the frames are turned so it faces +z
mixer.setTime(0); scene.updateMatrixWorld(true);
const side = wp('thigh_l').sub(wp('thigh_r')); side.y = 0; side.normalize();
const fwd = new THREE.Vector3().crossVectors(side, new THREE.Vector3(0, 1, 0)); // left x up = forward
const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), new THREE.Vector3(0, 0, 1));
const v = new THREE.Vector3();
const dir = (a, b) => v.subVectors(wp(b), wp(a)).applyQuaternion(turn).normalize().toArray().map((x) => +x.toFixed(3));
// the head's forward: its bone's +z turned into the body frame
const headFwd = () => new THREE.Vector3(0, 0, 1).applyQuaternion(node('Head').getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(turn).normalize().toArray().map((x) => +x.toFixed(3));
const n = Math.max(2, Math.round(clip.duration * FPS)), frames = [], paws = [];
for (let i = 0; i < n; i++) {
  mixer.setTime((i / n) * clip.duration); scene.updateMatrixWorld(true);
  frames.push({
    body: dir('pelvis', 'spine_03'), chest: dir('spine_03', 'neck_01'), neck: dir('neck_01', 'Head'), head: headFwd(), tail: [0, -0.92, -0.38],
    leg0: dir('upperarm_l', 'lowerarm_l'), leg0k: dir('lowerarm_l', 'hand_l'), leg1: dir('upperarm_r', 'lowerarm_r'), leg1k: dir('lowerarm_r', 'hand_r'),
    leg2: dir('thigh_l', 'calf_l'), leg2k: dir('calf_l', 'foot_l'), leg3: dir('thigh_r', 'calf_r'), leg3k: dir('calf_r', 'foot_r'), lift: 0,
  });
  paws.push([wp('hand_l'), wp('hand_r')]);
}
// the strike: where a paw moves fastest
let hit = 0, best = 0;
for (let i = 1; i < n; i++) for (const k of [0, 1]) { const s = paws[i][k].distanceTo(paws[i - 1][k]); if (s > best) { best = s; hit = i / n; } }
const file = path.join(root, 'data/beast-clips.json'), data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.clips.swipe = { from: 'Quaternius, Universal Animation Library 2 (CC0 1.0), UAL2.glb ' + CLIP + '; scripts/beast-clips/extract-swipe.mjs', duration: +clip.duration.toFixed(3), absolute: true, hit: +hit.toFixed(3), frames };
fs.writeFileSync(file, JSON.stringify(data) + '\n');
console.log('swipe', frames.length, 'frames,', clip.duration.toFixed(2), 's, hit at', hit.toFixed(2));
