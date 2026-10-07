// Presentation commands and previews. All payments, rolls and equip rules stay in core/crafting.
import { gearStats, gearRequirements, gearEquipState, enforceEquipment, wornSlot } from '../core/character.js';
import { craft, craftBatch, recipeBlocker, gearUpgradeState, gearUpgradePreview, gearGradeState, gearGradePreview, upgradeGear, promoteGear } from '../core/crafting.js';
import { equipmentItemLevel } from '../core/item-metadata.js';

const copy = value => JSON.parse(JSON.stringify(value));
export const WORKSHOP_OPERATIONS = new Set(['craft', 'craft-arrows', 'craft-batch', 'gear-up', 'gear-grade']);
export const WORKSHOP_REASONS = {
  far: 'กลับไปที่โต๊ะคราฟต์ก่อน · เปิดดูและเปรียบเทียบได้ทุกที่',
  combat: 'ออกจากการต่อสู้ก่อนคราฟต์ลูกธนู', materials: 'วัตถุดิบหรือ Gold ยังไม่พอ',
  max: 'พัฒนาถึงขั้นสูงสุดแล้ว', unknown: 'ไม่พบไอเทมหรือสูตรนี้แล้ว',
  learned: 'เรียนสกิลนี้แล้ว', full: 'ซองลูกธนูเต็มแล้ว', pool: 'ออฟชั่นในกลุ่มไม่พอสำหรับขั้นนี้',
  invalid: 'การตั้งค่าคราฟต์ไม่ถูกต้อง', busy: 'กำลังแสดงผลครั้งก่อน',
};
export const workshopReason = reason => WORKSHOP_REASONS[reason] || 'ยังทำรายการนี้ไม่ได้';

/** No RNG calls, no uid changes, no mutation of equipped/owned items. */
export function forgePreview(game, uid, mode = 'upgrade') {
  const { ch, data } = game, item = ch.gear.find(it => it.uid === Number(uid));
  if (!item) return null;
  const grade = mode === 'grade', state = grade ? gearGradeState(ch, data, item) : gearUpgradeState(ch, data, item);
  const slot = wornSlot(ch, data, item), next = state.cost ? { ...item, grade: grade ? state.grade : item.grade, upgrade: item.upgrade + (grade ? 0 : 1) } : null;
  const source = grade ? { ...item, options: [] } : item;
  const before = gearStats(source, data), after = next ? gearStats(grade ? { ...next, options: [] } : next, data) : before;
  const requirements = next ? (grade ? gearGradePreview(data, item) : gearUpgradePreview(data, item)) : null;
  // A pair's combined requirements may change which hand is automatically put away.
  let unequipped = [];
  if (next && !grade) {
    const simulated = { ...ch, equipped: { ...ch.equipped }, gear: ch.gear.map(it => it.uid === item.uid ? next : it) };
    unequipped = enforceEquipment(simulated, data);
  }
  const pool = grade && next ? data.items.gearBases[item.base].optionPool.filter(id => !item.options.some(o => o.id === id)) : [];
  const extraOptions = grade && next ? Math.max(0, data.items.grades.optionCount[next.grade] - item.options.length) : 0;
  const poolOK = pool.length >= extraOptions;
  const reason = !game.nearby().workbench ? 'far' : !poolOK ? 'pool' : state.reason;
  return { item, next, mode, state, before, after, requirements, unequipped, extraOptions,
    pool, slot, wearableAfter: next ? gearEquipState(ch, data, next, slot).ok : true,
    ok: game.nearby().workbench && state.ok && poolOK, reason };
}

/** Stable inventory order: equipment level, slot, name, uid. Never affordability. */
export function forgeItems(game, slot = 'all') {
  const { ch, data } = game;
  const order = data.items.slots;
  return ch.gear.filter(it => data.items.gearBases[it.base] && (slot === 'all' || data.items.gearBases[it.base].slot === slot))
    .slice().sort((a, b) => equipmentItemLevel(data, a) - equipmentItemLevel(data, b)
      || order.indexOf(data.items.gearBases[a.base].slot) - order.indexOf(data.items.gearBases[b.base].slot)
      || data.items.gearBases[a.base].nameTh.localeCompare(data.items.gearBases[b.base].nameTh, 'th') || a.uid - b.uid);
}

/** Synchronous single command, immediately followed by the normal save callback in the controller.
 * Animation never rolls, pays, awards a quest or mutates an item later. */
export function executeWorkshop(game, action, args = {}) {
  if (!WORKSHOP_OPERATIONS.has(action)) return { ok: false, reason: 'invalid' };
  const { ch, data } = game;
  if (action === 'gear-up' || action === 'gear-grade') {
    const uid = Number(args.uid);
    if (!Number.isSafeInteger(uid) || uid < 1) return { ok: false, reason: 'unknown' };
    const preview = forgePreview(game, uid, action === 'gear-grade' ? 'grade' : 'upgrade');
    if (!preview?.ok) return { ok: false, reason: preview?.reason || 'unknown' };
    const before = copy(preview.item), spent = { ...preview.state.cost };
    const result = action === 'gear-grade' ? promoteGear(ch, data, uid, game.rng) : upgradeGear(ch, data, uid);
    return result.ok ? { ...result, action, before, items: [copy(result.item)], spent } : result;
  }
  const id = args.id, recipe = data.recipes.recipes[id];
  if (!recipe) return { ok: false, reason: 'unknown' };
  const arrow = recipe.type === 'arrow';
  if (arrow && game.inCombat()) return { ok: false, reason: 'combat' };
  if (!arrow && !game.nearby().workbench) return { ok: false, reason: 'far' };
  if (action === 'craft-arrows' && !arrow) return { ok: false, reason: 'invalid' };
  const block = recipeBlocker(ch, data, id);
  if (block) return { ok: false, reason: block };
  if (action === 'craft-batch') {
    const result = craftBatch(ch, data, id, game.rng, args.goal || {});
    if (!result.ok) return result;
    for (const item of result.items) game.notify({ type: 'craft' });
    return { ...result, action, recipeId: id, kind: 'gear', items: result.items.map(copy) };
  }
  // craftArrows has its own live combat gate and its own quest event. Do not notify twice.
  const result = arrow ? game.craftArrows(id) : craft(ch, data, id, game.rng);
  if (!result.ok) return result;
  if (!arrow) game.notify({ type: 'craft' });
  return { ...result, action, recipeId: id, spent: { ...recipe.cost },
    items: result.kind === 'gear' ? [copy(result.item)] : [], resultId: recipe.result };
}

export function workshopCostRows(game, cost = {}) {
  return Object.entries(cost).map(([id, need]) => {
    const have = id === 'gold' ? game.ch.gold : game.ch.materials[id] || 0;
    return { id, need, have, missing: Math.max(0, need - have), name: id === 'gold' ? 'Gold' : game.data.items.materials[id]?.nameTh || id };
  });
}
