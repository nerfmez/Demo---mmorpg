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

/** A gear base's option class (data.items.optionPools.classes): weapons by type (greatblades and axes are
 * heavy, a mace heavy or priest when it asks for INT), every offhand a shield, armour by the stat it asks
 * for (VIT plate, AGI leather, INT cloth), charms. */
export function optionClass(base) {
  if (base.slot === 'charm') return 'charm';
  if (base.slot === 'offhand') return 'shield';
  if (base.slot === 'weapon') {
    if (base.weaponType === 'mace') return base.requirementStat === 'INT' ? 'priest' : 'heavy';
    return ['greatblade', 'axe'].includes(base.weaponType) ? 'heavy' : base.weaponType;
  }
  return { VIT: 'plate', AGI: 'leather', INT: 'cloth' }[base.requirementStat];
}
