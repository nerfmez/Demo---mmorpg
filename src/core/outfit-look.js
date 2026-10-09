// Outfits by category (data/outfits.json, docs/OUTFIT-BASE.md): the armour's style picks a base
// (cloth, vest, coat or armour), then the style, the armour item, and the boots, gloves and helm
// items each add their own look. Pure data: the renderer builds the base garments from the body,
// cuts and paints them from `cut`/`palette`, and adds the raised `parts`.

const DEFAULT_BOOTS = 'travel_boots';

/**
 * @param {object} gear gearLook() output ({bases: {armor, boots, gloves, helm}})
 * @param {object} outfits data/outfits.json
 * @param {object} [look] appearance ({tunic}) for "$tunic" palette entries
 * @returns {{style: string, base: object, skirt: object|null, palette: object, cut: object, parts: string[],
 *   boots: object, gloves: object|null, helm: object|null}}
 */
export function resolveOutfit(gear = {}, outfits, look = {}) {
  const b = gear.bases || {};
  const item = (b.armor && outfits.armor[b.armor]) || outfits.armor.travel_tunic || {};
  const style = item.style || 'tunic';
  const styleData = outfits.styles[style] || {};
  const baseName = styleData.base || 'cloth';
  const base = { name: baseName, ...outfits.bases[baseName] };
  const layers = [outfits.base, styleData, item];
  const palette = {}, cut = {}, parts = [];
  let skirt = base.skirt ? { ...base.skirt } : null;
  for (const layer of layers) {
    if (layer.skirt) skirt = { ...skirt, ...layer.skirt };
    Object.assign(palette, layer.palette);
    Object.assign(cut, layer.cut);
    for (const p of layer.parts || []) if (!parts.includes(p)) parts.push(p);
    for (const p of layer.drop || []) if (parts.includes(p)) parts.splice(parts.indexOf(p), 1);
  }
  for (const [k, v] of Object.entries(palette)) if (v === '$tunic') palette[k] = look.tunic || '#f1e3cc';
  const piece = (table, id) => {
    const e = id && table[id];
    return e ? { id, len: e.len ?? 0, pattern: e.pattern ?? 0, palette: { ...e.palette }, parts: [...(e.parts || [])] } : null;
  };
  const boots = piece(outfits.boots, b.boots || DEFAULT_BOOTS);
  // the shoes and their soles follow the boots
  palette.shoes = boots.palette.main;
  palette.sole = boots.palette.sole;
  const helmEntry = b.helm && outfits.helms[b.helm];
  return {
    style, base, skirt, palette, cut, parts, boots,
    gloves: piece(outfits.gloves, b.gloves),
    helm: helmEntry ? { id: b.helm, ...helmEntry, palette: { ...helmEntry.palette } } : null,
  };
}
