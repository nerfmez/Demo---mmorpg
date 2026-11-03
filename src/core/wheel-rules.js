// The wheel Job Tree's situational stats (owner, 2026-11-03: the wheel goes into the game). The simulator
// (core/build-rules.js) priced these by scenario; here each is a rule on a real fight. Numbers that are not
// node values live in data/progression.json combat.wheel.
//   singleDamagePct  the hero's hits on a boss, or on a monster with no other monster within crowd m
//   packDamagePct    the hero's hits on a monster with at least packAt others within crowd m
//   perTargetDamagePct (up to perTargetCap)  +X% per monster within crowd m of the target, itself counted
//   selfTakenPct     the hero takes that share less from monsters (capped: character.caps)
//   teamDamagePct    a monster the hero hits is marked for markTime s: allies (summons, companions; party
//                    members later) deal that share more to it
//   teamTakenPct     allies within team m of the hero take that share less
//   teamBuffPct      heals the hero gives allies are that share stronger
const W = (g) => g.data.progression.combat.wheel;

/** How many other living monsters stand within the crowd radius of m. */
function crowdAround(g, m) {
  const r = W(g).crowd;
  let n = 0;
  for (const o of g.monsters) if (o !== m && !o.dead && Math.abs(o.x - m.x) <= r && Math.abs(o.z - m.z) <= r && Math.hypot(o.x - m.x, o.z - m.z) <= r) n++;
  return n;
}

/** The multiplier the hero's own hit on m gets from single / pack / per-target damage; marks it for allies. */
export function heroHitMult(g, m, opts) {
  const d = g.derived;
  if (opts.byAlly) return 1;
  if (d.teamDamagePct > 0 && !opts.dot) m.statuses.mark = { t: W(g).markTime, pct: d.teamDamagePct };
  if (!(d.singleDamagePct || d.packDamagePct || d.perTargetDamagePct)) return 1;
  const others = crowdAround(g, m), w = W(g);
  let mult = 1;
  if (d.singleDamagePct && (m.boss || others === 0)) mult *= 1 + d.singleDamagePct / 100;
  if (d.packDamagePct && others >= w.packAt) mult *= 1 + d.packDamagePct / 100;
  if (d.perTargetDamagePct) mult *= 1 + Math.min(d.perTargetCap || Infinity, d.perTargetDamagePct * (others + 1)) / 100;
  return mult;
}

/** An ally's hit on a monster the hero marked (teamDamagePct). */
export function allyHitMult(m, opts) {
  return opts.byAlly && m.statuses.mark ? 1 + m.statuses.mark.pct / 100 : 1;
}

/** What the hero takes after selfTakenPct. */
export function heroTakenMult(g) {
  const s = Math.min(g.data.progression.character.caps.selfTakenPct ?? 60, g.derived.selfTakenPct || 0);
  return 1 - Math.max(0, s) / 100;
}

/** What an ally takes after the hero's teamTakenPct (within team m of the hero). */
export function allyTakenMult(g, a) {
  const t = g.derived.teamTakenPct || 0, p = g.player;
  if (t <= 0 || p.dead || Math.hypot(a.x - p.x, a.z - p.z) > W(g).team) return 1;
  return 1 - Math.min(g.data.progression.character.caps.teamTakenPct ?? 50, t) / 100;
}

/** A heal the hero gives an ally, after teamBuffPct. */
export function allyHealMult(g, u) {
  return u === g.player ? 1 : 1 + (g.derived.teamBuffPct || 0) / 100;
}
