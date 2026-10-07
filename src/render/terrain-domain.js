// Terrain margins are finite. Water aprons keep their separate full-edge rule.
// A neighbouring heightfield can replace a margin only where it has vertices.
// Join its decorative skirt to the adjacent playable map without changing rules,
// heightfields, colliders or any rendered height inside this map's playable bounds.
const contains = (hf, x, z) => x >= hf.ox && x <= hf.ox + (hf.w - 1) * hf.res &&
  z >= hf.oz && z <= hf.oz + (hf.h - 1) * hf.res;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function terrainDomain(world, lookup) {
  const offset = world.data.atlas?.offset || [0, 0];
  const joins = (world.seams || []).map(seam => {
    const neighbour = lookup?.(seam.to);
    if (!neighbour) return {seam};
    const otherOffset = neighbour.data.atlas?.offset || [0, 0];
    return {seam, neighbour, dx: offset[0] - otherOffset[0], dz: offset[1] - otherOffset[1]};
  });
  const adjacentDomains = new Map();
  const domain = {
    owns(x, z) {
      return joins.every(({seam: s, neighbour: n, dx, dz}) => {
        if (((s.alongX ? z : x) - world.bounds[s.edge]) * s.outward <= 1e-7) return true;
        return !!n && !contains(n.heightfield, x + dx, z + dz);
      });
    },
    height(x, z, native = world.terrainY(x, z)) {
      let y = native;
      for (const {seam: s, neighbour: n, dx, dz} of joins) {
        if (!n) continue;
        const along = s.alongX ? x : z, min = s.alongX ? 'minX' : 'minZ', max = s.alongX ? 'maxX' : 'maxZ';
        const past = Math.max(world.bounds[min] - along, along - world.bounds[max], 0);
        if (!past) continue; // playable surface, including the boundary, stays byte-identical
        const nx = x + dx, nz = z + dz, otherAlong = s.alongX ? nx : nz;
        if (otherAlong < n.bounds[min] || otherAlong > n.bounds[max]) continue;
        const inward = ((s.alongX ? z : x) - world.bounds[s.edge]) * -s.outward;
        const hf = n.heightfield, back = n.seams.find(b => b.to === world.data.id);
        if (!back) continue;
        const outer = s.alongX ? (back.outward > 0 ? hf.oz + (hf.h - 1) * hf.res : hf.oz)
          : (back.outward > 0 ? hf.ox + (hf.w - 1) * hf.res : hf.ox);
        const margin = Math.max(0, (outer - n.bounds[back.edge]) * back.outward);
        // At the finite grid end, match the entire retained neighbour margin.
        // Towards the playable corner the join contracts continuously to the seam.
        const reach = Math.min(margin, past), feather = Math.min(s.band ?? 24, past);
        const weight = 1 - smooth(reach, reach + feather, Math.max(0, inward));
        if (weight) y += (n.heightfield.heightAt(nx, nz) - y) * weight;
      }
      return y;
    },
    groundHeight(x, z) {
      const native = world.groundY(x, z);
      if (domain.owns(x, z)) return domain.height(x, z, native);
      // Edge trees belong to the source layout but may stand over the neighbour's
      // margin. Retain every instance and seat it on the actual rendered owner.
      for (const {seam: s, neighbour: n, dx, dz} of joins) {
        if (!n || ((s.alongX ? z : x) - world.bounds[s.edge]) * s.outward <= 0 || !contains(n.heightfield,x+dx,z+dz)) continue;
        if (!adjacentDomains.has(n)) adjacentDomains.set(n,terrainDomain(n,lookup));
        return adjacentDomains.get(n).height(x+dx,z+dz,n.groundY(x+dx,z+dz));
      }
      return native;
    },
  };
  return domain;
}
