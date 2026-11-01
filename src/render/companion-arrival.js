// The hunter's companions do not appear by magic: called, each comes in from the wild to where the rules
// put it (core: spawnAllies, beside the hero). The view (view.js syncAllies, the FX bench) draws the rig along
// this path for its first moments and the call effect (skillfx/call-fx.js) dresses it; both read it here so
// they agree. The wolf runs in and leaps the last stretch, the bear lumbers in and lands heavy, the eagle
// dives down out of the sky. The path starts behind the hero to one side (picked from the ally's id) and ends
// on the companion where the rules have it now (it may already be running at its prey).
const ARRIVAL = {
  hunt_hound: { dist: 6.5, dur: 0.6, hop: 0.55, leap: 0.35 },
  pack_hound: { dist: 7.5, dur: 0.65, hop: 0.45, leap: 0.35 },
  hunt_bear: { dist: 6, dur: 0.9, hop: 0.18, leap: 0.25 },
  hunt_hawk: { dist: 5, dur: 0.8, fly: 6.5 },
};
export const arrives = (type) => !!ARRIVAL[type];
export const arrivalTime = (type) => ARRIVAL[type]?.dur || 0;

/** Where it comes from: from behind the hero (facing: the hero's facing), off to a side chosen by its id, out
 * past where it is called to. out: {x, z} */
export function arrivalFrom(type, id, x, z, facing, out) {
  const A = ARRIVAL[type], h = (((Number(id) || 0) * 2654435761) % 1000) / 1000;
  const back = facing + Math.PI + (h < 0.5 ? -1 : 1) * (0.35 + h * 0.5);
  out.x = x + Math.sin(back) * A.dist; out.z = z + Math.cos(back) * A.dist;
  return out;
}

/** The point on its way at t s (from: arrivalFrom; to: where it lands). out: {x, y, z, k (0..1), facing}. */
export function arrivalAt(type, t, from, toX, toZ, out) {
  const A = ARRIVAL[type], k = Math.min(1, Math.max(0, t / A.dur));
  // it closes fast and eases into the landing
  const e = 1 - (1 - k) * (1 - k);
  out.x = from.x + (toX - from.x) * e; out.z = from.z + (toZ - from.z) * e;
  out.facing = Math.atan2(toX - from.x, toZ - from.z);
  out.k = k;
  if (A.fly) out.y = A.fly * (1 - e) * (1 - e) * (1 + 0.3 * Math.sin(Math.PI * e)); // down out of the sky in a swoop
  else { const lk = Math.max(0, (k - (1 - A.leap)) / A.leap); out.y = A.hop * Math.sin(Math.PI * lk); } // the last leap
  return out;
}
