// Pond outlines. A pond is [x, z, r] (a circle) or [x, z, r, wobble]: wobble (about 0.1-0.3)
// bends the rim into a natural outline round the same mean radius r. Terrain carving,
// collision, ground paint and the water mesh all read the rim from here, so they agree.
// The bend is fixed by the pond's centre (no rng draw), so it never moves between loads.
const TERMS = [[2, .55], [3, .38], [4, .24], [5, .16]];

function hash(x, z, k) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Rim radius at a polar angle (atan2(dz, dx)) from the pond's centre. */
export function pondRim(pond, angle) {
  const [x, z, r, wobble = 0] = pond;
  if (!wobble) return r;
  let bend = 0, total = 0;
  for (const [k, a] of TERMS) {
    bend += a * Math.cos(k * angle + hash(x, z, k) * 6.2832);
    total += a;
  }
  return r * (1 + wobble * bend / total);
}

/** Largest rim radius (bounds for loops and meshes). */
export function pondReach(pond) {
  const [, , r, wobble = 0] = pond;
  return r * (1 + wobble);
}

/** Signed distance from the rim: negative inside the water, positive on land. */
export function pondEdgeDistance(pond, x, z) {
  const dx = x - pond[0], dz = z - pond[1];
  return Math.hypot(dx, dz) - pondRim(pond, Math.atan2(dz, dx));
}

/** Distance as if the pond were its circle: scales the radial distance so the rim lands on r. */
export function pondCircleDistance(pond, x, z) {
  const dx = x - pond[0], dz = z - pond[1];
  return Math.hypot(dx, dz) * pond[2] / pondRim(pond, Math.atan2(dz, dx));
}
