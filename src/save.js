// Local save (this browser only). Every read/write is guarded: private mode or
// blocked storage just means no save, never a crash.
const KEY = 'frontier-demo.save.v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.character && s.character.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function writeSave(game, extra = {}) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ character: game.ch, savedAt: Date.now(), ...extra }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadPref(key, fallback) {
  try {
    return localStorage.getItem(`frontier-demo.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(`frontier-demo.${key}`, value);
  } catch {
    /* ignore */
  }
}
