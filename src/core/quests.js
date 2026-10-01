// Quest journal: a main chain that walks the map's journey, plus side quests.
// State lives in character.progress.quests so it saves with the character.

export function questState(ch, id) {
  const q = ch.progress.quests;
  if (!q[id]) q[id] = { status: 'locked', progress: 0 };
  return q[id];
}

/** Make sure the right quests are active; completes quests already satisfied. Returns finished ids. */
export function refreshQuests(ch, data) {
  const Q = data.quests;
  let prevDone = true;
  for (const id of Q.main) {
    const st = questState(ch, id);
    if (st.status === 'locked' && prevDone) st.status = 'active';
    prevDone = st.status === 'done';
  }
  for (const id of Q.side) {
    const st = questState(ch, id);
    if (st.status === 'locked') st.status = 'active';
  }
  const finished = [];
  for (const id of [...Q.main, ...Q.side]) {
    const st = questState(ch, id);
    if (st.status !== 'active') continue;
    const def = Q.quests[id];
    const p = ch.progress;
    if (def.type === 'waypoint' && p.waypoints.includes(def.target)) st.progress = def.count;
    if (def.type === 'zone' && p.zones.includes(def.target)) st.progress = def.count;
    if (def.type === 'job' && ch.jobNodes.some((n) => data.jobtree.nodes[n].type === 'job')) st.progress = def.count;
    if (def.type === 'socket') st.progress = Math.min(def.count, p.socketed || 0);
    if (st.progress >= def.count) {
      st.status = 'done';
      finished.push(id);
    }
  }
  // A discovery can finish a main quest without a later kill/craft event. Unlock
  // the next step immediately, including already-discovered waypoint steps.
  return finished.length ? finished.concat(refreshQuests(ch, data)) : finished;
}

/** Feed a game event into the journal. Returns quest ids completed by it. */
export function questEvent(ch, data, ev) {
  const Q = data.quests;
  for (const id of [...Q.main, ...Q.side]) {
    const st = questState(ch, id);
    if (st.status !== 'active') continue;
    const def = Q.quests[id];
    if (def.type === 'kill' && ev.type === 'kill' && ev.target === def.target) st.progress++;
    if (def.type === 'collect' && ev.type === 'collect' && ev.item === def.target) st.progress += ev.qty || 1;
    if (def.type === 'craft' && ev.type === 'craft') st.progress++;
  }
  const finished = refreshQuests(ch, data);
  // a finished main quest may unlock the next one that is already satisfied
  return finished.concat(refreshQuests(ch, data));
}

/** The quest to show in the HUD tracker: the active main quest, else any active side quest. */
export function trackedQuest(ch, data) {
  const Q = data.quests;
  for (const id of Q.main) if (questState(ch, id).status === 'active') return id;
  for (const id of Q.side) if (questState(ch, id).status === 'active') return id;
  return null;
}
