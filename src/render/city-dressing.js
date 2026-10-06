// Placement-ready kit files; all postload CPU work uses the shared city queue.
import { toon } from './toon.js';
import { outlineStructureSteps } from './architecture.js';
import { cityColor } from './city-palette.js';
import { cityNodes, runCitySteps } from './city-work.js';
import { loadCitySource, waitCityLoads } from './city-resources.js';

export async function loadCityDressing(world, root, loader, { owner, signal, resume, stats, assetURL }) {
  const config = world.data.city.dressing;
  if (!config) return { instances: 0, uniqueTypes: 0, assetBytes: 0 };
  const ids = [...new Set(config.placements.map(p => p.asset))], templates = new Map();
  const scenes = await waitCityLoads(Promise.all(ids.map(id => loadCitySource(loader, assetURL(config.assets[id]), owner, signal))), signal);
  await runCitySteps((function* () {
    for (let i = 0; i < ids.length; i++) {
      const scene = scenes[i];
      for (const o of cityNodes(scene)) {
        yield; if (!o.isMesh) continue;
        owner.original(o.material);
        o.material = toon('#' + cityColor(world.data.city, o.material, o.name).getHexString(), { side: o.material.side });
        o.castShadow = false; o.receiveShadow = true;
      }
      yield* outlineStructureSteps(scene); templates.set(ids[i], scene);
    }
    for (const p of config.placements) {
      yield 'dressing clone: ' + p.id;
      const group = templates.get(p.asset).clone(true); group.name = p.id;
      group.position.set(p.x - root.position.x, world.groundY(p.x, p.z) + (p.lift || 0) - root.position.y, p.z - root.position.z);
      group.rotation.y = p.angle; group.scale.setScalar(p.scale); root.add(group); yield;
    }
  })(), { signal, resume, stats });
  return { instances: config.placements.length, uniqueTypes: ids.length, assetBytes: ids.reduce((n, id) => n + config.assets[id].bytes, 0), placedTriangles: config.placements.reduce((n, p) => n + config.assets[p.asset].triangles, 0) };
}
