// A bite (owner, 2026-11-01: rebuilt from outside references after three rounds, "do it in that direction").
// Research (web search; the pages themselves were blocked from the session): the bite most games and VFX
// artists draw is the Pokémon "Bite" kind - a jaw of solid teeth that opens wide over the target and slams
// shut on it (Gabriel Aguiar's and a Real Time VFX forum recreation; CGHOW's Niagara animal bite: one jaw mesh
// with its teeth, a flash, sparks), and anime impact frames: a held moment of high contrast at the contact,
// lines bursting out from the point and a white flash that breaks up rather than fading. So:
//   open:   the jaw pops in wide open over the prey (upper and lower halves, solid ivory teeth with long
//           canines, a dark outline, lit a little warmer at the gum), leaning with the strike;
//   snap:   the halves slam together in a few frames with an overshoot (the canines pass each other);
//   impact: held shut for a moment with a tremble; a white star flash, lines bursting out from the bite and
//           a few chips (the caller's strokes and glint);
//   break:  the halves spring a little apart, shrink and fade.
// Round 5 (owner: "not pretty yet, and too big"): smaller, curved two-tone fangs on a slim pointed crescent,
// a warm maroon outline (round 6: see-through light instead, no ink), a soft glow behind it, squash and stretch on the snap, lighter impact lines.
// Original shapes (no copied art); built once, pooled (4 jaws, 4 shared geometries, 3 materials per jaw).
import * as THREE from 'three';
import { glowTexture } from './light-kit.js';

const JAWS = 4;
export const BITE_OPEN = 0.05, BITE_SNAP = 0.06, BITE_HOLD = 0.11, BITE_BREAK = 0.16;
export const BITE_SHUT = BITE_OPEN + BITE_SNAP; // when the teeth meet (the impact)
const IVORY = new THREE.Color('#fffaf2'), SHADE = new THREE.Color('#ecd9c6'), TIP = new THREE.Color('#fff4dc'), HALO = new THREE.Color('#ffa64d'), RIM = new THREE.Color('#fff0cc');

// One half-jaw (the upper; the lower is the same mirrored, narrower and with fewer teeth), in units of the
// jaw's half-width: a slim crescent of gum, pointed at both ends, and curved fangs hanging from its lower edge,
// each fang lit on its outer half and shaded on its inner half (two toon tones). inflate grows every edge
// (the outline drawn behind it).
function halfJaw(inflate, lower) {
  const pos = [], col = [], d = inflate, W = lower ? 0.84 : 1;
  const inner = (x) => 0.3 * (x / W) * (x / W), thick = (x) => 0.13 * Math.pow(Math.max(0, 1 - (x / W) * (x / W)), 0.6);
  const tri = (ax, ay, ca, bx, by, cb, cx, cy, cc) => { pos.push(ax, ay, 0, bx, by, 0, cx, cy, 0); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); };
  // the gum: a crescent from inner(x) up to inner(x) + thick(x), its ends pointed
  const N = 16;
  for (let i = 0; i < N; i++) {
    const x0 = -W + (i / N) * 2 * W, x1 = -W + ((i + 1) / N) * 2 * W;
    const a0 = inner(x0) - d, a1 = inner(x1) - d, b0 = inner(x0) + thick(x0) + d, b1 = inner(x1) + thick(x1) + d;
    const e0 = x0 - (i === 0 ? d * 2 : 0), e1 = x1 + (i === N - 1 ? d * 2 : 0);
    tri(e0, a0, IVORY, e1, a1, IVORY, e1, b1, SHADE); tri(e0, a0, IVORY, e1, b1, SHADE, e0, b0, SHADE);
  }
  // the fangs: [x, length, half-width]; long canines outside, set apart from the other jaw's so they pass
  const teeth = lower ? [[-0.6, 0.5, 0.12], [-0.2, 0.2, 0.075], [0.2, 0.2, 0.075], [0.6, 0.5, 0.12]]
    : [[-0.76, 0.62, 0.13], [-0.4, 0.24, 0.085], [-0.13, 0.19, 0.07], [0.13, 0.19, 0.07], [0.4, 0.24, 0.085], [0.76, 0.62, 0.13]];
  const S = 6; // segments down each fang
  for (const [x, L, w] of teeth) {
    const y0 = inner(x) + 0.04, lean = -Math.sign(x) * 0.18 * L; // the tip curves in toward the middle
    // a fang's two edges, from the base to the tip, bowed outward and narrowing to a point
    const edge = (side, k) => {
      const wk = (w + d) * Math.pow(1 - k, 0.85) * (1 + 0.25 * Math.sin(Math.PI * k));
      return [x + side * wk + lean * k * k, y0 + d - (L + d * 1.8) * k];
    };
    for (let i = 0; i < S; i++) {
      const k0 = i / S, k1 = (i + 1) / S, [l0x, l0y] = edge(-1, k0), [l1x, l1y] = edge(-1, k1), [r0x, r0y] = edge(1, k0), [r1x, r1y] = edge(1, k1);
      const m0x = (l0x + r0x) / 2, m1x = (l1x + r1x) / 2, c0 = k0 > 0.7 ? TIP : IVORY, c1 = k1 > 0.7 ? TIP : IVORY;
      // the outer half lit, the inner half (toward the jaw's middle) shaded
      const outerL = x < 0, litL = outerL ? c0 : SHADE, litL1 = outerL ? c1 : SHADE, litR = outerL ? SHADE : c0, litR1 = outerL ? SHADE : c1;
      tri(l0x, l0y, litL, m0x, l0y, litL, l1x, l1y, litL1); tri(m0x, l0y, litL, m1x, l1y, litL1, l1x, l1y, litL1);
      tri(m0x, r0y, litR, r0x, r0y, litR, r1x, r1y, litR1); tri(m0x, r0y, litR, r1x, r1y, litR1, m1x, r1y, litR1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData.shared = true;
  return g;
}

export class BiteFx {
  constructor(scene, camera) {
    this.camera = camera;
    // see-through light, not paint (owner, round 6): the teeth add light over what is behind them, a thin
    // bright rim round each, and a wider soft warm halo
    const geo = { up: halfJaw(0, false), upRim: halfJaw(0.025, false), upHalo: halfJaw(0.09, false), dn: halfJaw(0, true), dnRim: halfJaw(0.025, true), dnHalo: halfJaw(0.09, true) };
    const halo = glowTexture('fire');
    this.jaws = Array.from({ length: JAWS }, () => {
      const add = { transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending };
      const fill = new THREE.MeshBasicMaterial({ vertexColors: true, ...add }), rim = new THREE.MeshBasicMaterial({ color: RIM, ...add }), line = new THREE.MeshBasicMaterial({ color: HALO, ...add });
      const root = new THREE.Group(), up = new THREE.Group(), dn = new THREE.Group();
      up.add(new THREE.Mesh(geo.upHalo, line), new THREE.Mesh(geo.upRim, rim), new THREE.Mesh(geo.up, fill)); dn.add(new THREE.Mesh(geo.dnHalo, line), new THREE.Mesh(geo.dnRim, rim), new THREE.Mesh(geo.dn, fill));
      dn.scale.y = -1; // the lower jaw: mirrored, teeth up
      for (const h of [up, dn]) h.children.forEach((m, i) => { m.renderOrder = 12 + i; });
      for (const m of [...up.children, ...dn.children]) m.frustumCulled = false;
      // a soft warm glow behind the jaw, brightest as it shuts
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.renderOrder = 11; glow.scale.setScalar(2.4);
      root.add(glow, up, dn); root.visible = false; scene.add(root);
      return { root, up, dn, fill, rim, line, glow, t: 9, size: 1, tilt: 0 };
    });
    this.jawI = 0;
  }
  /** A bite at (x, y, z): size its half-width in m, tilt its lean on the screen (rad). */
  bite(x, y, z, size, tilt) {
    const j = this.jaws[this.jawI++ % JAWS];
    j.root.position.set(x, y, z); Object.assign(j, { t: 0, size, tilt }); j.root.visible = true;
  }
  update(dt) {
    const q = this.camera.quaternion;
    for (const j of this.jaws) {
      if (!j.root.visible) continue;
      j.t += dt; const t = j.t;
      if (t >= BITE_SHUT + BITE_HOLD + BITE_BREAK) { j.root.visible = false; continue; }
      // the gap between the halves (in half-widths): wide open, then slammed shut past the middle, then apart
      // squash and stretch: the halves stretch tall as they slam, squash flat on the impact, settle
      let gap, scale = 1, a = 1, shake = 0, sy = 1, glow = 0;
      if (t < BITE_OPEN) { const k = t / BITE_OPEN; gap = 0.95; scale = 0.55 + 0.45 * k * (2 - k); a = Math.min(1, k * 2); glow = 0.2 * k; }
      else if (t < BITE_SHUT) { const k = (t - BITE_OPEN) / BITE_SNAP; gap = 0.95 * (1 - k * k) - 0.12 * k * k; sy = 1 + 0.3 * Math.sin(Math.PI * k); glow = 0.2 + 0.5 * k; }
      else if (t < BITE_SHUT + BITE_HOLD) { const k = (t - BITE_SHUT) / BITE_HOLD; gap = -0.12 + 0.08 * k; shake = 0.03 * (1 - k) * Math.sin(t * 160); sy = 0.82 + 0.18 * Math.min(1, k * 2.5); glow = 0.8 * (1 - k * 0.5); }
      else { const k = (t - BITE_SHUT - BITE_HOLD) / BITE_BREAK; gap = -0.04 + 0.3 * k; scale = 1 + 0.12 * k; a = 1 - k * k; glow = 0.4 * (1 - k); }
      j.root.quaternion.copy(q); j.root.rotateZ(j.tilt);
      j.root.scale.setScalar(j.size * scale);
      j.up.position.set(shake, 0.32 + gap * 0.5, 0); j.dn.position.set(-shake, -0.32 - gap * 0.5, 0);
      j.up.scale.set(1, sy, 1); j.dn.scale.set(1, -sy, 1);
      j.fill.opacity = 0.55 * a; j.rim.opacity = 0.45 * a; j.line.opacity = 0.25 * a; j.glow.material.opacity = 0.5 * glow * a; // (additive: kept low so it stays warm on green grass)
    }
  }
  clear() { for (const j of this.jaws) { j.t = 9; j.root.visible = false; } }
}
