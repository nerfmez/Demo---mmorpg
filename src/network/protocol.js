// Shared, data-driven wire contract. Content IDs only; never asset URLs or save data.
export const PROTOCOL = 3;
export const WORLD_ID = 'frontier-atlas-v1';
export const GEAR_SLOTS = ['weapon', 'offhand', 'armor', 'helm', 'gloves', 'boots'];
export const exact = (o, names) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === names.length && names.every(n => Object.hasOwn(o, n));
export const roomOK = room => typeof room === 'string' && /^[a-z0-9-]{1,24}$/.test(room);
export const identityOK = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
export const MONSTER_BATCH = 12;
export const angleOK = n => Number.isFinite(n) && Math.abs(n) <= Math.PI;
const lookKeys = ['hairStyle', 'hair', 'skin', 'eyes', 'scarf', 'tunic'];
export function createProtocol({ maps, items, skills, monsters }) {
  const regions = Object.entries(maps).map(([id, m]) => {
    const [x, z] = m.atlas?.offset || [0, 0], b = m.bounds;
    return { id, minX: b.minX + x, maxX: b.maxX + x, minZ: b.minZ + z, maxZ: b.maxZ + z };
  });
  // Same half-open ownership as unified-world; exclude the atlas's exterior notch.
  const regionAt = (x, z) => regions.find(b => x >= b.minX && x < b.maxX && z >= b.minZ && z < b.maxZ)?.id
    || regions.find(b => x >= b.minX - 1e-7 && x <= b.maxX + 1e-7 && z >= b.minZ - 1e-7 && z <= b.maxZ + 1e-7)?.id;
  const mapOK = map => map === WORLD_ID || Object.hasOwn(maps, map);
  const gearOK = gear => exact(gear, GEAR_SLOTS) && GEAR_SLOTS.every(slot => {
    const id = gear[slot];
    if (id === null) return true;
    if (typeof id !== 'string' || !Object.hasOwn(items.gearBases, id)) return false;
    const d = items.gearBases[id];
    return d.slot === slot || (slot === 'offhand' && d.slot === 'weapon' && items.weaponTypes[d.weaponType]?.hands === 'light');
  });
  const lookOK = look => exact(look, lookKeys) && ['messy', 'swept', 'ponytail', 'short'].includes(look.hairStyle) && lookKeys.slice(1).every(k => typeof look[k] === 'string' && /^#[0-9a-f]{6}$/i.test(look[k]));
  const poseOK = (p, map) => {
    const b = Object.hasOwn(maps, map) && maps[map].bounds;
    if (!exact(p, map === WORLD_ID ? ['x', 'z', 'facing', 'moving', 'region'] : ['x', 'z', 'facing', 'moving']) || !Number.isFinite(p.x) || !Number.isFinite(p.z) || !angleOK(p.facing) || typeof p.moving !== 'boolean') return false;
    return map === WORLD_ID ? typeof p.region === 'string' && p.region === regionAt(p.x, p.z)
      : !!b && p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
  };
  const actionOK = a => exact(a, ['seq', 'skill', 'phase', 'angle', 'duration', 'step']) && Number.isSafeInteger(a.seq) && a.seq > 0 && a.seq <= 2147483647 && typeof a.skill === 'string' && Object.hasOwn(skills.combat, a.skill) && ['cast', 'charge', 'channel', 'cancel'].includes(a.phase) && angleOK(a.angle) && Number.isFinite(a.duration) && a.duration >= 0 && a.duration <= 3 && Number.isInteger(a.step) && a.step >= 0 && a.step <= 2 && (a.phase !== 'charge' || !!skills.combat[a.skill].charge) && (a.phase !== 'channel' || skills.combat[a.skill].kind === 'channel_cone');
  const playerOK = (p, map) => exact(p, ['id', 'look', 'gear', 'pose']) && identityOK(p.id) && lookOK(p.look) && gearOK(p.gear) && poseOK(p.pose, map);
  // Shared monsters: the room host sends compact rows [key, type, level, x, z, facing, hp, maxHp, state].
  const num = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  const monsterRowOK = r => Array.isArray(r) && r.length === 9 && Number.isSafeInteger(r[0]) && r[0] > 0
    && typeof r[1] === 'string' && !!monsters && Object.hasOwn(monsters.monsters, r[1]) && Number.isInteger(r[2]) && r[2] >= 1 && r[2] <= 99
    && num(r[3], -1e5, 1e5) && num(r[4], -1e5, 1e5) && angleOK(r[5]) && num(r[6], 0, 1e7) && num(r[7], 1, 1e7) && r[6] <= r[7]
    && typeof r[8] === 'string' && /^[a-z]{1,12}$/.test(r[8]);
  const monstersOK = list => Array.isArray(list) && list.length <= MONSTER_BATCH && list.every(monsterRowOK) && new Set(list.map(r => r[0])).size === list.length;
  const monsterHitOK = h => exact(h, ['key', 'amount']) && Number.isSafeInteger(h.key) && h.key > 0 && Number.isInteger(h.amount) && h.amount >= 1 && h.amount <= 1e6;
  return { mapOK, regionAt, gearOK, lookOK, poseOK, actionOK, playerOK, monstersOK, monsterHitOK };
}
// Transport uses atlas coordinates, while the core and renderer keep their fixed session origin.
export function presencePose(game) {
  const p = game.player, pose = { x: p.x, z: p.z, facing: Math.atan2(Math.sin(p.facing), Math.cos(p.facing)), moving: !!p.moving };
  if (game.world.unified) {
    [pose.x, pose.z] = game.worldPoint(p.x, p.z);
    pose.region = game.world.regionAt(p.x, p.z)?.id;
  }
  return pose;
}
export function visualGear(gear, items) {
  const base = slot => gear[slot] && items.gearBases[gear[slot]];
  const weapon = base('weapon')?.weaponType || null, offhand = base('offhand');
  return { bases: { ...gear }, weapon, unarmed: !weapon,
    offhand: offhand ? offhand.weaponType || offhand.offhandType || 'shield' : items.weaponTypes[weapon]?.ammo ? 'quiver' : null,
    armor: base('armor')?.look || 'tunic', helm: base('helm')?.look || null, gloves: base('gloves')?.look || null };
}
