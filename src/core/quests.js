// One persistent journey; a map is an objective's address, never a journal scope.
// No DOM/renderer dependencies. v8 migration preserves v7 ids, credit and paid rewards.
const validStatuses = new Set(['locked', 'active', 'done']);
const number = value => Number.isFinite(value) && value > 0 ? value : 0;
export const questIds = data => [...new Set([...(data.quests.main || []), ...(data.quests.side || [])])];
export function questObjectives(def) {
  return def.objectives || [{ id: 'primary', type: def.type, target: def.target, count: def.count, world: def.world, labelTh: def.objectiveTextTh || def.descTh }];
}
export function questState(ch, id) {
  ch.progress ||= {};
  ch.progress.quests ||= {};
  return ch.progress.quests[id] ||= { status: 'locked', progress: 0 };
}

/** Explicit save migration. No rewards, discovery, inventory or narrative completion are invented. */
export function migrateQuestJournal(ch, data, { legacy = false } = {}) {
  ch.progress ||= {};
  const p = ch.progress;
  const previous = p.questJournal;
  const upgrading = legacy || !previous;
  p.quests ||= {};
  p.questJournal = { ...(previous || {}), version: 2, trackedId: previous?.trackedId || null, completions: [] };
  for (const [id, st] of Object.entries(p.quests)) {
    const def = data.quests.quests[id];
    if (!def) continue; // Unknown historical records are opaque; preserve every field unchanged.
    if (!st || typeof st !== 'object') { delete p.quests[id]; continue; }
    if (!validStatuses.has(st.status)) st.status = 'locked';
    st.progress = number(st.progress);
    if (upgrading && st.status === 'done') st.rewardClaimed = true;
    const objectives = questObjectives(def);
    st.objectives ||= {};
    for (const o of objectives) {
      const credited = st.objectives[o.id] ?? (o.id === 'primary' ? st.progress : 0);
      st.objectives[o.id] = st.status === 'done' ? o.count : Math.min(o.count, number(credited));
    }
  }
  if (p.questJournal.trackedId && (!questIds(data).includes(p.questJournal.trackedId) || p.quests[p.questJournal.trackedId]?.status !== 'active')) p.questJournal.trackedId = null;
  // v1 paid missions have no receipt: never reconstruct one from today's reward table.
  const seen = new Set();
  for (const receipt of Array.isArray(previous?.completions) ? previous.completions : []) {
    if (!receipt || typeof receipt.id !== 'string' || seen.has(receipt.id) || p.quests[receipt.id]?.status !== 'done' || !p.quests[receipt.id]?.rewardClaimed) continue;
    if (typeof receipt.nameTh !== 'string' || !Array.isArray(receipt.objectives) || !receipt.reward || typeof receipt.reward !== 'object') continue;
    const r = receipt.reward;
    if (receipt.objectives.some(o => !o || typeof o.labelTh !== 'string' || !Number.isFinite(o.count) || o.count <= 0)) continue;
    if (['gold', 'exp', 'jobExp'].some(k => r[k] !== undefined && (!Number.isFinite(r[k]) || r[k] < 0))) continue;
    if (r.skills !== undefined && (!Array.isArray(r.skills) || r.skills.some(id => typeof id !== 'string'))) continue;
    if (r.items !== undefined && (!r.items || typeof r.items !== 'object' || Array.isArray(r.items) || Object.values(r.items).some(n => !Number.isFinite(n) || n < 0))) continue;
    p.questJournal.completions.push(receipt);
    seen.add(receipt.id);
  }
  return p.questJournal;
}
function journal(ch, data) {
  return ch.progress?.questJournal?.version === 2 ? ch.progress.questJournal : migrateQuestJournal(ch, data);
}

/** Persist presentation evidence only after payment; no UI callback can claim a reward. */
export function recordQuestCompletion(ch, data, id, reward) {
  const j = journal(ch, data), def = data.quests.quests[id];
  if (!ch.progress.quests[id]?.rewardClaimed || j.completions.some(r => r.id === id)) return;
  j.completions.push({ id, nameTh: def.nameTh, descTh: def.descTh,
    objectives: questObjectives(def).map(o => ({ labelTh: o.labelTh || def.objectiveTextTh || def.descTh, count: o.count })),
    reward: JSON.parse(JSON.stringify(reward)) });
}
/** Dismiss only the currently presented receipt. Stale/double dismissals are harmless. */
export function dismissQuestCompletion(ch, id) {
  const queue = ch.progress?.questJournal?.completions;
  if (!queue?.length || queue[0].id !== id) return false;
  queue.shift();
  return true;
}
function stateFor(ch, def, id) {
  const st = questState(ch, id);
  st.objectives ||= {};
  for (const o of questObjectives(def)) if (!(o.id in st.objectives)) st.objectives[o.id] = st.status === 'done' ? o.count : o.id === 'primary' ? Math.min(o.count, number(st.progress)) : 0;
  return st;
}
function requirements(data, id) {
  const def = data.quests.quests[id];
  if (def.requires) return def.requires;
  const i = data.quests.main.indexOf(id);
  return i > 0 ? [data.quests.main[i - 1]] : [];
}
export function questPrerequisites(data, id) { return requirements(data, id); }
export function objectiveWorlds(data, objective) {
  if (objective.worlds) return objective.worlds;
  if (objective.world) return [objective.world];
  return [...new Set([data.world.id, ...Object.keys(data.maps || {})])].sort();
}
function discoveryAt(ch, data, worldId) {
  return worldId === (ch.worldId || data.world.id) ? ch.progress : ch.progress.maps?.[worldId] || {};
}
function persistentCredit(ch, data, o) {
  if (o.type === 'waypoint' || o.type === 'zone') {
    const field = o.type === 'waypoint' ? 'waypoints' : 'zones';
    return objectiveWorlds(data, o).some(id => discoveryAt(ch, data, id)[field]?.includes(o.target)) ? o.count : 0;
  }
  if (o.type === 'socket') return number(ch.progress.socketed);
  if (o.type === 'job') return ch.jobNodes?.some(n => data.jobtree.nodes[n]?.type === 'job') ? o.count : 0;
  return 0; // scoped kill/collect credit is never inferred from unscoped lifetime totals
}

/** Unlock to a fixed point, preserving previously active missions even after reordered prerequisites. */
export function refreshQuests(ch, data) {
  const j = journal(ch, data), ids = questIds(data), pending = new Set();
  let changed;
  do {
    changed = false;
    for (const id of ids) {
      const def = data.quests.quests[id], st = stateFor(ch, def, id);
      if (st.status === 'locked' && requirements(data, id).every(prereq => questState(ch, prereq).status === 'done')) { st.status = 'active'; changed = true; }
      if (st.status === 'active') {
        const objectives = questObjectives(def);
        for (const o of objectives) st.objectives[o.id] = Math.min(o.count, Math.max(number(st.objectives[o.id]), persistentCredit(ch, data, o)));
        st.progress = st.objectives.primary || 0; // legacy consumer compatibility; UI uses questProgress
        if (objectives.every(o => st.objectives[o.id] >= o.count)) { st.status = 'done'; st.rewardClaimed = false; changed = true; }
      }
      if (st.status === 'done' && !st.rewardClaimed) pending.add(id);
    }
  } while (changed);
  if (j.trackedId && ch.progress.quests[j.trackedId]?.status !== 'active') j.trackedId = null;
  return [...pending];
}

/** Evidence is scoped at the objective. One event cannot count twice in a newly unlocked successor. */
export function questEvent(ch, data, ev) {
  const before = refreshQuests(ch, data);
  const eventWorld = ev.world || data.world.id;
  for (const id of questIds(data)) {
    const st = questState(ch, id);
    if (st.status !== 'active') continue;
    const def = data.quests.quests[id];
    for (const o of questObjectives(def)) {
      if ((o.world || o.worlds) && !objectiveWorlds(data, o).includes(eventWorld)) continue;
      let amount = 0;
      if (o.type === 'kill' && ev.type === 'kill' && ev.target === o.target) amount = 1;
      if (o.type === 'collect' && ev.type === 'collect' && ev.item === o.target) amount = ev.qty === undefined ? 1 : number(ev.qty);
      if (o.type === 'craft' && ev.type === 'craft') amount = 1;
      st.objectives[o.id] = Math.min(o.count, number(st.objectives[o.id]) + amount);
    }
  }
  return [...new Set([...before, ...refreshQuests(ch, data)])];
}

/** The Game consumes each earned reward once, before any level-up callbacks can re-enter. */
export function claimQuestReward(ch, data, id) {
  journal(ch, data);
  const st = ch.progress.quests[id], def = data.quests.quests[id];
  if (!def || st?.status !== 'done' || st.rewardClaimed || !questIds(data).includes(id)) return null;
  st.rewardClaimed = true;
  return def.reward || {};
}
export function trackQuest(ch, data, id = null) {
  const j = journal(ch, data);
  if (id !== null && (!questIds(data).includes(id) || ch.progress.quests[id]?.status !== 'active')) return false;
  j.trackedId = id;
  return true;
}
export function trackedQuest(ch, data) {
  const pinned = ch.progress?.questJournal?.trackedId;
  if (pinned && questIds(data).includes(pinned) && ch.progress.quests[pinned]?.status === 'active') return pinned;
  return [...data.quests.main, ...data.quests.side].find(id => ch.progress?.quests?.[id]?.status === 'active') || null;
}
/** Read-only view model: opening the journal never activates, completes or pays a mission. */
export function questProgress(ch, data, id) {
  const def = data.quests.quests[id];
  if (!def) return null;
  const st = ch.progress?.quests?.[id] || { status: 'locked', progress: 0 };
  const objectives = questObjectives(def).map(o => ({ ...o, progress: st.status === 'done' ? o.count : Math.min(o.count, number(st.objectives?.[o.id] ?? (o.id === 'primary' ? st.progress : 0))) }));
  return { status: st.status, rewardClaimed: !!st.rewardClaimed, objectives, current: objectives.reduce((n, o) => n + o.progress, 0), total: objectives.reduce((n, o) => n + o.count, 0), next: objectives.find(o => o.progress < o.count) || null };
}
