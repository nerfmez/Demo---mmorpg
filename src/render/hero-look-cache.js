// Equipment appearance is stable between character changes. Deriving it walks
// the inventory for every slot; doing that at 60 Hz also creates a JSON key every
// frame. Keep that work at character/model changes, without changing game rules.
function changedFields(source, snapshot) {
  let count = 0;
  for (const key in source) {
    if (!Object.hasOwn(source, key)) continue;
    count++;
    const value = source[key];
    // Current look/equipment fields are scalars. Still detect in-place edits to
    // a nested appearance extension instead of silently caching stale visuals.
    const comparable = value && typeof value === 'object' ? JSON.stringify(value) : value;
    if (!Object.hasOwn(snapshot, key) || snapshot[key] !== comparable) return true;
  }
  let oldCount = 0;
  for (const key in snapshot) oldCount++;
  return count !== oldCount;
}

function snapshotFields(source) {
  const out = Object.create(null);
  for (const key in source) if (Object.hasOwn(source, key)) {
    const value = source[key];
    out[key] = value && typeof value === 'object' ? JSON.stringify(value) : value;
  }
  return out;
}

export function cachedHeroLook(view, game, look) {
  let state = view._heroLookCache;
  const equipped = game.ch.equipped || {};
  if (!state || state.game !== game || state.character !== game.ch || state.derived !== game.derived ||
      state.key !== view.heroLookKey || changedFields(look, state.look) || changedFields(equipped, state.equipped)) {
    const gear = game.gearLook();
    state = { game, character: game.ch, derived: game.derived, look: snapshotFields(look), equipped: snapshotFields(equipped),
      gear, key: JSON.stringify([look, gear]) };
    view._heroLookCache = state;
  }
  return state;
}
