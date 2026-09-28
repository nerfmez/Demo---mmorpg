// Local saves (this browser only): 3 slots, each one character with its progress and
// position. Every read/write is guarded: private mode or blocked storage just means no save,
// never a crash. Export/import codes let a save move between browsers or devices.
const PREFIX = 'frontier.slot.';
const LAST = 'frontier.lastSlot';
const LEGACY = 'frontier-demo.save.v1';
export const SLOT_COUNT = 3;

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};
const remove = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

/** Move the single save from the first demo into slot 1 (once). */
export function migrateLegacy() {
  const raw = read(LEGACY);
  if (!raw || read(PREFIX + 1)) return false;
  try {
    const s = JSON.parse(raw);
    if (s?.character) {
      write(PREFIX + 1, JSON.stringify({ version: 2, savedAt: s.savedAt || Date.now(), character: s.character }));
      write(LAST, '1');
      remove(LEGACY);
      return true;
    }
  } catch {
    /* ignore a broken legacy save */
  }
  return false;
}

export function loadSlot(n) {
  const raw = read(PREFIX + n);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.character ? s : null;
  } catch {
    return null;
  }
}

export function writeSlot(n, character) {
  const ok = write(PREFIX + n, JSON.stringify({ version: 2, savedAt: Date.now(), character }));
  if (ok) write(LAST, String(n));
  return ok;
}

export function deleteSlot(n) {
  remove(PREFIX + n);
  if (read(LAST) === String(n)) remove(LAST);
}

export function lastSlot() {
  const n = Number(read(LAST));
  return n >= 1 && n <= SLOT_COUNT && loadSlot(n) ? n : null;
}

/** Summaries for the slot picker. */
export function listSlots() {
  const out = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const s = loadSlot(n);
    if (!s) {
      out.push({ slot: n, exists: false });
      continue;
    }
    const c = s.character;
    out.push({
      slot: n,
      exists: true,
      name: c.name || 'Wanderer',
      level: c.level || 1,
      jobLevel: c.jobLevel || 1,
      kit: c.kit || 'sword',
      playTime: c.progress?.playTime || 0,
      zones: c.progress?.zones?.length || 1,
      bossKills: c.bossKills || 0,
      bosses: Object.keys(c.progress?.bossKills || {}).length,
      savedAt: s.savedAt || 0,
      appearance: c.appearance || null,
    });
  }
  return out;
}

export function firstEmptySlot() {
  for (let n = 1; n <= SLOT_COUNT; n++) if (!loadSlot(n)) return n;
  return null;
}

/** A text code for a slot (base64 of the JSON). */
export function exportCode(n) {
  const s = loadSlot(n);
  if (!s) return '';
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function importCode(code, n) {
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!s?.character || typeof s.character.level !== 'number') return false;
    return writeSlot(n, s.character);
  } catch {
    return false;
  }
}

export function loadPref(key, fallback) {
  const v = read(`frontier-demo.${key}`);
  return v ?? fallback;
}

export function savePref(key, value) {
  write(`frontier-demo.${key}`, value);
}
