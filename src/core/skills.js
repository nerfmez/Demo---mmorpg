// Skill Core + Skill Mod. computeSkill() folds a skill, its level, its socketed mods and the
// character's derived stats into one flat description that the simulation executes.

import { meetsRequires } from './character.js';

export function skillDef(data, id) {
  return data.skills.combat[id] || null;
}

export function movementDef(data, id) {
  return data.skills.movement[id] || null;
}

export function modDef(data, id) {
  return data.mods.mods[id] || null;
}

/** Does this mod fit this skill? Returns {ok, reason}. */
export function modFits(skill, mod) {
  const tags = skill.tags;
  if (mod.requiresAll && !mod.requiresAll.every((t) => tags.includes(t))) return { ok: false, reason: `needs ${mod.requiresAll.join('+')}` };
  if (mod.requiresAny && !mod.requiresAny.some((t) => tags.includes(t))) return { ok: false, reason: `needs ${mod.requiresAny.join('/')}` };
  if (mod.excludes && mod.excludes.some((t) => tags.includes(t))) return { ok: false, reason: `not for ${mod.excludes.join('/')}` };
  return { ok: true };
}

const lv = (v, level) => (Array.isArray(v) ? v[Math.min(level, v.length) - 1] : v);

/**
 * Final parameters for the skill in slot `slotIndex`.
 * Returns null if the slot is empty.
 */
export function computeSkill(ch, data, derived, slotIndex) {
  const slot = ch.slots[slotIndex];
  if (!slot || !slot.skill) return null;
  const def = skillDef(data, slot.skill);
  const level = ch.skills[slot.skill] || 1;
  const levelMult = 1 + data.progression.skillUpgrade.perLevel * (level - 1);
  const tags = new Set(def.tags);
  const s = {
    id: slot.skill,
    slot: slotIndex,
    def,
    kind: def.kind,
    tags,
    level,
    element: def.element,
    range: def.range || 0,
    radius: def.radius || 0,
    arc: def.arc || 0,
    cooldown: def.cooldown * (1 - derived.cooldownPct / 100),
    castTime: def.castTime,
    cost: def.cost,
    speed: (def.speed || 0) * (1 + derived.projectileSpeedPct / 100),
    projectileRadius: def.projectileRadius || 0.3,
    delay: def.delay || 0,
    duration: def.duration || 0,
    tick: def.tick || 0.5,
    burnChance: def.burnChance || 0,
    projectiles: 1,
    spread: 0,
    pierce: 0,
    chain: 0,
    chainRange: 0,
    echo: null,
    ground: null,
    chill: null,
    reflect: 0,
    tauntRadius: 0,
    trigger: null,
    damageMult: 1,
    requirementsMet: meetsRequires(ch, def.requires).ok,
    mods: [],
  };

  // power and "increased" modifiers
  const power = def.power === 'attack' ? derived.attack : def.power === 'spell' ? derived.magic : ch.stats.VIT;
  let inc = 0;
  if (tags.has('Melee')) inc += derived.meleeDamagePct;
  if (tags.has('Projectile')) inc += derived.projectileDamagePct;
  if (tags.has('Area') && tags.has('Damage')) inc += derived.areaDamagePct;
  if (tags.has('Spell') && tags.has('Damage')) inc += derived.spellDamagePct;

  if (def.damage) s.damage = (def.damage.base + def.damage.scale * power) * levelMult * (1 + inc / 100);
  if (def.heal) s.heal = (def.heal.base + def.heal.scale * power) * levelMult * (1 + derived.healPct / 100);
  if (def.barrier) s.barrier = (def.barrier.base + def.barrier.scale * power) * levelMult * (1 + derived.barrierPct / 100);
  if (tags.has('Area') && s.radius) s.radius *= 1 + derived.areaRadiusPct / 100;
  if (tags.has('Melee')) s.arc += derived.meleeArcAdd;

  for (const uid of slot.mods) {
    const inst = ch.mods.find((m) => m.uid === uid);
    if (!inst) continue;
    const m = modDef(data, inst.id);
    if (!modFits(def, m).ok) continue;
    const e = m.effect;
    const L = inst.level || 1;
    s.mods.push({ id: inst.id, level: L, active: meetsRequires(ch, m.requires).ok });
    if (!meetsRequires(ch, m.requires).ok) continue; // socketed but inactive until stats are met
    for (const t of m.tags) tags.add(t);
    if (e.extraProjectiles) {
      s.projectiles += lv(e.extraProjectiles, L);
      s.spread = Math.max(s.spread, e.spread);
    }
    if (e.pierce) s.pierce += lv(e.pierce, L);
    if (e.chain) {
      s.chain += lv(e.chain, L);
      s.chainRange = e.chainRange;
    }
    if (e.damageMult && !e.trigger) s.damageMult *= lv(e.damageMult, L);
    if (e.groundDps) s.ground = { dpsMult: lv(e.groundDps, L), duration: e.groundDuration, radius: e.groundRadius };
    if (e.echoDelay) s.echo = { delay: e.echoDelay, mult: lv(e.echoMult, L) * (1 + derived.echoDamagePct / 100) };
    if (e.arcAdd) {
      s.arc += lv(e.arcAdd, L);
      s.range += lv(e.rangeAdd, L);
    }
    if (e.element) {
      s.element = e.element;
      s.chill = { slow: lv(e.chillSlow, L), duration: e.chillDuration };
      s.burnChance = 0;
    }
    if (e.reflect) {
      s.reflect = lv(e.reflect, L);
      s.tauntRadius = e.tauntRadius;
    }
    if (e.trigger) s.trigger = { on: e.trigger, icd: lv(e.internalCooldown, L), damageMult: lv(e.damageMult, L) };
  }
  s.arc = Math.min(s.arc, 360);
  if (s.damage !== undefined) s.damage *= s.damageMult;
  return s;
}

export function movementSkill(ch, data, derived) {
  const def = movementDef(data, ch.movement);
  return {
    id: ch.movement,
    def,
    kind: def.kind,
    distance: def.distance,
    duration: def.duration,
    charges: def.charges + derived.extraMovementCharges,
    recharge: def.recharge * (1 - derived.cooldownPct / 100),
    invulnerable: def.invulnerable,
  };
}

// ---------- Loadout editing ----------

export function equipSkill(ch, data, slotIndex, skillId) {
  if (skillId !== null) {
    if (!ch.skills[skillId]) return { ok: false, reason: 'not_learned' };
    const req = meetsRequires(ch, skillDef(data, skillId).requires);
    if (!req.ok) return { ok: false, reason: 'requires', missing: req.missing };
    // a skill lives in one slot at a time: swap
    const other = ch.slots.findIndex((s) => s.skill === skillId);
    if (other >= 0 && other !== slotIndex) {
      const tmp = ch.slots[slotIndex];
      ch.slots[slotIndex] = ch.slots[other];
      ch.slots[other] = tmp;
      return { ok: true, swapped: other };
    }
  }
  const slot = ch.slots[slotIndex];
  if (slot.skill !== skillId) slot.mods = [];
  slot.skill = skillId;
  return { ok: true };
}

export function modSlotOf(ch, uid) {
  return ch.slots.findIndex((s) => s.mods.includes(uid));
}

export function socketMod(ch, data, slotIndex, uid) {
  const slot = ch.slots[slotIndex];
  if (!slot || !slot.skill) return { ok: false, reason: 'empty_slot' };
  const inst = ch.mods.find((m) => m.uid === uid);
  if (!inst) return { ok: false, reason: 'no_mod' };
  const fit = modFits(skillDef(data, slot.skill), modDef(data, inst.id));
  if (!fit.ok) return { ok: false, reason: fit.reason };
  if (slot.mods.some((u) => ch.mods.find((m) => m.uid === u)?.id === inst.id)) return { ok: false, reason: 'duplicate' };
  if (slot.mods.length >= data.mods.maxModsPerSkill) return { ok: false, reason: 'full' };
  const from = modSlotOf(ch, uid);
  if (from >= 0) ch.slots[from].mods = ch.slots[from].mods.filter((u) => u !== uid);
  slot.mods.push(uid);
  return { ok: true };
}

export function unsocketMod(ch, uid) {
  for (const s of ch.slots) s.mods = s.mods.filter((u) => u !== uid);
}

export function setMovement(ch, data, id) {
  if (!ch.movementSkills.includes(id)) return { ok: false, reason: 'not_learned' };
  const req = meetsRequires(ch, movementDef(data, id).requires);
  if (!req.ok) return { ok: false, reason: 'requires', missing: req.missing };
  ch.movement = id;
  return { ok: true };
}
