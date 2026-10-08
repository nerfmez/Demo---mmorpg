// Consumables (data/items.json → consumables, shop): potions bought at the town shop and drunk
// from the quick item slots. Pure functions on the plain-JSON character; the Game owns timing
// (group cooldowns) and the shop distance check.

const rules = (data) => data.items.consumables;

/** A fresh character's potions and quick slots. */
export function startingConsumables(data) {
  const c = rules(data);
  const slots = Array.from({ length: c.quickSlots }, (_, i) => c.startSlots?.[i] ?? null);
  return { consumables: { ...(c.start || {}) }, quickItems: slots };
}

/** Keep only known potions with a positive count, and exactly quickSlots slots of known ids. */
export function normalizeConsumables(ch, data) {
  const c = rules(data);
  ch.consumables = Object.fromEntries(Object.entries(ch.consumables || {}).filter(([id, n]) => c.types[id] && n > 0).map(([id, n]) => [id, Math.min(c.stackMax, Math.floor(n))]));
  const slots = (ch.quickItems || []).slice(0, c.quickSlots).map((id) => (id && c.types[id] ? id : null));
  while (slots.length < c.quickSlots) slots.push(null);
  ch.quickItems = slots;
}

export function consumableCount(ch, id) {
  return ch.consumables?.[id] || 0;
}

/** HP/MP a potion gives a hero with these maxima (before capping at the missing amount). */
export function restoreAmount(data, id, maxHp, maxMp) {
  const r = rules(data).types[id]?.restore || {};
  return {
    hp: Math.round((r.hp || 0) + ((r.hpPct || 0) * maxHp) / 100),
    mp: Math.round((r.mp || 0) + ((r.mpPct || 0) * maxMp) / 100),
  };
}

/** Whether `count` of a shop item can be bought now (gold, stack room). Does not change anything. */
export function buyState(ch, data, id, count = 1) {
  const c = rules(data), def = c.types[id];
  if (!def || !data.items.shop.stock.includes(id) || !(count >= 1)) return { ok: false, reason: 'unknown' };
  const cost = def.price * count;
  if (consumableCount(ch, id) + count > c.stackMax) return { ok: false, reason: 'full', cost, room: c.stackMax - consumableCount(ch, id) };
  if (ch.gold < cost) return { ok: false, reason: 'gold', cost };
  return { ok: true, cost };
}

/** Buy `count` potions for gold. A new potion fills the first empty quick slot. Atomic. */
export function buyConsumable(ch, data, id, count = 1) {
  const state = buyState(ch, data, id, Math.floor(count));
  if (!state.ok) return state;
  ch.gold -= state.cost;
  ch.consumables[id] = consumableCount(ch, id) + Math.floor(count);
  if (!ch.quickItems.includes(id)) {
    const free = ch.quickItems.indexOf(null);
    if (free >= 0) ch.quickItems[free] = id;
  }
  return { ok: true, cost: state.cost, count: ch.consumables[id] };
}

/** Put a potion (or nothing) in a quick slot. A potion lives in one slot: it moves. */
export function assignQuickItem(ch, data, slot, id) {
  const c = rules(data);
  if (!(slot >= 0 && slot < c.quickSlots)) return { ok: false, reason: 'slot' };
  if (id !== null && !c.types[id]) return { ok: false, reason: 'unknown' };
  if (id !== null) {
    const from = ch.quickItems.indexOf(id);
    if (from >= 0) ch.quickItems[from] = ch.quickItems[slot] === id ? id : ch.quickItems[slot]; // swap
  }
  ch.quickItems[slot] = id;
  return { ok: true };
}

/** Saved choices are opt-in. Missing/old choices never turn automatic use on. */
export function normalizeAutoPotions(ch, data, { reset = false } = {}) {
  const previous = reset ? {} : ch.autoPotions || {};
  ch.autoPotions = Object.fromEntries(['hp', 'mp'].map(group => {
    const saved = previous[group] || {}, defaults = rules(data).autoUse[group];
    return [group, {
      enabled: saved.enabled === true,
      threshold: typeof saved.threshold === 'number' && Number.isFinite(saved.threshold)
        ? Math.max(1, Math.min(100, Math.round(saved.threshold))) : defaults.threshold,
      potion: rules(data).types[saved.potion]?.group === group ? saved.potion : null,
    }];
  }));
}

export function configureAutoPotion(ch, data, group, changes) {
  if (!['hp', 'mp'].includes(group)) return { ok: false, reason: 'group' };
  if (changes.potion !== undefined && changes.potion !== null && rules(data).types[changes.potion]?.group !== group)
    return { ok: false, reason: 'potion' };
  if (changes.threshold !== undefined && (typeof changes.threshold !== 'number' || !Number.isFinite(changes.threshold)))
    return { ok: false, reason: 'threshold' };
  const current = ch.autoPotions[group];
  ch.autoPotions[group] = { ...current, ...Object.fromEntries(['enabled', 'threshold', 'potion'].filter(key => changes[key] !== undefined).map(key => [key, changes[key]])) };
  normalizeAutoPotions(ch, data);
  return { ok: true };
}

/** Explicit potion, or the first stocked matching quick slot from left to right. No hidden fallback. */
export function automaticPotion(ch, data, group) {
  const choice = ch.autoPotions?.[group]?.potion;
  if (choice) return rules(data).types[choice]?.group === group && consumableCount(ch, choice) > 0 ? choice : null;
  return ch.quickItems.find(id => rules(data).types[id]?.group === group && consumableCount(ch, id) > 0) || null;
}
