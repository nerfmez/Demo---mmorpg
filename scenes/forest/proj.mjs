import * as THREE from '/home/user/Demo---mmorpg/node_modules/three/build/three.module.js';
const ASPECT = 1672 / 941;
const cam = new THREE.PerspectiveCamera(32, ASPECT, 1, 400);
const CAM = { target: new THREE.Vector3(0, 0, -3), pitch: 40, dist: 30 };
const p = THREE.MathUtils.degToRad(CAM.pitch);
cam.position.set(CAM.target.x, CAM.target.y + Math.sin(p) * CAM.dist, CAM.target.z + Math.cos(p) * CAM.dist);
cam.lookAt(CAM.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
const P = (u, v, y = 0) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), cam); const o = r.ray.origin, d = r.ray.direction, t = (y - o.y) / d.y; return [+(o.x + d.x * t).toFixed(1), +(o.z + d.z * t).toFixed(1)]; };
for (const v of [-0.3, 0, 0.25, 0.5, 0.75, 1]) console.log('v', v, [0, 0.25, 0.5, 0.75, 1].map(u => P(u, v).join(',')).join('  '));
// hero height in pixels at the bottom centre
const a = new THREE.Vector3(...[0, 0, 0]), hz = P(0.5, 0.8); a.set(hz[0], 0, hz[1]); const b = a.clone(); b.y = 1.8;
const pa = a.clone().project(cam), pb = b.clone().project(cam);
console.log('hero 1.8 m =', ((pb.y - pa.y) / 2 * 941).toFixed(0), 'px at', hz);
