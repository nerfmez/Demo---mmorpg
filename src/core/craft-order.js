// Presentation only. Comparators never read inventory, unlock state or resource totals.
import { equipmentItemLevel } from './item-metadata.js';

const names = new Intl.Collator('th', { numeric: true, sensitivity: 'base' });
const slots = ['weapon', 'offhand', 'armor', 'helm', 'gloves', 'boots', 'charm'];
const weapons = ['sword', 'dagger', 'axe', 'mace', 'greatblade', 'bow', 'staff', 'wand'];
const roles = ['attack', 'guard', 'heal', 'control', 'support', 'summon', 'movement'];
const roleNames = { attack: 'โจมตี', guard: 'ป้องกัน', heal: 'ฟื้นฟู', control: 'ควบคุม', support: 'สนับสนุน', summon: 'อัญเชิญ', movement: 'เคลื่อนที่' };
export const CRAFT_STAGES = [
  { name: 'เริ่มง่าย', detail: 'กดใช้ตรงไปตรงมา · รวมฟื้นฟูและป้องกัน' },
  { name: 'เลือกตามสถานการณ์', detail: 'ดูตำแหน่งศัตรู บทบาท และจุดหมาย' },
  { name: 'วางแผนและจัดจังหวะ', detail: 'เล็งล่วงหน้า หรือรักษาศัตรูให้อยู่ในพื้นที่' },
];
const orderOf = (order, id) => { const n = order.indexOf(id); return n < 0 ? order.length : n; };
const label = (data, type) => data.items.weaponTypes?.[type]?.nameTh || type;

export function recipeDefinition(data, recipe) {
  if (recipe.type === 'gear') return data.items.gearBases[recipe.result];
  if (recipe.type === 'skill') return data.skills.combat[recipe.result];
  if (recipe.type === 'movement') return data.skills.movement[recipe.result];
  if (recipe.type === 'mod') return data.mods.mods[recipe.result];
  if (recipe.type === 'arrow') return data.items.arrows.types[recipe.result];
  return {};
}

export function recipeEquipmentLevel(data, recipe) {
  return equipmentItemLevel(data, { base: recipe.result, itemLevel: recipe.itemLevel });
}

/** Explain actual mechanics. These stages are guidance, never use/learn/craft requirements. */
export function skillCraftGuide(data, recipe) {
  const def = recipeDefinition(data, recipe) || {}, tags = def.tags || [];
  let stage = 2, role = 'attack', condition = 'อ่านรูปแบบการใช้งานและเงื่อนไขสกิล';
  switch (def.kind) {
    case 'melee_arc': case 'melee_nova':
      stage = 0; condition = 'เข้าระยะประชิดแล้วกดใช้'; break;
    case 'projectile':
      stage = 0; condition = 'เล็งทิศทางแล้วปล่อยกระสุน'; break;
    case 'counter_stance':
      stage = 2; role = 'guard'; condition = 'หันรับการโจมตีด้านหน้า แล้วกดซ้ำเพื่อสวนกลับ'; break;
    case 'melee_line':
      stage = 2; condition = 'เตรียมฟันแนวตรง · เล็งแนวศัตรูก่อนปล่อย'; break;
    case 'channel_cone':
      stage = 2; condition = 'กดค้างร่ายกรวยไฟ · ใช้ MP ต่อเนื่อง ปล่อยเพื่อหยุด'; break;
    case 'wall':
      stage = 2; role = 'control'; condition = 'วางแนวกั้นชั่วคราว · ต้องมีทางอ้อมและไม่ทับตัวละคร'; break;
    case 'heal_target':
      stage = 0; role = 'heal'; condition = 'ฮีลเพื่อนที่บาดเจ็บหรือตนเอง · ล้างพิษหรือความเย็นหนึ่งอย่าง'; break;
    case 'aura':
      stage = 1; role = 'support'; condition = 'เปิด/ปิดวงฟื้น MP · สำรอง MP สูงสุด 20% ขณะเปิด'; break;
    case 'self_barrier':
      stage = 0; role = 'guard'; condition = `กดใช้ก่อนรับการโจมตี · เพื่อนต้องอยู่ในรัศมี ${def.radius} ม.`; break;
    case 'heal_zone':
      stage = 0; role = 'heal'; condition = 'วางวงบนพื้น แล้วอยู่ในวงเพื่อรับการฟื้นฟู'; break;
    case 'nova':
      stage = 0; role = tags.includes('Control') ? 'control' : 'attack'; condition = 'เกิดรอบตัว · ใช้เมื่อศัตรูเข้าประชิด'; break;
    case 'buff':
      stage = 0; role = 'support'; condition = 'กดใช้ใกล้เพื่อนหรือสัตว์อัญเชิญ ก่อนเริ่มต่อสู้'; break;
    case 'chain':
      stage = 1; condition = `เลือกเป้าหมายแรก · เป้าต่อไปต้องอยู่ใกล้กันภายใน ${def.chainRange} ม.`; break;
    case 'curse_zone':
      stage = 1; role = 'control'; condition = 'เล็งวงใส่ศัตรู · ลดพลังศัตรูและช่วยการโจมตีของทีม'; break;
    case 'summon':
      stage = 1; role = 'summon'; condition = `เรียกผู้ช่วยสู้และล่อเป้า · อยู่ได้ ${def.summon?.life} วินาที`; break;
    case 'ground_area':
      stage = 2; condition = `เล็งจุดล่วงหน้า · ผลเกิดหลัง ${def.delay} วินาที`; break;
    case 'dot_zone':
      stage = 2; role = tags.includes('Control') ? 'control' : 'attack'; condition = 'ล่อหรือคุมศัตรูให้อยู่ในวง เพื่อรับผลต่อเนื่อง'; break;
    case 'dash':
      stage = 0; role = 'movement'; condition = def.invulnerable ? 'เลือกจังหวะหลบ · ไม่รับดาเมจระหว่างเคลื่อนที่' : 'พุ่งตามทิศทาง · ไม่ได้ทำให้คงกระพัน'; break;
    case 'blink':
      stage = 1; role = 'movement'; condition = 'เล็งจุดลงที่ปลอดภัย · ข้ามสิ่งกีดขวางได้'; break;
    case 'leap':
      stage = 1; role = 'movement'; condition = 'เล็งจุดลง · กระแทกศัตรูรอบจุดลง'; break;
  }
  if (def.charge) { stage = 2; condition = 'กดค้างเพื่อชาร์จ แล้วปล่อยยิง · ใช้ MP/ลูกธนูเมื่อปล่อย'; }
  if (def.requiresOffhand) { role = 'guard'; condition += ' · ต้องมีโล่ที่ใช้งานได้'; }
  const types = def.requiresWeapon || [];
  const playstyle = types.length ? types.map(t => label(data, t)).join(' / ')
    : tags.includes('Spell') ? 'เวท · ไม่บังคับประเภทอาวุธ' : 'ไม่บังคับประเภทอาวุธ';
  return { stage, role, roleName: roleNames[role], playstyle, condition,
    weaponOrder: types.length ? Math.min(...types.map(t => orderOf(weapons, t))) : weapons.length };
}

/** Correct the pre-existing War Cry display mismatch without touching its numeric effect. */
export function craftDescription(data, recipe) {
  const def = recipeDefinition(data, recipe) || {};
  if (def.kind === 'buff' && Number.isFinite(def.damageBuff) && Number.isFinite(def.speedBuff))
    return `เสริมพลังตัวเองและพวกพ้องในรัศมี ${def.radius} ม. ดาเมจ +${Math.round(def.damageBuff * 100)}% และความเร็ว +${Math.round(def.speedBuff * 100)}% นาน ${def.duration} วินาที`;
  return def.desc || '';
}

export function compareCraftRecipes(data, [aId, a], [bId, b]) {
  const ad = recipeDefinition(data, a) || {}, bd = recipeDefinition(data, b) || {};
  const kindOrder = { gear: 0, skill: 1, movement: 1, mod: 2, arrow: 3 };
  let diff = (kindOrder[a.type] ?? 4) - (kindOrder[b.type] ?? 4);
  if (diff) return diff;
  if (a.type === 'gear' && b.type === 'gear') {
    diff = recipeEquipmentLevel(data, a) - recipeEquipmentLevel(data, b)
      || orderOf(slots, ad.slot) - orderOf(slots, bd.slot)
      || orderOf(weapons, ad.weaponType) - orderOf(weapons, bd.weaponType);
  } else if (['skill', 'movement'].includes(a.type) && ['skill', 'movement'].includes(b.type)) {
    const ag = skillCraftGuide(data, a), bg = skillCraftGuide(data, b);
    diff = ag.stage - bg.stage || orderOf(roles, ag.role) - orderOf(roles, bg.role)
      || ag.weaponOrder - bg.weaponOrder;
  }
  return diff || names.compare(ad.nameTh || ad.name || aId, bd.nameTh || bd.name || bId)
    || names.compare(ad.name || aId, bd.name || bId) || aId.localeCompare(bId, 'en');
}

export const normalizeCraftQuery = text => String(text || '').normalize('NFKC').toLocaleLowerCase('th').trim();
export function recipeSearchText(data, id, recipe) {
  const def = recipeDefinition(data, recipe) || {};
  const guide = ['skill', 'movement'].includes(recipe.type) ? skillCraftGuide(data, recipe) : null;
  return normalizeCraftQuery([id, def.name, def.nameTh, craftDescription(data, recipe), ...(def.tags || []),
    guide?.roleName, guide?.playstyle, guide?.condition,
    recipe.type === 'gear' ? `Lv.${recipeEquipmentLevel(data, recipe)}` : '',
    ...Object.keys(recipe.cost || {}).map(m => data.items.materials?.[m]?.nameTh || m)].filter(Boolean).join(' '));
}
export function craftQueryMatches(searchText, query) {
  return normalizeCraftQuery(query).split(/\s+/).filter(Boolean).every(term => searchText.includes(term));
}
