// Persistent metadata: equipment level gates wearable slots; mod grade is presentation only.
export function equipmentItemLevel(data, item) {
  return Number.isSafeInteger(item?.itemLevel) && item.itemLevel > 0
    ? item.itemLevel : data.items.gearBases[item?.base]?.itemLevel || 1;
}

export function validModGrade(data, grade) {
  return data.items.grades.order.includes(grade) ? grade : 'C';
}

/** Optional-field migration, independent of the map/save version. Never consumes RNG. */
export function normalizeItemMetadata(ch, data) {
  for (const item of ch.gear || []) item.itemLevel = equipmentItemLevel(data, item);
  // Old saves have no provenance: use C rather than infer rarity from rank or recipe.
  for (const mod of ch.mods || []) mod.grade = validModGrade(data, mod.grade);
}
