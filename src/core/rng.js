// Seeded RNG (mulberry32). Deterministic so the same seed gives the same map and rolls.

export function createRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(weights) {
      // weights: {key: weight}
      let total = 0;
      for (const k in weights) total += weights[k];
      let r = next() * total;
      for (const k in weights) {
        r -= weights[k];
        if (r < 0) return k;
      }
      return Object.keys(weights).pop();
    },
    get state() {
      return s;
    },
    set state(v) {
      s = v >>> 0;
    },
  };
}
