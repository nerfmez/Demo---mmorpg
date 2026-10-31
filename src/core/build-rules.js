// Build balance rules (owner, 2026-10-27). Balance is not one number: every build gets a profile, one
// number per axis (higher is better), and the rules look for builds that are overpowered, not for
// builds that stand out. Standing out in a build's own role (a damage line kills fastest, a guardian
// line lasts longest) is intended and paid for with a clear weakness elsewhere; overpowered means a
// build is at least as good as another of equal cost on every axis (it dominates it) or has no
// weakness at all. Numbers live in data.progression.balance.rules. Pure: no live game.
import { defenseFactor, statTotals } from './character.js';
import { computeSkill, movementSkill, modRequires, skillRequires } from './skills.js';
import { referenceHero, referenceMonster, skillRankAt, farmingIncome } from './balance.js';

export const AXES = ['single', 'pack', 'survival', 'sustain', 'mobility', 'team', 'income'];

// a damage option counts only when the skill can use it (a sword gains nothing from spell damage)
export const USES = {
  attack: (s) => s.power !== 'spell', magic: (s) => s.power === 'spell',
  meleeDamagePct: (s) => s.tags.has('Melee'), projectileDamagePct: (s) => s.tags.has('Projectile'),
  spellDamagePct: (s) => s.tags.has('Spell'), areaDamagePct: (s) => s.tags.has('Area'), summonDamagePct: (s) => s.tags.has('Summon'),
};

/** The stats a gear set adds: each listed option rolled mid-range, spread over every slot. */
export function gearSetStats(data, setId, skillDef) {
  const r = data.progression.balance.rules, ids = r.gearSets[setId] || [];
  const tags = new Set(skillDef.tags || []), probe = { power: skillDef.power, tags };
  const usable = ids.filter((id) => { const st = data.items.gearOptions[id].stat; return !USES[st] || USES[st](probe); });
  const rolls = data.items.slots.length * r.optionsPerItem / Math.max(1, usable.length), out = {};
  for (const id of usable) { const o = data.items.gearOptions[id]; out[o.stat] = (out[o.stat] || 0) + (o.min + o.max) / 2 * rolls; }
  return out;
}

/** How many of a pack one cast reaches, from the skill's shape (area kinds by area, projectiles by pierce). */
export function packTargets(s, pack) {
  const packArea = Math.PI * pack.radius * pack.radius, byArea = (a) => Math.max(1, Math.min(pack.size, pack.size * a / packArea));
  switch (s.kind) {
    case 'melee_arc': return byArea(Math.PI * s.range * s.range * (s.arc || 90) / 360);
    case 'melee_nova': case 'nova': case 'ground_area': case 'dot_zone': return byArea(Math.PI * (s.radius || 1) ** 2);
    case 'melee_line': case 'dash_line': return byArea(s.range * (s.width || s.def?.width || 1));
    case 'channel_cone': return byArea(Math.PI * s.range * s.range * (s.arc || 60) / 360);
    case 'chain': return Math.min(pack.size, 1 + (s.chain || 0));
    case 'projectile': return Math.min(pack.size, (1 + (s.pierce || 0)) * Math.max(1, s.projectiles || 1) + (s.chain || 0)); // a bounce jumps on
    default: return 1;
  }
}

/** Damage one cast deals to each target it reaches, before armour and crit (waves, ticks, repeats, a
 * full charge, an echo and a returning shot counted). Several projectiles are not added here: a pack
 * counts them as separate targets (packTargets), a lone target is reached by fanShots of them. */
export function castDamage(s) {
  let dmg = s.damage || 0;
  if (s.kind === 'dot_zone') dmg *= s.duration / (s.tick || 0.5);
  if (s.def?.waves) dmg *= s.def.waves;
  if (s.repeats) dmg *= 1 + s.repeats * (s.repeatMult || 0);
  if (s.charge) dmg *= s.charge.maxDamageMult || 1;
  if (s.echo) dmg *= 1 + s.echo.mult; // the echo strikes again
  if (s.modEffects?.returnMult) dmg *= 1 + s.modEffects.returnMult; // a returning shot's way back
  if (s.afterShock) dmg *= 1 + s.afterShock.mult; // Thunder Lance: the lane strikes again
  // Flame Arrow Rain: arrows burst over the circle, so a target there is in about count x (blast / radius)^2 of them
  if (s.arrows) dmg *= s.arrows.count * Math.min(1, (s.arrows.blast / Math.max(0.1, s.radius || 1)) ** 2);
  // a zone that stacks poison on each tick (Miasma Arrow): the stacks poison on top of the ticks, on
  // average about two thirds of the way to the most stacks
  if (s.kind === 'dot_zone' && s.poison) dmg *= 1 + s.poison.stackDps * s.poison.maxStacks * (2 / 3) * (s.tick || 0.5);
  return dmg;
}

/** How many of a fan of projectiles reach one lone target: the first, and fanSingleShare of the rest
 * (progression.balance.rules.control.fanSingleShare: close up a big target takes more of the fan). */
export const fanShots = (s, data) => 1 + (Math.max(1, s.projectiles || 1) - 1) * (data.progression.balance.rules.control.fanSingleShare ?? 1);

/** Hits of one cast on a pack: the shape's reach, a chain's falloff along its jumps. */
function packHits(s, pack) {
  if (s.kind !== 'chain') return packTargets(s, pack);
  let sum = 0;
  const hops = Math.min(pack.size, 1 + (s.chain || 0)), forks = Math.min(hops, pack.size - hops);
  for (let k = 0; k < hops; k++) sum += (s.chainFalloff || 1) ** k * (1 + (k < forks ? s.modEffects?.forkMult || 0 : 0));
  return sum;
}

/**
 * A build's profile. spec: { kit, level, jobNodes, gear (a gear set id), loadout (skill ids: the
 * first is the main attack, the rest are cast whenever ready), support (skills that only help), mods
 * ({ slot: [mod ids] }, at their top level),
 * build (a reference build for a kit not in progression.balance.builds), mpFree (MP never cuts a cast:
 * the content budget prices MP instead, core/content-budget.js), growth ({ skill id: bar points }, at
 * grade S: core/skill-growth.js) }. Node effects may carry
 * scenario stats the character sheet ignores: singleDamagePct (bosses and single targets),
 * packDamagePct, perTargetDamagePct (per enemy one cast hits, up to perTargetCap), selfTakenPct,
 * teamBuffPct (buffs and heals we give), teamTakenPct (allies near us take less), teamDamagePct
 * (allies deal more to our targets).
 */
export function buildProfile(data, spec) {
  const R = data.progression.balance.rules, b = data.progression.balance;
  const build = spec.build || b.builds[spec.kit];
  const loadout = spec.loadout || [build.skill], support = spec.support || [];
  // the gear set rides in as one extra source of stats, so it meets the same soft caps and caps
  const gearNode = '~gear', mainDef = data.skills.combat[loadout[0]];
  const D = { ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, [gearNode]: { effects: gearSetStats(data, spec.gear, mainDef) } } },
    progression: { ...data.progression, balance: { ...b, builds: { ...b.builds, [spec.kit]: { ...build, skill: loadout[0] } } } } };
  const { ch, d } = referenceHero(D, spec.kit, spec.level, [...(spec.jobNodes || []), gearNode]);
  [...loadout.slice(1), ...support].forEach((id, i) => { ch.slots[i + 1] = { skill: id, mods: [] }; ch.skills[id] = skillRankAt(data, spec.level); });
  // mods socketed per slot ({ slot: [mod ids] }) at their top level. The hero moves stat points into what its
  // skills (at their level) and mods ask for, out of the stats nothing it uses asks for and never below the
  // start, so each is measured at the level such a hero holds (docs/STATS-TH.md)
  const asks = ch.slots.filter((sl) => sl.skill).map((sl) => skillRequires(data, data.skills.combat[sl.skill], ch.skills[sl.skill]));
  for (const [slot, ids] of Object.entries(spec.mods || {})) for (const id of ids) {
    const uid = `bm${slot}.${id}`, level = data.mods.mods[id].maxLevel || 3;
    ch.mods.push({ uid, id, level, grade: 'A' });
    ch.slots[slot].mods.push(uid);
    asks.push(modRequires(data, data.mods.mods[id], level));
  }
  const needs = new Set(asks.flatMap((r) => Object.keys(r))), start = data.progression.character.startingStats;
  const spare = ['VIT', 'LUK', 'AGI', 'INT', 'DEX', 'STR'].filter((k) => !needs.has(k));
  for (const r of asks) for (const [stat, need] of Object.entries(r)) for (const k of spare) {
    const move = Math.min(need - ch.stats[stat], ch.stats[k] - start[k]);
    if (move > 0) { ch.stats[k] -= move; ch.stats[stat] += move; }
  }
  d.stats = statTotals(ch, data).stats; // the moved points meet the requirements (HP and power stay as measured)
  for (const [id, bars] of Object.entries(spec.growth || {})) (ch.skillGrowth ||= {})[id] = { grade: 'S', bars, earned: data.progression.skillGrowth.totalPoints, prof: 0 };
  if (!ch.movement) { ch.movement = 'dash'; ch.movementSkills = ['dash']; } // every hero has a dodge
  // a held channel is measured as one cast per tick: its damage per second over a tick, its drain
  // per second over a tick (the rules: frontier-content.js tickFrontier)
  const held = (s) => s.channel ? { ...s, cooldown: s.channel.tick, castTime: 0, damage: s.damage * s.channel.tick, cost: s.channel.manaPerSecond * s.channel.tick } : s;
  const skills = ch.slots.map((sl, i) => sl.skill && held(computeSkill(ch, data, d, i))).filter(Boolean);
  const C = R.control, all = [...skills];
  // a buff turned aura (a mod) holds for good, at its share of the buff, and keeps MP reserved
  const aura = (s) => s.modEffects?.buffAura || 0;
  for (const s of all) if (aura(s)) d.maxMp *= 1 - (s.modEffects.auraReserve || 0);
  const attacks = skills.slice(0, loadout.length), helpers = skills.slice(loadout.length);
  const m = referenceMonster(data, spec.level), hitDps = m.damage / m.hitInterval, sec = R.fightSeconds;
  const crit = 1 + d.critChance * (d.critMult - 1), critOf = (s) => s.noCrit ? 1 : crit, armour = defenseFactor(m.defense * (1 - (d.penetrationPct || 0) / 100), data);
  // a mod's own penetration (Piercing Line) on top of the character's
  const armourOf = (s) => s.modEffects?.penetrate ? defenseFactor(m.defense * (1 - (d.penetrationPct || 0) / 100) * (1 - s.modEffects.penetrate / 100), data) / armour : 1;
  const pct = (k) => (d[k] || 0) / 100;
  // rotation: cooldown skills whenever ready, each holding the hero for its cast and a short recovery;
  // the main attack fills the rest of the fighting time; MP cuts the main attack first
  const lock = (s) => s.castTime + (s.charge ? s.charge.duration : 0) + R.recover;
  const busy = attacks.slice(1).reduce((a, s) => a + lock(s) / s.cooldown, 0);
  const main = attacks[0], interval = main.channel ? main.cooldown : Math.max(main.cooldown, main.castTime, 0.35);
  const rates = attacks.map((s, i) => i === 0 ? Math.max(0, b.uptime - busy) / interval : b.uptime / s.cooldown);
  const hitsPerSecond = (hitsOf) => attacks.reduce((a, s, i) => a + rates[i] * hitsOf(s), 0);
  const supply = (d.maxMp + d.mpRegen * sec) / sec;
  // support skills cast on cooldown unless their MP alone outruns the supply, then as often as it allows
  const helperCost = helpers.reduce((a, s) => a + s.cost / s.cooldown, 0), helperShare = helperCost > supply && !spec.mpFree ? supply / helperCost : 1;
  // each attack hands back its own MP on hit (gear, the Job Tree and a mod are already in it)
  const spend = (hitsOf) => attacks.reduce((a, s, i) => a + rates[i] * (s.cost - (s.mpOnHit || 0) * hitsOf(s)), 0) + helperCost * helperShare;
  const fit = (hitsOf) => { // scale the main attack down until the MP lasts the fight
    const over = spend(hitsOf) - supply;
    if (over <= 0 || spec.mpFree) return rates;
    const r = [...rates], cut = Math.min(r[0], over / Math.max(1e-6, main.cost - (main.mpOnHit || 0) * hitsOf(main)));
    r[0] -= cut;
    const left = over - cut * (main.cost - (main.mpOnHit || 0) * hitsOf(main));
    if (left > 1e-9) { const rest = attacks.slice(1).reduce((a, s, i) => a + r[i + 1] * s.cost, 0); for (let i = 1; i < r.length; i++) r[i] *= Math.max(0, 1 - left / Math.max(1e-6, rest)); }
    return r;
  };
  // our own buffs: damage with their uptime (they last duration, come back every cooldown; a support
  // skill short of MP comes back less often), speed as walking speed
  const upOf = (s) => aura(s) ? aura(s) : s.duration ? Math.min(1, s.duration / s.cooldown) : 0;
  let selfDamage = 0, selfSpeed = 0;
  for (const s of [...attacks, ...helpers]) if (s.kind === 'buff') { selfDamage += (s.damageBuff || 0) * upOf(s); selfSpeed += (s.speedBuff || 0) * upOf(s); }
  const mv = movementSkill(ch, data, d);
  // debuffs a build lays on its targets: exposure and curses raise the damage everyone deals
  const amp = 1 + [...attacks, ...helpers].reduce((a, s) => a + (s.def.exposure ? s.def.exposure.fraction * Math.min(1, s.def.exposure.duration / s.cooldown) : 0)
    + (s.kind === 'curse_zone' && s.takenMult ? (s.takenMult - 1) * Math.min(1, s.duration / s.cooldown) : 0), 0);
  // burning and poison add their damage over time (a share of the hit, progression.balance.rules.control)
  const dots = (s) => 1 + (s.burnChance || 0) * C.burn + pct('poisonChancePct') * C.poison;
  const dealt = (hitsOf, scen) => {
    const r = fit(hitsOf);
    return attacks.reduce((a, s, i) => {
      const hits = hitsOf(s), perTarget = scen === 'pack' ? Math.min(pct('perTargetDamagePct') * hits, pct('perTargetCap') || Infinity) : 0;
      // a burst where a shot ends (a mod) and a free cast each time we dodge (a trigger mod)
      let burst = s.modEffects?.terminalBurst ? s.modEffects.terminalBurst * (scen === 'pack' ? packTargets({ kind: 'nova', radius: s.modEffects.burstRadius }, R.pack) : 1) / Math.max(1, hits) : 0;
      // a skill's own second hits: Thunder Slash's charge (its shocks come with the main skill's hits on
      // what it cut: all of them on a lone target, on one of a pack), Shatter Arrow's shards (they fly on
      // past the target the arrow struck, so only the rest of a pack takes them; a shot that never stops never breaks)
      if (s.shockCharge) burst += s.shockCharge.mult * s.shockCharge.shocks / (scen === 'pack' ? Math.max(1, hits) : 1);
      if (s.shatter && scen === 'pack' && s.pierce !== Infinity) burst += s.shatter.mult * Math.min(s.shatter.count, R.pack.size - 1) / Math.max(1, hits);
      const triggered = s.trigger?.on === 'on_movement' && mv.charges ? Math.min(1 / s.trigger.icd, C.dodgeUse / mv.recharge) * s.trigger.damageMult : 0;
      // the lane's far end (a mod): the player aims it at a lone target, a pack has its share there
      const e = s.modEffects || {}, tip = e.tipMult ? (scen === 'pack' ? 1 + e.tipShare * (e.tipMult - 1) : e.tipMult) : 1;
      return a + (r[i] + triggered) * castDamage(s) * (scen === 'single' ? fanShots(s, data) : 1) * tip * hits * (1 + burst) * dots(s) * critOf(s) * armourOf(s) * (1 + pct(scen === 'pack' ? 'packDamagePct' : 'singleDamagePct') + perTarget);
    }, 0) * armour * amp * (1 + selfDamage * helperShare);
  };
  // summons fight beside us: each attacks every attackCooldown while it lives (life of every cooldown)
  const summonDps = [...attacks, ...helpers].reduce((a, s) => a + (s.summon ? s.summon.count * s.summon.damage / s.summon.attackCooldown * Math.min(1, s.summon.life / s.cooldown) * (helpers.includes(s) ? helperShare : 1) : 0), 0) * armour * amp;
  const single = dealt(() => 1, 'single') + summonDps, pack = dealt((s) => packHits(s, R.pack), 'pack') + summonDps;
  // sustain: seconds of this rotation before MP runs dry, up to the fight's length (past it, MP never binds)
  const sustain = (() => { const drain = spend(() => 1) - d.mpRegen; return drain <= 0 ? sec : Math.min(sec, d.maxMp / drain); })();
  // survival: the pack's hits through armour, block, dodge and our own guarding buffs, against
  // regeneration, leech and our own barriers
  let guard = 1 - pct('selfTakenPct'), shield = 0;
  const share = (s) => helpers.includes(s) ? helperShare : 1;
  for (const s of [...attacks, ...helpers]) {
    const up = s.duration ? Math.min(1, s.duration / s.cooldown) * share(s) : 0;
    if (s.kind === 'buff' && s.takenMult) guard *= 1 - (1 - s.takenMult) * up;
    if (s.barrier) shield += s.barrier / s.cooldown * share(s);
  }
  // control: the share of the pack's attacking we take away: stuns (they stop), knockback (they walk
  // back), slows (they close the gap slower; slowShare of it counts), curses that weaken their hits and
  // taunts that draw them onto a summon
  const rf = fit((x) => packHits(x, R.pack));
  let free = 1;
  attacks.concat(helpers).forEach((s, i) => {
    const rate = i < attacks.length ? rf[i] : share(s) / s.cooldown, reach = Math.min(1, packHits(s, R.pack) / R.pack.size);
    const e = s.modEffects || {}, stun = s.stun || s.def.stun, chill = s.chill || (s.slow ? { slow: s.slow, duration: s.duration } : null);
    if (stun) free *= 1 - Math.min(C.cap, rate * stun.duration * reach);
    if (e.chainStun) free *= 1 - Math.min(C.cap, rate * e.chainStun / R.pack.size); // one monster, the chain's last
    // shock: its twitches stop the monster for twitch / interval of the time it lasts
    const SH = s.def.afterShock?.shock, SHK = data.progression.combat.shock;
    if (SH && SHK) free *= 1 - Math.min(C.cap, rate * SH * (SHK.twitch / SHK.interval) * reach);
    if (s.knock) free *= 1 - Math.min(C.cap, rate * s.knock / C.monsterSpeed * reach);
    if (chill) free *= 1 - Math.min(C.cap, chill.slow * C.slowShare * Math.min(1, rate * chill.duration) * reach);
    if (s.kind === 'curse_zone' && s.dealtMult) free *= 1 - (1 - s.dealtMult) * Math.min(1, s.duration / s.cooldown) * share(s);
    if (s.summon?.tauntRadius || s.def.summon?.tauntRadius || s.tauntRadius) free *= 1 - C.tauntShare * Math.min(1, (s.summon?.life || s.duration || 0) / s.cooldown) * share(s);
  });
  free = Math.max(1 - C.cap, free);
  // standing in a pack (pack.size monsters), not one: one monster's hits hardly test a tank
  const incoming = hitDps * R.pack.size * free * defenseFactor(d.defense, data) * (1 + pct('damageTakenPct')) * guard
    * (1 - Math.min(1, pct('dodgeChancePct'))) * (1 - (d.blockChance || 0) * (1 - data.progression.combat.block.taken));
  // a skill's own leech (a mod) heals from that skill's share of the damage
  const skillLeech = attacks.reduce((a, s, i) => a + fit(() => 1)[i] * castDamage(s) * fanShots(s, data) * critOf(s) * armour * (s.leech || 0) / 100, 0);
  // our heals land on us too (a spring at our feet, a cleanse on ourselves)
  const selfHeal = [...attacks, ...helpers].reduce((a, s) => a + (s.heal ? s.heal * (s.kind === 'heal_zone' ? s.duration / s.tick : 1) / s.cooldown * (helpers.includes(s) ? helperShare : 1) : 0), 0);
  const net = incoming - (d.hpRegen || 0) - pct('leechPct') * single - skillLeech - shield - selfHeal;
  const survival = net <= 0 ? R.survivalCap : Math.min(R.survivalCap, (d.maxHp + (d.maxShield || 0)) / net);
  const mobility = d.moveSpeed * (1 + selfSpeed * helperShare) + (mv.charges ? mv.distance / Math.max(0.1, mv.recharge) : 0) + attacks.reduce((a, s, i) => a + (s.kind === 'dash_line' ? s.range * rf[i] : 0), 0); // a dash cut moves the hero too
  // team: what the build gives allies (buff share x uptime; healing and barriers per second measured
  // against the pack's damage per second; an aura that cuts allies' damage taken)
  // our debuffs raise everyone's damage; our control spares allies too (teamShare of it)
  let team = pct('teamTakenPct') + pct('teamDamagePct') + (amp - 1) + (1 - free) * C.teamShare;
  const packDps = hitDps * R.pack.size;
  for (const t of [...attacks, ...helpers]) {
    const up = t.duration ? Math.min(1, t.duration / t.cooldown) * share(t) : 0, power = 1 + pct('teamBuffPct');
    if (t.kind === 'buff' && (t.def.radius || aura(t))) team += (aura(t) || up) * power * ((t.damageBuff || 0) + (t.speedBuff || 0) + (t.takenMult ? 1 - t.takenMult : 0));
    if (t.heal) team += share(t) * power * t.heal * (t.kind === 'heal_zone' ? t.duration / t.tick : 1) / t.cooldown / packDps;
    if (t.barrier && t.def.radius) team += share(t) * power * t.barrier / t.cooldown / packDps;
  }
  const find = { goldFindPct: d.goldFindPct || 0, materialFindPct: d.materialFindPct || 0, gearFindPct: d.gearFindPct || 0 };
  const income = farmingIncome(D, spec.kit, spec.level, find, null, m.hp / Math.max(1e-6, single)).net;
  return {
    axes: { single, pack, survival, sustain, mobility, team, income },
    cost: { points: (spec.jobNodes || []).length, gear: spec.gear || null, mpPerSecond: spend(() => 1), mpSupply: supply, maxMp: d.maxMp },
  };
}

/** a dominates b: at least (1 - tolerance) of b on every axis and better by tolerance on one. */
export function dominates(a, b, tolerance) {
  let better = false;
  for (const k of AXES) {
    if (a.axes[k] < b.axes[k] * (1 - tolerance)) return false;
    if (a.axes[k] > b.axes[k] * (1 + tolerance) + 1e-9) better = true;
  }
  return better;
}

/** The best value of every axis in a field. */
export function fieldBest(profiles) {
  const out = {};
  for (const k of AXES) out[k] = Math.max(...profiles.map((p) => p.axes[k]));
  return out;
}

/** Axes where a build sits clearly below the best of the field: its weaknesses. */
export function weaknesses(profile, best, weakness) {
  return AXES.filter((k) => profile.axes[k] < best[k] * weakness);
}

/**
 * Audit a field of builds of equal cost. Each build: { id, group, role, profile }; role is the axis it
 * is built to lead (or null for an all-round build), group joins the variants of one plan (a line
 * with different gear sets). Returns:
 * - overpowered: [winner, loser] where the winner dominates a specialist of another role (a build
 *   that, the winner aside, leads its axis), so the winner gives up nothing for that strength;
 * - traps: [winner, loser] otherwise (same role, no role, or a loser that leads nothing): the loser is
 *   simply a worse choice;
 * - noWeakness: builds within `weakness` of the field's best on every axis;
 * - overBudget / underBudget: plans whose weighted profile is far above or below the median plan
 *   (too much, or too little, for the same points);
 * - roleMisses: groups whose best variant does not clearly lead its own axis (a tie leads nothing);
 *   roleGaps: same-role groups
 *   (best variants) further apart on their axis than sameRoleGap.
 */
export function auditBuilds(data, builds) {
  const R = data.progression.balance.rules, best = fieldBest(builds.map((x) => x.profile));
  const overpowered = [], traps = [], noWeakness = [], roleMisses = [], roleGaps = [];
  // a specialist is a group's best variant that, leaving the challenger aside, is clearly above every
  // build of another role on its axis (a tie, e.g. everyone at a cap, makes no specialist)
  const groups = new Map();
  for (const x of builds) { const g = x.group || x.id, cur = groups.get(g); if (x.role && (!cur || x.profile.axes[x.role] > cur.profile.axes[x.role])) groups.set(g, x); }
  const tops = [...groups.values()];
  const specialist = (x, challenger) => tops.includes(x) && builds.every((o) => o === challenger || o.role === x.role || x.profile.axes[x.role] > o.profile.axes[x.role] * (1 + R.tolerance));
  for (const a of builds) for (const b of builds) {
    if (a === b || !dominates(a.profile, b.profile, R.tolerance)) continue;
    (a.role !== b.role && specialist(b, a) ? overpowered : traps).push([a.id, b.id]);
  }
  for (const x of builds) if (!weaknesses(x.profile, best, R.weakness).length) noWeakness.push(x.id);
  // roles are judged on each group's best variant (a line with the gear set that suits it best)
  for (const role of new Set(tops.map((x) => x.role))) {
    const own = tops.filter((x) => x.role === role), others = builds.filter((x) => x.role !== role);
    const top = Math.max(...others.map((x) => x.profile.axes[role]));
    for (const x of own) if (x.profile.axes[role] <= top * (1 + R.tolerance)) roleMisses.push({ id: x.id, role, leader: others.find((o) => o.profile.axes[role] === top).id });
    const vals = own.map((x) => x.profile.axes[role]), gap = Math.max(...vals) / Math.min(...vals) - 1;
    if (own.length > 1 && gap > R.sameRoleGap) roleGaps.push({ role, ids: own.map((x) => x.id), gap });
  }
  // too much for the price: a plan whose weighted profile (each axis as a share of the field's best)
  // sits above the field's median plan by more than budgetBand
  const score = (x) => AXES.reduce((a, k) => a + (R.budgetWeights[k] || 0) * (best[k] > 0 ? x.profile.axes[k] / best[k] : 0), 0);
  const scores = tops.map((x) => ({ id: x.id, score: score(x) })), mid = [...scores].sort((p, q) => p.score - q.score)[Math.floor(scores.length / 2)]?.score || 0;
  const overBudget = scores.filter((x) => x.score > mid * (1 + R.budgetBand)).map((x) => ({ ...x, ratio: x.score / mid }));
  const underBudget = scores.filter((x) => x.score < mid * (1 - R.budgetBand)).map((x) => ({ ...x, ratio: x.score / mid }));
  return { best, overpowered, traps, noWeakness, roleMisses, roleGaps, scores, overBudget, underBudget };
}
