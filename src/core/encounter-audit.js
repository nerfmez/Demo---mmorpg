// Read-only audit of the monster -> material -> recipe graph. Does not tune drop rates.
import { encounterLayout, zoneEncounters } from './encounters.js';
import { recipeEquipmentLevel } from './craft-order.js';

export function encounterCraftAudit(data, worlds) {
  const sources = {}, monsters = [], areas = [];
  const add = (drop, source) => {
    if (drop.item === 'gold' || !(drop.chance > 0) || !(drop.max > 0)) return;
    (sources[drop.item] ||= []).push({ ...source, chance: drop.chance, minQuantity: drop.min, maxQuantity: drop.max });
  };
  for (const [mapId, world] of Object.entries(worlds)) {
    const wd = world.data, layout = encounterLayout(world, data);
    for (const zone of wd.zones) {
      const entries = zoneEncounters(world, data, zone.id);
      areas.push({ map: mapId, zone: zone.id, name: zone.nameTh, safe: !!zone.safe, entries });
      for (const entry of entries) {
        const source = { map: mapId, zone: zone.id, monster: entry.id, level: [entry.min, entry.max], kind: entry.kind, points: entry.count };
        monsters.push({ ...source, habitats: entry.habitats });
        for (const drop of data.monsters.monsters[entry.id].drops) add(drop, { ...source, origin: 'monster' });
        for (const drop of wd.zoneDrops?.[zone.id] || []) add(drop, { ...source, origin: 'zone' });
        for (const drop of data.items.upgradeMaterialDrops || []) add(drop, { ...source, origin: 'global' });
      }
    }
    if (layout?.failures.length) areas.push({ map: mapId, failures: layout.failures });
  }
  for (const values of Object.values(sources)) values.sort((a, b) => a.level[0] - b.level[0] || a.monster.localeCompare(b.monster));
  const recipes = Object.entries(data.recipes.recipes).map(([id, recipe]) => {
    const level = recipe.type === 'gear' ? recipeEquipmentLevel(data, recipe) : null;
    const materials = Object.entries(recipe.cost).filter(([m]) => m !== 'gold').map(([material, quantity]) => {
      const found = sources[material] || [], firstLevel = found.length ? found[0].level[0] : null;
      return { material, quantity, firstMonsterLevel: firstLevel, sources: found,
        noMonsterSource: !found.length, laterThanEquipment: level !== null && firstLevel !== null && firstLevel > level };
    });
    return { id, type: recipe.type, result: recipe.result, equipmentLevel: level, gold: recipe.cost.gold || 0, materials,
      review: materials.some(m => m.noMonsterSource || m.laterThanEquipment) };
  });
  const consumers = Object.fromEntries(Object.keys(sources).map(id => [id, recipes.filter(r => r.materials.some(m => m.material === id)).map(r => r.id)]));
  return { note: 'FirstMonsterLevel is the lowest configured monster level, not a guaranteed roll or a combat-difficulty claim. Quest rewards, salvage and trading are separate sources. A higher source level is a review item, not proof of a hard equipment dependency.',
    monsters, areas, sources, consumers, recipes,
    summary: { monsterTypes: Object.keys(data.monsters.monsters).length, spawnGroups: monsters.length,
      recipes: recipes.length, equipment: recipes.filter(r => r.type === 'gear').length,
      reviewRecipes: recipes.filter(r => r.review).length,
      missingMaterials: [...new Set(recipes.flatMap(r => r.materials.filter(m => m.noMonsterSource).map(m => m.material)))] } };
}
