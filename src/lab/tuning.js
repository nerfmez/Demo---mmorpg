// Generic Lab-only overrides. Walk authored data rather than maintaining skill-specific forms.
export const STORAGE_KEY = 'frontier.skill-lab.tuning.v1';
const clone = (v) => JSON.parse(JSON.stringify(v));
const REPLAY_KEYS = ['castTime', 'speed', 'range', 'projectileRadius', 'spread', 'arc', 'radius', 'delay'];
const HEX = /^#[0-9a-f]{6}$/i;
const COUNTS = /^(embers|wisps|particles|count|trailRate|sparks|rocks|chipCount|dust)$/;
const FRACTIONS = /^(emberShrink|headHeat|headTurbulence|opacity|glowOpacity|trailOpacity|trailCoreWidth|trailStart|zoneOpacity)$/;
const POSITIVE = /size|radius|radii|width|length|life|duration|speed|castTime|range|rise|delay/i;
export const pathValue = (obj, path) => path.reduce((v, k) => v?.[k], obj);
function assign(obj, path, value) {
  const parent = pathValue(obj, path.slice(0, -1));
  parent[path.at(-1)] = value;
}
export function fieldsFor(obj, prefix = []) {
  const fields = [];
  function walk(value, path) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = String(path.findLast((k) => typeof k === 'string') || '');
      const integer = COUNTS.test(key);
      const step = integer || key === 'arc' ? 1 : /speed|range/i.test(key) ? 0.1 : 0.01;
      const min = integer || !POSITIVE.test(key) ? 0 : step;
      const max = integer ? 384 : key === 'arc' ? 360 : FRACTIONS.test(key) ? 1 : Math.max(value * 4, /speed/i.test(key) ? 60 : value < 1 ? 2 : 10);
      fields.push({ path, type: 'number', min, max, step });
    } else if (typeof value === 'string' && HEX.test(value)) {
      fields.push({ path, type: 'color' });
    } else if (typeof value === 'boolean') {
      fields.push({ path, type: 'boolean' });
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) if (!key.startsWith('_')) walk(value[key], [...path, Array.isArray(value) ? Number(key) : key]);
    }
  }
  walk(obj, prefix);
  return fields;
}
function cleaned(field, value) {
  if (field.type === 'color') return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : undefined;
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const bounded = Math.max(field.min, Math.min(field.max, value));
  const stepped = Math.round(bounded / field.step) * field.step;
  return Number(Math.max(field.min, Math.min(field.max, stepped)).toFixed(4));
}
function mergeKnown(target, patch, fields) {
  let applied = 0;
  for (const field of fields) {
    const value = cleaned(field, pathValue(patch, field.path));
    if (value !== undefined) { assign(target, field.path, value); applied++; }
  }
  return applied;
}
function diff(current, base) {
  if (JSON.stringify(current) === JSON.stringify(base)) return undefined;
  if (Array.isArray(current) || !current || typeof current !== 'object') return clone(current);
  const result = {};
  for (const key of Object.keys(base)) {
    const value = diff(current[key], base[key]);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
export class LabTuning {
  constructor(skills, fx, storage = null) {
    this.skills = clone(skills);
    this.fx = clone(fx);
    this.storage = storage;
    this.entries = new Map();
    this.saved = {};
    this.saveError = false;
    try {
      const data = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      if (data?.version === 1 && data.skills && typeof data.skills === 'object') this.saved = data.skills;
    } catch { /* Corrupt/private-mode storage starts with authored defaults. */ }
  }
  get(id) {
    if (this.entries.has(id)) return this.entries.get(id);
    const def = Object.hasOwn(this.skills.combat, id) ? this.skills.combat[id] : null;
    if (!def) throw new Error('Unknown Lab skill');
    const replay = {};
    for (const key of REPLAY_KEYS) if (typeof def[key] === 'number') replay[key] = def[key];
    const authored = this.fx.skills?.[id];
    const look = clone(authored || (['melee_arc', 'melee_nova'].includes(def.kind) ? this.fx.meleeDefaults : this.fx.projectileDefaults));
    const base = { fx: clone(look), replay: clone(replay) };
    const entry = { fx: look, replay, def: clone(def), base, signature: JSON.stringify(base) };
    entry.fields = fieldsFor({ fx: base.fx, replay: base.replay }).filter(field => field.path[0] !== 'fx' || !(look._labFixedFields || []).some(prefix => field.path.slice(1).join('.').startsWith(prefix + '.') || field.path.slice(1).join('.') === prefix));
    const saved = Object.hasOwn(this.saved, id) ? this.saved[id] : null;
    if (saved?.signature === entry.signature) mergeKnown(entry, saved.patch, entry.fields);
    Object.assign(entry.def, replay);
    this.fx.skills[id] = look;
    this.entries.set(id, entry);
    return entry;
  }
  set(id, path, value) {
    const entry = this.get(id);
    const field = entry.fields.find((f) => JSON.stringify(f.path) === JSON.stringify(path));
    if (!field) return false;
    const valid = cleaned(field, value);
    if (valid === undefined) return false;
    assign(entry, field.path, valid);
    if (field.path[0] === 'replay') entry.def[field.path[1]] = valid;
    return true;
  }
  reset(id, section = null) {
    const entry = this.get(id);
    for (const field of entry.fields) {
      if (!section || field.path.slice(0, section.length).every((k, i) => k === section[i])) assign(entry, field.path, pathValue(entry.base, field.path));
    }
    Object.assign(entry.def, entry.replay);
  }
  export(id) {
    const e = this.get(id);
    return { version: 1, skill: id, patch: { fx: diff(e.fx, e.base.fx) || {}, replay: diff(e.replay, e.base.replay) || {} } };
  }
  import(data) {
    if (data?.version !== 1 || typeof data.skill !== 'string' || !Object.hasOwn(this.skills.combat, data.skill) || !data.patch) throw new Error('ไฟล์ค่าปรับไม่ถูกต้อง');
    const e = this.get(data.skill);
    const applied = mergeKnown(e, data.patch, e.fields);
    Object.assign(e.def, e.replay);
    return { skill: data.skill, applied };
  }
  save(id) {
    const e = this.get(id);
    this.saved[id] = { signature: e.signature, patch: this.export(id).patch };
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, skills: this.saved }));
      this.saveError = !this.storage;
    } catch { this.saveError = true; }
    return !this.saveError;
  }
}
