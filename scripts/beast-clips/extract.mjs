// Turn the Quaternius wolf's clips (CC0, Ultimate Animated Animals; fetch with fetch-animals.sh) into
// data/beast-clips.json: for each clip and frame, the direction of each body part in the animal's own
// frame (x left, y up, z forward) and how far the hips rose, in leg lengths, with the same directions in the
// wolf's standing pose (`rest`: the first frame of its Idle). The game's four-legged companions
// (render/beast-clips.js) turn each of their own bones by the turn that takes the wolf's rest direction to
// its direction in the frame, so any quadruped rig with the wolf rig's bones (body, chest, neck, head, tail,
// leg0..3, leg0k..3k) plays them in its own proportions.
// Usage: node scripts/beast-clips/extract.mjs [path/to/Wolf.gltf]
globalThis.ProgressEvent ??= class extends Event { constructor(t, o = {}) { super(t); Object.assign(this, o); } };
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = process.argv[2] || path.join(root, 'tests/browser/out/animals/Wolf.gltf');
const buf = fs.readFileSync(src);
const gltf = await new Promise((ok, no) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, no));
const scene = gltf.scene;
const node = (n) => { const o = scene.getObjectByName(n.replace(/\./g, '')); if (!o) throw new Error('no bone ' + n); return o; };
const FPS = 20;
// the clips the companions use, by our name
const CLIPS = { walk: 'Walk', gallop: 'Gallop', idle: 'Idle', attack: 'Attack', hit: 'Idle_HitReact_Left', jump: 'Gallop_Jump' };

// the wolf's sides: .L is the animal's left; our rigs put leg0/leg2 at +x
scene.updateMatrixWorld(true);
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const leftX = wp(node('FrontUpperLeg.L')).x;
const flip = leftX > 0 ? 1 : -1; // so that our +x is the wolf's left
const side = { 0: 'L', 1: 'R', 2: 'L', 3: 'R' };
if (flip < 0) { side[0] = 'R'; side[1] = 'L'; side[2] = 'R'; side[3] = 'L'; }

// rest offsets of the foot ends (the IK targets sit on the feet at rest): carried by the lower legs as they move
const restFoot = {}, restHeadTip = new THREE.Vector3();
for (const s of ['L', 'R']) {
  const lf = node(`FrontLowerLeg.${s}`), lb = node(`BackLowerLeg.${s}`);
  restFoot['F' + s] = lf.worldToLocal(wp(node(`FF.${s}`)));
  restFoot['B' + s] = lb.worldToLocal(wp(node(`FFB.${s}`)));
}
{ const h = node('Head'); restHeadTip.copy(h.worldToLocal(wp(h).add(new THREE.Vector3(0, -0.15, 0.55)))); }
const mixer = new THREE.AnimationMixer(scene);
const v = new THREE.Vector3();
const dir = (a, b) => v.subVectors(b, a).normalize().toArray().map((x, i) => +(i === 0 ? x * flip : x).toFixed(3));
const at = (o, local) => o.localToWorld(local.clone());
// one frame's directions (and the hips' height, for lift)
const sample = () => {
  scene.updateMatrixWorld(true);
  const P = (b) => wp(node(b));
  const f = {
    hipY: P('Back').y,
    body: dir(P('Back'), P('Torso2')), chest: dir(P('Torso2'), P('Neck1')), neck: dir(P('Neck1'), P('Head')),
    head: dir(P('Head'), at(node('Head'), restHeadTip)), tail: dir(P('Tail1'), P('Tail6')),
  };
  for (const k of [0, 1]) { // front legs: shoulder joint -> elbow, elbow -> foot
    const s = side[k];
    f['leg' + k] = dir(P(`FrontUpperLeg.${s}`), P(`FrontLowerLeg.${s}`));
    f['leg' + k + 'k'] = dir(P(`FrontLowerLeg.${s}`), at(node(`FrontLowerLeg.${s}`), restFoot['F' + s]));
  }
  for (const k of [2, 3]) { // hind legs: hip -> knee, knee -> foot (the hock folded in)
    const s = side[k];
    f['leg' + k] = dir(P(`BackLeg.${s}`), P(`BackUpperLeg.${s}`));
    f['leg' + k + 'k'] = dir(P(`BackUpperLeg.${s}`), at(node(`BackLowerLeg.${s}`), restFoot['B' + s]));
  }
  return f;
};
// the standing pose: the first frame of Idle; its hip height is a leg's length
mixer.clipAction(gltf.animations.find((c) => c.name === 'Idle')).play(); mixer.setTime(0);
const rest = sample(); mixer.stopAllAction();
const legLen = rest.hipY;
const out = { _source: 'Quaternius, Ultimate Animated Animals (CC0 1.0), Wolf.gltf; scripts/beast-clips/extract.mjs', fps: FPS, rest: null, clips: {} };
{ const { hipY, ...r } = rest; out.rest = r; }
for (const [ours, theirs] of Object.entries(CLIPS)) {
  const clip = gltf.animations.find((c) => c.name === theirs);
  if (!clip) throw new Error('no clip ' + theirs);
  mixer.stopAllAction();
  const act = mixer.clipAction(clip); act.play();
  const n = Math.max(2, Math.round(clip.duration * FPS));
  const frames = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime((i / n) * clip.duration);
    const { hipY, ...f } = sample();
    f.lift = +((hipY - legLen) / legLen).toFixed(3);
    frames.push(f);
  }
  out.clips[ours] = { from: theirs, duration: +clip.duration.toFixed(3), frames };
  act.stop();
}
const file = path.join(root, 'data/beast-clips.json');
fs.writeFileSync(file, JSON.stringify(out) + '\n');
console.log('wrote', file, Object.fromEntries(Object.entries(out.clips).map(([k, c]) => [k, c.frames.length])), (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
