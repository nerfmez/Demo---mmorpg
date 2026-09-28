// Two-bone arm IK on the driver rig (arm > elbow > hand): bends the elbow to the target's
// distance, then swings the upper arm so the palm reaches it. The pose's own arm twist is
// kept as the pole, so authored arms decide where the elbow points. Blended by weight.
import * as THREE from 'three';

const S = new THREE.Vector3();
const H = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qp = new THREE.Quaternion();
const qFK = new THREE.Quaternion();
const PALM = new THREE.Vector3(0, -0.07, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Move one arm (side 'L' or 'R') so its palm reaches `target` (world space), weight w. */
export function reachArm(bones, side, target, w) {
  const arm = bones['arm' + side], elbow = bones['elbow' + side], hand = bones['hand' + side];
  if (!arm || !elbow || !hand || w <= 0) return;
  const a = elbow.position.length(), c = hand.position.length() + PALM.length();
  arm.getWorldPosition(S);
  const d = clamp(S.distanceTo(target), 0.05, (a + c) * 0.999);
  const bend = Math.PI - Math.acos(clamp((a * a + c * c - d * d) / (2 * a * c), -1, 1));
  const fkElbow = elbow.rotation.x;
  elbow.rotation.x = -bend;
  arm.updateMatrixWorld(true);
  hand.localToWorld(H.copy(PALM));
  v1.subVectors(H, S).normalize();
  v2.subVectors(target, S).normalize();
  qFK.copy(arm.quaternion);
  arm.getWorldQuaternion(qa).premultiply(q.setFromUnitVectors(v1, v2));
  arm.parent.getWorldQuaternion(qp).invert();
  arm.quaternion.slerpQuaternions(qFK, qa.premultiply(qp), w);
  elbow.rotation.x = fkElbow + (-bend - fkElbow) * w;
  arm.updateMatrixWorld(true);
}
