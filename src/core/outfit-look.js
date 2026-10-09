// Outfit base (data/outfits.json, docs/OUTFIT-BASE.md): every worn look starts from a base
// garment set by category (cloth, coat, robe, armor), changed by its style, the armour item and
// the boots item. Pure data: the renderer cuts and
// paints the base garments from `cut`/`palette` and adds the raised `parts`.

const DEFAULT_BOOTS = 'travel_boots';

/**
 * @param {object} gear gearLook() output ({armor, bases: {armor, boots}})
 * @param {object} outfits data/outfits.json
 * @param {object} [look] appearance ({tunic}) for "$tunic" palette entries
 * @returns {{style: string, base: object, skirt: object|null, palette: object, cut: object, parts: string[]}}
 */
export function resolveOutfit(gear = {}, outfits, look = {}) {
  const armorId = gear.bases?.armor, bootsId = gear.bases?.boots || DEFAULT_BOOTS;
  const item = (armorId && outfits.armor[armorId]) || outfits.armor.travel_tunic || {};
  const style = item.style || 'tunic';
  const layers = [outfits.base, outfits.styles[style] || {}, item, outfits.boots[bootsId] || {}];
  const palette = {}, cut = {}, parts = [];
  // the base garment set by category: cloth (the hoodie), coat, robe or armor (shell top + skirt)
  const baseName = (outfits.styles[style] || {}).base || 'cloth';
  const base = { name: baseName, ...outfits.bases[baseName] };
  let skirt = base.skirt ? { ...base.skirt } : null;
  for (const layer of layers) if (layer.skirt) skirt = { ...skirt, ...layer.skirt };
  for (const layer of layers) {
    Object.assign(palette, layer.palette);
    Object.assign(cut, layer.cut);
    for (const p of layer.parts || []) if (!parts.includes(p)) parts.push(p);
    for (const p of layer.drop || []) if (parts.includes(p)) parts.splice(parts.indexOf(p), 1);
  }
  for (const [k, v] of Object.entries(palette)) if (v === '$tunic') palette[k] = look.tunic || '#f1e3cc';
  return { style, base, skirt, palette, cut, parts };
}
