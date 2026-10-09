// Helms by item (data/outfits.json `helms`, docs/OUTFIT-BASE.md), shaped after their icons. Parts
// sit on the head bone in the head-local frame the procedural head was authored in (head centre
// about 0.12 above the bone, radius about 0.145, +Z forward); the hero's head fit scales them to
// the real head. Hood mantles hang on the chest bone like the old neck parts.
import * as THREE from 'three';

const PI = Math.PI;
const dome = (r, theta = PI * 0.5, phi0 = 0, phiLen = PI * 2, seg = 16) => new THREE.SphereGeometry(r, seg, 8, phi0, phiLen, 0, theta);
const band = (theta0, thetaLen, r) => new THREE.SphereGeometry(r, 16, 4, 0, PI * 2, theta0, thetaLen);

/** A hood: a closed crown, then the sides and back, the face left open. */
function hood(rb, color, r = 0.165, open = 0.8) {
  rb.add('head', dome(r, PI * 0.36).translate(0, 0.14, -0.02), color);
  rb.add('head', new THREE.SphereGeometry(r, 16, 6, PI / 2 + open, PI * 2 - open * 2, PI * 0.36, PI * 0.38).translate(0, 0.14, -0.02), color);
}

const BUILD = {
  // leather cap with stitched seams, a brim and ear flaps
  cap(rb, P) {
    rb.add('head', dome(0.15, PI * 0.48).scale(1, 0.95, 1.02).translate(0, 0.145, -0.01), P.main);
    for (const a of [0, PI / 2, -PI / 2]) rb.add('head', new THREE.TorusGeometry(0.152, 0.005, 3, 16, PI * 0.46).rotateY(a + PI / 2).rotateZ(PI / 2).translate(0, 0.145, -0.01), P.trim, { plain: true });
    rb.add('head', new THREE.CylinderGeometry(0.155, 0.158, 0.03, 16, 1, true, -PI * 0.42, PI * 0.84).translate(0, 0.15, -0.005), P.trim);
    for (const s of [1, -1]) rb.add('head', new THREE.BoxGeometry(0.03, 0.11, 0.08).translate(0, -0.05, 0), P.main, { pos: [s * 0.142, 0.13, -0.005], rot: [0, 0, s * 0.12] });
  },
  // a segmented carapace (beetle or crab): ridged dome, cheek plates, crab spikes
  shell(rb, P, e) {
    rb.add('head', dome(0.158, PI * 0.56).scale(1, 1.05, 1.06).translate(0, 0.14, -0.012), P.main);
    for (const t of [0.18, 0.32, 0.44]) rb.add('head', band(PI * t, 0.035, 0.162).scale(1, 1.05, 1.06).translate(0, 0.14, -0.012), P.trim);
    rb.add('head', new THREE.TorusGeometry(0.16, 0.012, 4, 20, PI).rotateX(PI / 2).rotateZ(PI / 2).rotateY(PI / 2).translate(0, 0.15, -0.012), P.accent, { plain: true });
    for (const s of [1, -1]) rb.add('head', new THREE.SphereGeometry(0.06, 10, 6, 0, PI * 2, 0, PI * 0.5).rotateZ(s * PI / 2).scale(0.5, 1.2, 1).translate(s * 0.15, 0.08, 0.01), P.main);
    if (e.spikes) for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      rb.add('head', new THREE.ConeGeometry(0.016, 0.05, 5).rotateX(-a).translate(0, 0.14 + Math.cos(a) * 0.17, -0.012 + Math.sin(a) * 0.17), P.accent);
    }
    rb.add('head', new THREE.BoxGeometry(0.2, 0.025, 0.03).translate(0, 0.205, 0.13), P.trim); // brow ridge
  },
  // a pointed hood with spots and a tie under the chin (the spore hood)
  pointedHood(rb, P) {
    hood(rb, P.main);
    rb.add('head', new THREE.ConeGeometry(0.09, 0.2, 10).rotateX(-0.6).translate(0, 0.33, -0.09), P.main);
    for (const [x, y, z] of [[-0.08, 0.27, 0.06], [0.09, 0.22, 0.05], [0.0, 0.31, -0.04], [-0.12, 0.17, -0.06], [0.12, 0.28, -0.07], [0.03, 0.38, -0.12]]) rb.add('head', new THREE.SphereGeometry(0.022, 6, 4).scale(1, 1, 0.5).lookAt(new THREE.Vector3(x, y, z)).translate(x, y, z), P.accent, { plain: true });
    for (const s of [1, -1]) rb.add('head', new THREE.ConeGeometry(0.025, 0.07, 4).rotateZ(s * 2.2).translate(s * 0.03, -0.01, 0.1), P.trim);
  },
  // a wreath of feathers on a braided band
  circlet(rb, P) {
    rb.add('head', new THREE.TorusGeometry(0.145, 0.012, 5, 22).rotateX(PI / 2).translate(0, 0.2, -0.005), P.main);
    rb.add('head', new THREE.TorusGeometry(0.147, 0.006, 4, 22).rotateX(PI / 2).rotateY(0.3).translate(0, 0.21, -0.005), P.trim, { plain: true });
    for (let i = 0; i < 9; i++) {
      const a = PI * 0.25 + (i / 8) * PI * 1.5, x = Math.sin(a) * 0.15, z = Math.cos(a) * 0.15 - 0.005;
      const g = new THREE.ConeGeometry(0.022, 0.13, 4).scale(1, 1, 0.25).translate(0, 0.065, 0).rotateX(-0.9).rotateY(a);
      rb.add('head', g.translate(x, 0.21, z), P.accent);
      // a brown band across each feather, like the icon's barred quills
      rb.add('head', new THREE.ConeGeometry(0.017, 0.03, 4).scale(1, 1, 0.3).translate(0, 0.065, 0).rotateX(-0.9).rotateY(a).translate(x, 0.212, z), P.trim);
    }
  },
  // a steel helm with cheek guards and one great curved horn
  horned(rb, P) {
    rb.add('head', dome(0.157, PI * 0.58).scale(1, 1.05, 1.06).translate(0, 0.14, -0.012), P.main);
    rb.add('head', new THREE.BoxGeometry(0.03, 0.12, 0.02).translate(0, 0.2, 0.155), P.trim); // nose ridge
    for (const s of [1, -1]) rb.add('head', new THREE.BoxGeometry(0.03, 0.12, 0.1).translate(s * 0.15, 0.06, 0.04), P.main);
    rb.add('head', new THREE.TorusGeometry(0.158, 0.01, 4, 24).rotateX(PI / 2).translate(0, 0.12, -0.012), P.trim, { plain: true });
    // one horn sweeping up and back over the left side
    const curve = new THREE.CatmullRomCurve3([[0.1, 0.23, 0.0], [0.17, 0.29, -0.04], [0.19, 0.34, -0.12], [0.15, 0.36, -0.2]].map((p) => new THREE.Vector3(...p)));
    rb.add('head', new THREE.TubeGeometry(curve, 12, 0.026, 7), P.accent);
    rb.add('head', new THREE.ConeGeometry(0.026, 0.07, 7).rotateX(-2.0).translate(0.13, 0.36, -0.24), P.accent);
  },
  // a fur-trimmed hood with a leather shoulder mantle (ranger and wardenstalker hoods)
  furHood(rb, P) {
    hood(rb, P.main, 0.168, 0.85);
    rb.add('head', new THREE.TorusGeometry(0.115, 0.03, 6, 18, PI * 1.25).rotateZ(-PI * 0.125).translate(0, 0.13, 0.095), P.trim);
    rb.add('head', new THREE.ConeGeometry(0.06, 0.14, 8).rotateX(-1.1).translate(0, 0.25, -0.17), P.main);
    // a small leather shoulder cape under the hood, piped in fur
    rb.add('chest', new THREE.SphereGeometry(0.17, 16, 6, 0, PI * 2, 0, PI * 0.32).scale(1.15, 0.8, 1.0).translate(0, 0.2, -0.01), P.accent);
    rb.add('chest', new THREE.TorusGeometry(0.17 * Math.sin(PI * 0.32), 0.012, 4, 24).rotateX(PI / 2).scale(1.15, 1, 1.0).translate(0, 0.2 + 0.17 * 0.8 * Math.cos(PI * 0.32), -0.01), P.trim);
  },
};
export const HELM_KINDS = Object.keys(BUILD);

/** Add a resolved helm (resolveOutfit().helm) to a RigBuilder's head. */
export function buildHeadwear(rb, helm) {
  if (helm) BUILD[helm.kind]?.(rb, helm.palette, helm);
}
