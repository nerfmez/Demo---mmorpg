// Terrain margins are finite. Water aprons keep their separate full-edge rule.
// A neighbouring heightfield can replace a margin only where it has vertices.
// Join its decorative skirt to the adjacent playable map without changing rules,
// heightfields, colliders or any rendered height inside this map's playable bounds.
import {distToPolyline} from '../core/math.js';

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
  // A neighbouring road can cross a gate whose native layout has no road. Its
  // owner's terrain stops at the boundary, so borrow only its painted approach
  // into this existing seam band, with a soft end in the native meadow.
  const roadExtensions = [];
  for (const {seam: s, neighbour: n, dx, dz} of joins) {
    if (!n || world.roadDist(...s.gate) <= 1) continue;
    const back = n.seams.find(seam => seam.to === world.data.id);
    if (!back) continue;
    const axis = back.alongX ? 1 : 0, band = s.band ?? 24;
    for (const road of n.roads) {
      if (distToPolyline(...back.gate, road.points) > road.width / 2 + 1.5) continue;
      const points = road.points.map(p => p.slice());
      for (const end of [0, points.length - 1]) {
        const p = points[end], q = points[end ? end - 1 : 1];
        const outward = (p[axis] - n.bounds[back.edge]) * back.outward;
        const direction = p[axis] - q[axis];
        if (outward < 0 || outward >= band || direction * back.outward <= 0) continue;
        const t = (n.bounds[back.edge] + back.outward * band - p[axis]) / direction;
        points[end] = [p[0] + (p[0] - q[0]) * t, p[1] + (p[1] - q[1]) * t];
      }
      roadExtensions.push({id:road.id,width:road.width,points:points.map(([x,z])=>[x-dx,z-dz]),
        noiseShift:[dx,dz],sourceCity:n.data.city,seam:s,band});
    }
  }
  const domain = {
    roadExtensions,
    // A native map's exterior forest is backdrop, not planting in a neighbour.
    // At a corner both seam-span checks can miss it; test the complete adjacent
    // playable rectangles in atlas coordinates instead. Native layouts stay intact.
    edgeTreeAllowed(x, z) {
      return joins.every(({neighbour: n, dx, dz}) => {
        if (!n) return true;
        const b = n.bounds, nx = x + dx, nz = z + dz;
        return nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ;
      });
    },
    roadWeight(road,x,z) {
      const {seam:s,band} = road;
      const inward = ((s.alongX ? z : x) - world.bounds[s.edge]) * -s.outward;
      const along = s.alongX ? x : z, past = Math.max(s.span[0] - along, along - s.span[1], 0);
      return (1-smooth(0,band,Math.max(0,inward))) * (1-smooth(0,band,past));
    },
    neighbourSea: joins.find(({neighbour: n}) => world.data.sea && n?.data.sea)?.neighbour.data.sea,
    // Presentation only: both shores contribute equally at their shared edge,
    // then recover their authored beach inside the existing seam band. Rule
    // coastAt/isWater and the heightfield remain map-local and unchanged.
    coastAt(x, z) {
      const native = world.coastAt(x, z), beach = world.data.sea?.beach || 14;
      if (!world.data.sea || native.kind !== 'beach') return {...native, beach, blend: 0};
      for (const {seam: s, neighbour: n, dx, dz} of joins) {
        if (!n?.data.sea || !world.data.sea) continue;
        const inward = ((s.alongX ? z : x) - world.bounds[s.edge]) * -s.outward;
        const band = s.band ?? 24, along = s.alongX ? x : z;
        const past = Math.max(s.span[0] - along, along - s.span[1], 0);
        if (inward >= band || past >= band) continue;
        const otherBeach = n.data.sea.beach || 14;
        const back = Math.max(beach, otherBeach);
        if (native.distance >= back + band) continue;
        const other = n.coastAt(x + dx, z + dz);
        if (other.kind !== 'beach') continue;
        const weight = .5 * (1 - smooth(0, band, Math.max(0, inward))) *
          (1 - smooth(0, band, past)) *
          (1 - smooth(back, back + band, Math.max(native.distance, other.distance)));
        if (!weight) continue;
        return {kind: 'beach', distance: native.distance + (other.distance - native.distance) * weight,
          beach: beach + (otherBeach - beach) * weight, blend: weight};
      }
      return {...native, beach, blend: 0};
    },
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
      // Retained edge trees may stand over a neighbour's decorative margin;
      // seat them on the rendered owner, outside its playable rectangle.
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
