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
// Original shapes (no copied art); built once, pooled (4 jaws, 2 shared geometries, 2 materials per jaw).
import * as THREE from 'three';

const JAWS = 4;
export const BITE_OPEN = 0.05, BITE_SNAP = 0.06, BITE_HOLD = 0.11, BITE_BREAK = 0.16;
export const BITE_SHUT = BITE_OPEN + BITE_SNAP; // when the teeth meet (the impact)
const IVORY = new THREE.Color('#fffaf0'), CREAM = new THREE.Color('#f1dcc0'), INK = new THREE.Color('#33232b');

// One half-jaw (the upper; the lower is the same mirrored and narrower), in units of the jaw's half-width:
// an arched gum band and its teeth hanging from the band's lower edge. inflate grows every edge (the outline).
function halfJaw(inflate, lower) {
  const pos = [], col = [], N = 14, W = lower ? 0.9 : 1, d = inflate;
  const inner = (x) => 0.32 * (x / W) * (x / W), thick = (x) => 0.2 * (1 - 0.55 * (x / W) * (x / W));
  const push = (x, y, c) => { pos.push(x, y, 0); col.push(c.r, c.g, c.b); };
  // the gum: a band from inner(x) up to inner(x) + thick(x)
  for (let i = 0; i < N; i++) {
    const x0 = -W - d + (i / N) * 2 * (W + d), x1 = -W - d + ((i + 1) / N) * 2 * (W + d);
    const a0 = inner(x0) - d, a1 = inner(x1) - d, b0 = inner(x0) + thick(x0) + d, b1 = inner(x1) + thick(x1) + d;
    push(x0, a0, IVORY); push(x1, a1, IVORY); push(x1, b1, CREAM);
    push(x0, a0, IVORY); push(x1, b1, CREAM); push(x0, b0, CREAM);
  }
  // the teeth: [x, length, half-width]; the canines outside and longest, set apart from the other jaw's
  const teeth = lower ? [[-0.66, 0.55, 0.13], [-0.22, 0.24, 0.09], [0.22, 0.24, 0.09], [0.66, 0.55, 0.13]]
    : [[-0.8, 0.66, 0.15], [-0.4, 0.28, 0.1], [0, 0.24, 0.09], [0.4, 0.28, 0.1], [0.8, 0.66, 0.15]];
  for (const [x, L, w] of teeth) {
    const y = inner(x) + 0.03, tipX = x * 0.9;
    push(x - w - d, y + d, IVORY); push(x + w + d, y + d, IVORY); push(tipX, y - L - d * 1.6, CREAM);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.userData.shared = true;
  return g;
}

export class BiteFx {
  constructor(scene, camera) {
    this.camera = camera;
    const geo = { up: halfJaw(0, false), upLine: halfJaw(0.06, false), dn: halfJaw(0, true), dnLine: halfJaw(0.06, true) };
    this.jaws = Array.from({ length: JAWS }, () => {
      const fill = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const line = new THREE.MeshBasicMaterial({ color: INK, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const root = new THREE.Group(), up = new THREE.Group(), dn = new THREE.Group();
      up.add(new THREE.Mesh(geo.upLine, line), new THREE.Mesh(geo.up, fill)); dn.add(new THREE.Mesh(geo.dnLine, line), new THREE.Mesh(geo.dn, fill));
      dn.scale.y = -1; // the lower jaw: mirrored, teeth up
      up.children[0].renderOrder = dn.children[0].renderOrder = 12; up.children[1].renderOrder = dn.children[1].renderOrder = 13;
      for (const m of [...up.children, ...dn.children]) m.frustumCulled = false;
      root.add(up, dn); root.visible = false; scene.add(root);
      return { root, up, dn, fill, line, t: 9, size: 1, tilt: 0 };
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
      let gap, scale = 1, a = 1, shake = 0;
      if (t < BITE_OPEN) { const k = t / BITE_OPEN; gap = 0.95; scale = 0.55 + 0.45 * k * (2 - k); a = Math.min(1, k * 2); }
      else if (t < BITE_SHUT) { const k = (t - BITE_OPEN) / BITE_SNAP; gap = 0.95 * (1 - k * k) - 0.12 * k * k; }
      else if (t < BITE_SHUT + BITE_HOLD) { const k = (t - BITE_SHUT) / BITE_HOLD; gap = -0.12 + 0.08 * k; shake = 0.03 * (1 - k) * Math.sin(t * 160); }
      else { const k = (t - BITE_SHUT - BITE_HOLD) / BITE_BREAK; gap = -0.04 + 0.3 * k; scale = 1 + 0.15 * k; a = 1 - k * k; }
      j.root.quaternion.copy(q); j.root.rotateZ(j.tilt);
      j.root.scale.setScalar(j.size * scale);
      j.up.position.set(shake, 0.36 + gap * 0.5, 0); j.dn.position.set(-shake, -0.36 - gap * 0.5, 0);
      j.fill.opacity = a; j.line.opacity = a;
    }
  }
  clear() { for (const j of this.jaws) { j.t = 9; j.root.visible = false; } }
}
