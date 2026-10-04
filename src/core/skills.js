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
/** A mod's stat requirement at `level`: every rank above the first asks for more. */
export function modRequires(data, mod, level = 1) {
  const step = data.progression.modUpgrade.requiresStatPerLevel || 0;
  return Object.fromEntries(Object.entries(mod?.requires || {}).map(([k, v]) => [k, v + step * (level - 1)]));
}

const ELEMENTS = ['Fire', 'Cold', 'Lightning', 'Poison'];

export function modFits(skill, mod, companions = []) {
  if (!skill || !mod) return { ok: false, reason: 'unknown' };
  const tags = skill.tags || [];
  if (mod.requiresPersistent && !['dot_zone', 'heal_zone'].includes(skill.kind) && !companions.some(m => m?.effect?.groundDps && modFits(skill, m).ok))
    return { ok: false, reason: 'needs_persistent' };
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
  if (!def) return null;
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
    // castSpeedPct is action speed: casting and the cooldown after it both run faster.
    cooldown: (def.cooldown * (1 - derived.cooldownPct / 100)) / (1 + (derived.castSpeedPct || 0) / 100),
    castTime: def.castTime / (1 + (derived.castSpeedPct || 0) / 100),
    cost: def.cost * (1 + (data.progression.skillUpgrade.manaPerLevel || 0) * (level - 1)) * (1 - (derived.manaCostReductionPct || 0) / 100),
    speed: (def.speed || 0) * (1 + derived.projectileSpeedPct / 100),
    projectileRadius: def.projectileRadius || 0.3,
    delay: def.delay || 0,
    duration: def.duration || 0,
    tick: def.tick || 0.5,
    burnChance: def.burnChance || 0,
    projectiles: 1,
    spread: 0,
    pierce: 0,
    chain: def.chain || 0,
    chainRange: def.chainRange || 0,
    chainFalloff: def.chainFalloff || 1,
    echo: null,
    ground: null,
    chill: def.chill ? { ...def.chill } : null,
    slow: def.slow || 0,
    reflect: 0,
    tauntRadius: 0,
    trigger: null,
    damageMult: 1,
    repeats: 0,
    repeatMult: 0,
    repeatDelay: 0,
    knock: 0,
    leech: derived.leechPct || 0,
    // Some skills need a weapon type in the right hand (requiresWeapon); stats and weapon both gate the cast.
    weaponOk: !def.requiresWeapon || def.requiresWeapon.includes(derived.weaponType),
    requirementsMet: meetsRequires(ch, def.requires).ok && (!def.requiresWeapon || def.requiresWeapon.includes(derived.weaponType)),
    mods: [],
  };

  // power and "increased" modifiers
  const power = def.power === 'attack' ? derived.attack : def.power === 'spell' ? derived.magic : ch.stats.VIT;
  let inc = 0;
  if (tags.has('Melee')) inc += derived.meleeDamagePct;
  if (tags.has('Projectile')) inc += derived.projectileDamagePct;
  if (tags.has('Area') && tags.has('Damage')) inc += derived.areaDamagePct;
  if (tags.has('Spell') && tags.has('Damage')) inc += derived.spellDamagePct;
  // Journal-line increases read the final tags (after mods), so an element-changing mod counts.
  const lineInc = (t, element) => (ELEMENTS.some((e) => t.has(e) || e.toLowerCase() === element) ? derived.elementalDamagePct || 0 : 0)
    + (t.has('Damage') ? derived.damagePct || 0 : 0) + (t.has('Attack') ? derived.attackDamagePct || 0 : 0);
  const baseLineInc = lineInc(tags, def.element);
  inc += baseLineInc;

  if (def.damage) s.damage = (def.damage.base + def.damage.scale * power) * levelMult * (1 + inc / 100);
  if (def.heal) s.heal = (def.heal.base + def.heal.scale * power) * levelMult * (1 + derived.healPct / 100);
  if (def.barrier) s.barrier = (def.barrier.base + def.barrier.scale * power) * levelMult * (1 + derived.barrierPct / 100);
  if (def.kind === 'curse_zone') {
    s.takenMult = 1 + (def.takenMult - 1) * levelMult;
    s.dealtMult = Math.max(0.5, 1 - (1 - def.dealtMult) * levelMult);
  }
  if (def.kind === 'buff') {
    s.damageBuff = def.damageBuff * levelMult;
    s.speedBuff = def.speedBuff;
  }
  if (def.summon) {
    const sm = def.summon;
    s.summon = {
      type: sm.type,
      count: sm.count,
      life: sm.life,
      hp: Math.round(sm.hp.base + sm.hp.vit * ch.stats.VIT + sm.hp.level * ch.level),
      damage: (sm.damage.base + sm.damage.scale * derived.magic) * levelMult * (1 + derived.summonDamagePct / 100),
      speed: sm.speed,
      range: sm.range,
      attackCooldown: sm.attackCooldown,
    };
  }
  if (tags.has('Area') && s.radius) s.radius *= 1 + derived.areaRadiusPct / 100;
  if (tags.has('Melee')) s.arc += derived.meleeArcAdd;

  const companionMods = slot.mods.map(uid => ch.mods.find(m => m.uid === uid)).filter(i => i && modDef(data, i.id))
    .filter(i => meetsRequires(ch, modRequires(data, modDef(data, i.id), i.level || 1)).ok).map(i => modDef(data, i.id));
  let radiusMult = 1;
  for (const uid of slot.mods) {
    const inst = ch.mods.find((m) => m.uid === uid);
    if (!inst) continue;
    const m = modDef(data, inst.id);
    if (!m) continue;
    const fit = modFits(def, m, companionMods);
    const e = m.effect;
    const L = inst.level || 1;
    const active = fit.ok && meetsRequires(ch, modRequires(data, m, L)).ok;
    s.mods.push({ id: inst.id, level: L, active, reason: fit.ok ? (active ? null : 'requires') : fit.reason });
    if (!active) continue; // socketed but inactive until stats are met
    for (const t of m.tags) tags.add(t);
    if (e.extraProjectiles) {
      s.projectiles += lv(e.extraProjectiles, L);
      s.spread = Math.max(s.spread, e.spread);
    }
    if (e.pierce) s.pierce += lv(e.pierce, L);
    if (e.chain) {
      s.chain += lv(e.chain, L);
      s.chainRange = Math.max(s.chainRange, e.chainRange);
    }
    if (e.damageMult && !e.trigger) s.damageMult *= lv(e.damageMult, L);
    if (e.groundDps) s.ground = { dpsMult: lv(e.groundDps, L), duration: e.groundDuration, radius: e.groundRadius };
    if (e.echoDelay) s.echo = { delay: e.echoDelay, mult: lv(e.echoMult, L) * (1 + derived.echoDamagePct / 100) };
    if (e.arcAdd) {
      s.arc += lv(e.arcAdd, L);
      s.range += lv(e.rangeAdd, L);
      if (s.kind === 'melee_nova') s.radius += lv(e.rangeAdd, L);
    }
    if (e.element) {
      s.element = e.element;
      s.chill = { slow: Math.max(s.chill?.slow || 0, lv(e.chillSlow, L)), duration: Math.max(s.chill?.duration || 0, e.chillDuration) };
      s.burnChance = 0;
    }
    if (e.reflect) {
      s.reflect = lv(e.reflect, L);
      s.tauntRadius = e.tauntRadius;
    }
    if (e.repeats) {
      s.repeats = lv(e.repeats, L);
      s.repeatMult = lv(e.repeatMult, L);
      s.repeatDelay = e.repeatDelay;
    }
    if (e.knock) s.knock = lv(e.knock, L);
    if (e.radiusMult) radiusMult *= e.radiusMult;
    if (e.durationMult) s.durationMult = lv(e.durationMult, L);
    if (e.leechPct) s.leech += lv(e.leechPct, L);
    if (e.extraSummons && s.summon) {
      s.summon.count += lv(e.extraSummons, L);
      s.summon.damage *= 1 + lv(e.summonDamage, L);
    }
    if (e.trigger) s.trigger = { on: e.trigger, icd: lv(e.internalCooldown, L), damageMult: lv(e.damageMult, L) };
  }
  if (s.damage) {
    const finalLineInc = lineInc(tags, s.element);
    if (finalLineInc !== baseLineInc) s.damage *= (1 + (inc - baseLineInc + finalLineInc) / 100) / (1 + inc / 100);
  }
  if (s.durationMult) {
    if (s.kind === 'dot_zone' || s.kind === 'heal_zone') s.duration *= s.durationMult;
    if (s.ground) s.ground.duration *= s.durationMult;
  }
  // Apply tag-specific passives after mods; socket order cannot change the result.
  s.radius *= radiusMult;
  const lasting = 1 + (derived.persistentDurationPct || 0) / 100;
  const dot = 1 + (derived.dotDamagePct || 0) / 100;
  if (s.kind === 'dot_zone') s.damage *= dot;
  if (['dot_zone', 'heal_zone'].includes(s.kind)) s.duration *= lasting;
  if (s.ground) {
    s.ground.duration *= lasting;
    if(s.kind !== 'dot_zone') s.ground.dpsMult *= dot;
    s.ground.radius *= radiusMult * (1 + derived.areaRadiusPct / 100);
  }
  const control = 1 + (derived.controlDurationPct || 0) / 100;
  if (s.chill) s.chill.duration *= control;
  if (s.kind === 'curse_zone') s.duration *= control;
  s.arc = Math.min(s.arc, 360);
  s.leech = Math.min(s.leech, data.progression.character.caps.leechPct);
  if (s.damage !== undefined) s.damage *= s.damageMult;
  return s;
}

export function movementSkill(ch, data, derived) {
  const def = movementDef(data, ch.movement) || movementDef(data, 'dash');
  const out = {
    id: ch.movement,
    def,
    kind: def.kind,
    distance: def.distance,
    duration: def.duration,
    charges: def.charges + derived.extraMovementCharges,
    recharge: def.recharge * (1 - (derived.cooldownPct + (derived.movementRechargePct || 0)) / 100),
    invulnerable: def.invulnerable,
  };
  if (def.landing) out.landing = { radius: def.landing.radius, damage: def.landing.damage.base + def.landing.damage.scale * derived.attack };
  return out;
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
  const fit = modFits(skillDef(data, slot.skill), modDef(data, inst.id), slot.mods.map(u => modDef(data, ch.mods.find(m => m.uid === u)?.id)).filter(Boolean));
  if (!fit.ok) return { ok: false, reason: fit.reason };
  if (slot.mods.some((u) => ch.mods.find((m) => m.uid === u)?.id === inst.id)) return { ok: false, reason: 'duplicate' };
  if (slot.mods.length >= data.mods.maxModsPerSkill) return { ok: false, reason: 'full' };
  const from = modSlotOf(ch, uid);
  if (from >= 0) ch.slots[from].mods = ch.slots[from].mods.filter((u) => u !== uid);
  slot.mods.push(uid);
  if (ch.progress) ch.progress.socketed = (ch.progress.socketed || 0) + 1;
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
