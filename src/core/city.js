// Source-derived walk surfaces. No render imports; usable by the Godot exporter.
import { pointInPolygon, distToPolyline } from './math.js';

export function cityFloorAt(city, x, z, radius = 0) {
  if (!city?.enabled) return null;
  for (const floor of city.floors) {
    if (!pointInPolygon(floor.points, x, z)) continue;
    if (radius > 0) {
      let supported = true;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        if (!pointInPolygon(floor.points, x + Math.sin(a) * radius, z + Math.cos(a) * radius)) { supported = false; break; }
      }
      if (!supported) continue;
    }
    return floor;
  }
  return null;
}

export function cityFloorDistance(city, x, z) {
  let distance = Infinity;
  for (const floor of city?.enabled ? city.floors : []) {
    const p = floor.points;
    distance = Math.min(distance, distToPolyline(x, z, p));
    // Closed edge, since the data does not duplicate its first point.
    const a = p.at(-1), b = p[0], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return distance;
}
