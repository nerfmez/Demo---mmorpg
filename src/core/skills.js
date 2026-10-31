// Skill Core + Skill Mod. computeSkill() folds a skill, its level, its socketed mods and the
// character's derived stats into one flat description that the simulation executes.

import { meetsRequires, meetsStats } from './character.js';
import { compileFrontier } from './frontier-content.js';
import { applyBars, growthOf } from './skill-growth.js';

export function skillDef(data, id) {
  return data.skills.combat[id] || null;
}

export function movementDef(data, id) {
  return data.skills.movement[id] || null;
}

export function modDef(data, id) {
  const def = data.mods.mods[id];
  return def ? { ...def, id } : null;
}

/** Does this mod fit this skill? Returns {ok, reason}. */
/** A mod's stat requirement at `level`: every rank above the first asks for more. */
export function modRequires(data, mod, level = 1) {
  const step = data.progression.modUpgrade.requiresStatPerLevel || 0;
  return Object.fromEntries(Object.entries(mod?.requires || {}).map(([k, v]) => [k, v + step * (level - 1)]));
}

/** A combat skill's stat requirement at skill `level` (owner, 2026-10-29, docs/STATS-TH.md): its listed
 * requires (or skillUpgrade.require.base of its upgradeStat) plus require.perLevel for every level above
 * the first, shared by the listed stats in proportion. */
export function skillRequires(data, def, level = 1) {
  const r = data.progression.skillUpgrade.require, req = { ...(def?.requires || {}) };
  if (!Object.keys(req).length && def?.upgradeStat) req[def.upgradeStat] = r.base;
  const total = Object.values(req).reduce((a, v) => a + v, 0) || 1, grow = r.perLevel * (Math.max(1, level) - 1);
  return Object.fromEntries(Object.entries(req).map(([k, v]) => [k, Math.round(v + grow * v / total)]));
}

/** The level a skill or mod works at: its own, held down to the highest level whose requirement the stats
 * meet (0: not even the first). requiresAt(level) gives the requirement. */
export function levelInUse(stats, level, requiresAt) {
  for (let L = Math.max(1, level); L >= 1; L--) if (meetsStats(stats, requiresAt(L)).ok) return L;
  return 0;
}

const ELEMENTS = ['Fire', 'Cold', 'Lightning', 'Poison'];

/**
 * One rule for every mod: the skill's visible tags, plus the `grants` of companion mods that
 * fit the bare skill, must contain ALL of `needs`, ANY of `on` (when listed) and NONE of `not`.
 * Two mods of the same `family` never share a skill. Returns {ok, reason, tags?}.
 */
export function modFits(skill, mod, companions = []) {
  if (!skill || !mod) return { ok: false, reason: 'unknown' };
  const others = companions.filter(c => c && c !== mod && (c.id === undefined || c.id !== mod.id));
  if (mod.family && others.some(c => c.family === mod.family)) return { ok: false, reason: 'family', family: mod.family };
  const tags = new Set(skill.tags || []);
  for (const c of others) if (c.grants && modFits(skill, c).ok) for (const t of c.grants) tags.add(t);
  const missing = (mod.needs || []).filter(t => !tags.has(t));
  if (missing.length) return { ok: false, reason: 'needs', tags: missing };
  if (mod.on?.length && !mod.on.some(t => tags.has(t))) return { ok: false, reason: 'on', tags: mod.on };
  const blocked = (mod.not || []).filter(t => tags.has(t));
  if (blocked.length) return { ok: false, reason: 'not', tags: blocked };
  return { ok: true };
}

/** Mod sockets a combat skill has at skill `level` (mods.json slotsByRank, each from its slotLevels level). */
export function modSlotsFor(data, level = 1) {
  const by = data.mods.slotsByRank, from = data.mods.slotLevels || by.map((_, i) => i + 1);
  let n = by[0];
  from.forEach((L, i) => { if (level >= L) n = by[i]; });
  return n;
}
export const maxModSlots = data => Math.max(...data.mods.slotsByRank);

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
  // a skill above what the stats allow works at the highest level they meet (never switched off for it)
  const stats = derived.stats || ch.stats, owned = ch.skills[slot.skill] || 1;
  const inUse = levelInUse(stats, owned, (L) => skillRequires(data, def, L)), level = Math.max(1, inUse);
  const levelMult = 1 + data.progression.skillUpgrade.perLevel * (level - 1);
  const tags = new Set(def.tags);
  const s = {
    id: slot.skill,
    slot: slotIndex,
    def,
    charge: def.charge ? { ...def.charge } : null,
    kind: def.kind,
    tags,
    level,
    owned,
    element: def.element,
    range: def.range || 0,
    radius: def.radius || 0,
    arc: def.arc || 0,
    // speed (hastePct, one stat): casting and the cooldown after it both run 1 + speed/100 times faster,
    // so each point adds the same number of casts per second (owner, 2026-10-27)
    cooldown: def.cooldown / (1 + (derived.hastePct || 0) / 100),
    castTime: def.castTime / (1 + (derived.hastePct || 0) / 100),
    // the mana cost grows with the rank faster than the damage, and each active mod multiplies it (below)
    costScale: (1 + (data.progression.skillUpgrade.manaPerLevel || 0) * (level - 1)) * (1 - (derived.manaCostReductionPct || 0) / 100),
    costMult: 1,
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
    chill: def.chill ? { ...def.chill } : null,
    slow: def.slow || 0,
    reflect: 0,
    tauntRadius: 0,
    trigger: null,
    damageMult: 1,
    // a skill can strike more than once on its own (base repeats); a repeat mod adds to it
    repeats: def.repeats || 0,
    repeatMult: def.repeatMult || 0,
    repeatDelay: def.repeatDelay || 0,
    knock: def.knock || 0,
    leech: derived.leechPct || 0,
    // Some skills need a weapon type in the right hand (requiresWeapon); stats and weapon both gate the cast.
    weaponOk: (!def.requiresWeapon || def.requiresWeapon.includes(derived.weaponType)) && (!def.requiresOffhand || derived.offhand === def.requiresOffhand),
    requirementsMet: inUse > 0 && (!def.requiresWeapon || def.requiresWeapon.includes(derived.weaponType)) && (!def.requiresOffhand || derived.offhand === def.requiresOffhand),
    mods: [],
  };

  // power and "increased" modifiers
  const power = def.power === 'attack' ? derived.attack : def.power === 'spell' ? derived.magic : stats.VIT;
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

  // Line Breaker: a greatshield skill also hits harder with the hero's defense (damage.defenseScale)
  if (def.damage) s.damage = (def.damage.base + def.damage.scale * power + (def.damage.defenseScale || 0) * derived.defense) * levelMult * (1 + inc / 100);
  if (def.heal) s.heal = (def.heal.base + def.heal.scale * power) * levelMult * (1 + derived.healPct / 100);
  if (def.barrier) s.barrier = (def.barrier.base + def.barrier.scale * power) * levelMult * (1 + derived.barrierPct / 100);
  if (def.kind === 'curse_zone') {
    s.takenMult = 1 + (def.takenMult - 1) * levelMult;
    s.dealtMult = Math.max(0.5, 1 - (1 - def.dealtMult) * levelMult);
  }
  if (def.kind === 'buff') {
    s.damageBuff = (def.damageBuff || 0) * levelMult;
    s.speedBuff = def.speedBuff || 0;
    // takenMult: damage taken while buffed (0.8 = 20% less); a higher skill level cuts a little more
    // (a buff's price, takenMult > 1 like Berserk's, does not grow with the level)
    s.takenMult = !def.takenMult ? 1 : def.takenMult > 1 ? def.takenMult : Math.max(0.5, 1 - (1 - def.takenMult) * levelMult);
    s.steady = !!def.steady; // no knockback while buffed
  }
  if (def.summon) {
    const sm = def.summon;
    s.summon = {
      type: sm.type,
      count: sm.count,
      life: sm.life,
      hp: Math.round(sm.hp.base + sm.hp.vit * stats.VIT + sm.hp.level * ch.level),
      damage: (sm.damage.base + sm.damage.scale * derived.magic) * levelMult * (1 + derived.summonDamagePct / 100),
      speed: sm.speed,
      range: sm.range,
      attackCooldown: sm.attackCooldown,
    };
  }
  if (tags.has('Area') && s.radius) s.radius *= 1 + derived.areaRadiusPct / 100;
  if (tags.has('Melee')) s.arc += derived.meleeArcAdd;

  const modLevel = (m, L) => levelInUse(stats, L, (l) => modRequires(data, m, l));
  const companionMods = slot.mods.map(uid => ch.mods.find(m => m.uid === uid)).filter(i => i && modDef(data, i.id))
    .filter(i => modLevel(modDef(data, i.id), i.level || 1) > 0).map(i => modDef(data, i.id));
  let radiusMult = 1, castTimeMult = 1;
  // bars (core/skill-growth.js): the rate bar's speed joins the haste a mod adds
  let hasteAdd = applyBars(data, s, def, growthOf(ch, data, slot.skill));
  const activeMods = [];
  for (const uid of slot.mods) {
    const inst = ch.mods.find((m) => m.uid === uid);
    if (!inst) continue;
    const m = modDef(data, inst.id);
    if (!m) continue;
    const fit = modFits(def, m, companionMods);
    const e = m.effect;
    // a mod above what the stats allow works at the highest level they meet
    const L = Math.max(1, modLevel(m, inst.level || 1));
    const active = fit.ok && modLevel(m, inst.level || 1) > 0;
    s.mods.push({ id: inst.id, level: L, active, reason: fit.ok ? (active ? null : 'requires') : fit.reason });
    if (!active) continue; // socketed but inactive until stats are met
    activeMods.push({mod:m,level:L});
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
    if (e.echoDelay) s.echo = { delay: e.echoDelay, mult: lv(e.echoMult, L) * (1 + derived.echoDamagePct / 100) };
    if (e.arcAdd) {
      s.arc += lv(e.arcAdd, L);
      s.range += lv(e.rangeAdd, L);
      if (s.kind === 'melee_nova') s.radius += lv(e.rangeAdd, L);
    }
    if (e.element) {
      // An element shift replaces the skill's own status: cold chills, fire burns, never both.
      s.element = e.element;
      s.chill = e.chillSlow ? { slow: Math.max(s.chill?.slow || 0, lv(e.chillSlow, L)), duration: Math.max(s.chill?.duration || 0, e.chillDuration) } : null;
      s.burnChance = e.burnChance ? Math.max(s.burnChance, lv(e.burnChance, L)) : 0;
    }
    if (e.reflect) {
      s.reflect = lv(e.reflect, L);
      s.tauntRadius = e.tauntRadius;
    }
    if (e.repeats && s.def.repeats) s.repeats += lv(e.repeats, L);
    else if (e.repeats) {
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
    if (e.costMult) s.costMult *= e.costMult;
    if (e.hasteAdd) hasteAdd += lv(e.hasteAdd, L);
    if (e.castTimeMult) castTimeMult *= e.castTimeMult;
    if (e.projectileSpeedMult) s.speed *= e.projectileSpeedMult;
    if (e.noCrit) s.noCrit = true;
    if (e.noStatus) s.noStatus = true;
    if (e.effectDurationMult) s.effectDurationMult = lv(e.effectDurationMult, L);
    if (e.mpOnHit) s.mpOnHit = (s.mpOnHit || 0) + lv(e.mpOnHit, L);
  }
  if (s.damage) {
    const finalLineInc = lineInc(tags, s.element);
    if (finalLineInc !== baseLineInc) s.damage *= (1 + (inc - baseLineInc + finalLineInc) / 100) / (1 + inc / 100);
  }
  if (s.durationMult && (s.kind === 'dot_zone' || s.kind === 'heal_zone')) s.duration *= s.durationMult;
  // Prolong: buffs, curses, barriers and walls (fields have Lingering)
  if (s.effectDurationMult && ['buff', 'curse_zone', 'self_barrier', 'wall'].includes(s.kind)) s.duration *= s.effectDurationMult;
  // Quicken: this skill's own speed joins the character's, under the same cap (the top speed stays)
  if (hasteAdd) {
    const h = Math.min(data.progression.character.caps.hastePct ?? Infinity, (derived.hastePct || 0) + hasteAdd);
    s.cooldown = def.cooldown / (1 + h / 100);
    s.castTime = def.castTime / (1 + h / 100);
  }
  s.castTime *= castTimeMult;
  if (s.growthCooldown) s.cooldown *= s.growthCooldown; // the bars' cooldown cost, after speed
  // weapon weight (owner, 2026-10-31): a heavy weapon swings its main attacks slower and harder by
  // progression.combat.weaponTempo, its MP per press alike: the same per second, a heavier rhythm
  const weight = def.power === 'attack' && def.cooldown <= (data.progression.combat.mainSkillCooldown ?? 2.4) ? data.progression.combat.weaponTempo?.[derived.weaponType] || 1 : 1;
  if (weight !== 1) { s.cooldown *= weight; if (s.damage) s.damage *= weight; s.costMult *= weight; s.weaponWeight = weight; }
  // Elemental Focus: the hit grows, the element's status (burn, chill) is gone
  if (s.noStatus) { s.chill = null; s.burnChance = 0; }
  // Apply tag-specific passives after mods; socket order cannot change the result.
  s.radius *= radiusMult;
  const lasting = 1 + (derived.persistentDurationPct || 0) / 100;
  const dot = 1 + (derived.dotDamagePct || 0) / 100;
  if (s.kind === 'dot_zone') s.damage *= dot;
  if (['dot_zone', 'heal_zone'].includes(s.kind)) s.duration *= lasting;
  const control = 1 + (derived.controlDurationPct || 0) / 100;
  if (s.chill) s.chill.duration *= control;
  if (s.kind === 'curse_zone') s.duration *= control;
  // DEX 100 (core/stat-perks.js): every skill reaches further
  const reach = derived.perks?.dex_reach;
  if (reach) {
    s.range *= 1 + reach.rangePct / 100;
    if (s.kind === 'melee_nova') s.radius *= 1 + reach.rangePct / 100;
  }
  // STR 50: melee skills sweep wider (a cut's arc, a spin's radius)
  const wide = derived.perks?.str_wide;
  if (wide && tags.has('Melee')) {
    s.arc *= 1 + wide.widthPct / 100;
    if (s.kind === 'melee_nova') s.radius *= 1 + wide.widthPct / 100;
  }
  s.arc = Math.min(s.arc, 360);
  s.leech = Math.min(s.leech, data.progression.character.caps.leechPct);
  compileFrontier(s, def, activeMods);
  if (s.damage !== undefined) s.damage *= s.damageMult;
  // Mana (owner, after PoE/Undecember): every mod raises the cost, and so does a channel's drain;
  // only attacks gain MP on hit (gear options, the MP journal line, a mod).
  s.costScale *= s.costMult;
  s.cost = def.cost * s.costScale;
  if (s.channel) s.channel.manaPerSecond = def.channel.manaPerSecond * s.costScale;
  s.mpOnHit = tags.has('Attack') ? (s.mpOnHit || 0) + (derived.mpOnHit || 0) : 0;
  return s;
}

/** A movement skill's rank (1 until AGI upgrades raise it). */
export const movementRank = (ch, id) => ch.movementRanks?.[id] || 1;

export function movementSkill(ch, data, derived) {
  const def = movementDef(data, ch.movement) || movementDef(data, 'dash');
  const up = data.progression.movementUpgrade, rank = movementRank(ch, ch.movement || 'dash') - 1;
  const out = {
    id: ch.movement || 'dash', // none yet during the opening: the button shows the default
    def,
    charge: def.charge ? { ...def.charge } : null,
    kind: def.kind,
    distance: def.distance * (1 + (up?.distancePerLevel || 0) * rank),
    duration: def.duration,
    delay: def.delay || 0, // a blink's gather in place before it jumps
    charges: ch.movement && ch.movementSkills.includes(ch.movement) ? def.charges + derived.extraMovementCharges : 0,
    recharge: def.recharge * (1 - (up?.rechargePerLevel || 0) * rank) * (1 - (derived.movementRechargePct || 0) / 100) / (1 + (derived.hastePct || 0) / 100),
    rank: rank + 1,
    invulnerable: def.invulnerable,
  };
  out.mods = [];
  for (const uid of ch.movementMods || []) {
    const inst = ch.mods.find(m => m.uid === uid), mod = inst && modDef(data, inst.id);
    if (!mod) continue;
    const L = levelInUse(derived.stats || ch.stats, inst.level || 1, (l) => modRequires(data, mod, l));
    const active = modFits(def, mod).ok && L > 0;
    out.mods.push({ id: inst.id, uid, active });
    if (!active) continue;
    out.distance *= mod.effect.movementDistanceMult || 1;
    out.charges += mod.effect.movementCharges || 0;
    if (mod.effect.momentumCastSpeed) out.momentum = { speed: lv(mod.effect.momentumCastSpeed, L), window: mod.effect.momentumWindow };
  }
  if (def.landing) out.landing = { radius: def.landing.radius, damage: def.landing.damage.base + def.landing.damage.scale * derived.attack };
  return out;
}

// ---------- Loadout editing ----------

export function equipSkill(ch, data, slotIndex, skillId) {
  if (skillId !== null) {
    if (!ch.skills[skillId]) return { ok: false, reason: 'not_learned' };
    const req = meetsRequires(ch, skillRequires(data, skillDef(data, skillId), 1), data);
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

// -1 = unassigned, -2 = the dedicated movement slot.
export const MOVEMENT_SLOT = -2;
export function modSlotOf(ch, uid) {
  return (ch.movementMods || []).includes(uid) ? MOVEMENT_SLOT : ch.slots.findIndex((s) => s.mods.includes(uid));
}

export function socketMovementMod(ch, data, uid) {
  const inst = ch.mods.find(m => m.uid === uid);
  if (!inst) return { ok: false, reason: 'no_mod' };
  const fit = modFits(movementDef(data, ch.movement), modDef(data, inst.id));
  if (!fit.ok) return { ok: false, reason: fit.reason };
  if ((ch.movementMods || []).includes(uid)) return { ok: false, reason: 'duplicate' };
  if ((ch.movementMods || []).length >= data.mods.maxMovementMods) return { ok: false, reason: 'full' };
  unsocketMod(ch, uid);
  (ch.movementMods ||= []).push(uid);
  if (ch.progress) ch.progress.socketed = (ch.progress.socketed || 0) + 1;
  return { ok: true };
}

export function socketMod(ch, data, slotIndex, uid) {
  const slot = ch.slots[slotIndex];
  if (!slot || !slot.skill) return { ok: false, reason: 'empty_slot' };
  const inst = ch.mods.find((m) => m.uid === uid);
  if (!inst) return { ok: false, reason: 'no_mod' };
  const fit = modFits(skillDef(data, slot.skill), modDef(data, inst.id), slot.mods.map(u => modDef(data, ch.mods.find(m => m.uid === u)?.id)).filter(Boolean));
  if (!fit.ok) return { ok: false, reason: fit.reason };
  if (slot.mods.some((u) => ch.mods.find((m) => m.uid === u)?.id === inst.id)) return { ok: false, reason: 'duplicate' };
  if (slot.mods.length >= modSlotsFor(data, ch.skills[slot.skill])) return { ok: false, reason: 'full' };
  const from = modSlotOf(ch, uid);
  if (from !== -1) unsocketMod(ch, uid);
  slot.mods.push(uid);
  if (ch.progress) ch.progress.socketed = (ch.progress.socketed || 0) + 1;
  return { ok: true };
}

export function unsocketMod(ch, uid) {
  ch.movementMods = (ch.movementMods || []).filter(u => u !== uid);
  for (const s of ch.slots) s.mods = s.mods.filter((u) => u !== uid);
}

export function setMovement(ch, data, id) {
  if (!ch.movementSkills.includes(id)) return { ok: false, reason: 'not_learned' };
  const req = meetsRequires(ch, movementDef(data, id).requires, data);
  if (!req.ok) return { ok: false, reason: 'requires', missing: req.missing };
  ch.movement = id;
  return { ok: true };
}
