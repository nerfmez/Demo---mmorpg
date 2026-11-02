// Tune the wheel draft by simulation (owner, 2026-11-02): run scripts/wheel-sim.mjs, then move every
// branch's node values toward its role's target: the median of its role's lines (each line's best build on its own axis), raised
// to lead every build of another role on that axis by 8%,
// and run again, until every line sits within the band of its role or the rounds run out. Only a
// branch's own nodes move (its passes, keys and capstone; a fork's own key alone for that fork), only
// the stats that serve the line's role, only positive numbers (a price like -15% speed stays), and none
// past its cap. Writes data/drafts/wheel.json.
// node scripts/wheel-tune.mjs [rounds=12] [band=0.05]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILE = new URL('../data/drafts/wheel.json', import.meta.url), OUT = '/tmp/wheel-tune-out.json';
const rounds = +process.argv[2] || 12, band = +process.argv[3] || 0.05;
// the stats that serve each role: only these move, and none past CAP (a node stays a node, not a cheat)
const DMG = ['damagePct', 'attackDamagePct', 'meleeDamagePct', 'projectileDamagePct', 'spellDamagePct', 'elementalDamagePct', 'trapDamagePct', 'summonDamagePct', 'dotDamagePct', 'critChancePct', 'critMultPct', 'penetrationPct'];
const ROLE = {
  single: new Set([...DMG, 'singleDamagePct']),
  pack: new Set([...DMG, 'packDamagePct', 'areaDamagePct', 'perTargetDamagePct']),
  survival: new Set(['maxHpPct', 'defense', 'selfTakenPct', 'hpRegen', 'hpRegenPct', 'maxShield', 'maxShieldPct', 'barrierPct', 'blockChancePct', 'leechPct']),
  team: new Set(['teamTakenPct', 'teamDamagePct', 'teamBuffPct', 'healPct', 'controlDurationPct']),
  income: new Set(['goldFindPct', 'gearFindPct', 'materialFindPct']),
};
const CAP = { selfTakenPct: 25, teamTakenPct: 25, critChancePct: 15, hpRegenPct: 3, leechPct: 4, defense: 400, maxShield: 400, hpRegen: 60 }, CAP_PCT = 60;
const round = (v) => (Math.abs(v) >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
let role = null;
const scaleEffects = (e, f) => { for (const k of Object.keys(e)) if (ROLE[role].has(k) && e[k] > 0) e[k] = round(Math.min(CAP[k] ?? CAP_PCT, e[k] * f)); };

for (let r = 0; r < rounds; r++) {
  execFileSync('node', [new URL('./wheel-sim.mjs', import.meta.url).pathname, OUT], { stdio: 'ignore' });
  const out = JSON.parse(readFileSync(OUT, 'utf8')), W = JSON.parse(readFileSync(FILE, 'utf8'));
  const byRole = {};
  for (const g of out.groups) (byRole[g.role] ||= []).push(g.axes[g.role]);
  // a role's target: its lines' median, but at least lead over every build of another role on that axis
  const median = Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, Math.max([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)], (out.outside[k] || 0) * 1.08)]));
  let moved = 0, worst = 0;
  for (const g of out.groups) {
    const v = g.axes[g.role], T = median[g.role], off = v / T - 1;
    worst = Math.max(worst, Math.abs(off));
    if (Math.abs(off) <= band || v <= 0) continue;
    const f = Math.min(1.3, Math.max(0.8, (T / v) ** (g.role === 'survival' ? 0.3 : 0.7))); // survival grows fast near its curve's bend
    role = g.role;
    const [job, rest] = g.group.split('/'), [bid, fork] = rest.split(':'), B = W.jobs[job].branches[bid];
    if (fork) { // only this fork's own key and capstone
      for (const k of B.keys) if (k.forks?.[fork]) scaleEffects(k.forks[fork].effects, f);
      if (B.cap.forks?.[fork]) scaleEffects(B.cap.forks[fork].effects, f);
      else if (!B.keys.some((k) => k.forks?.[fork])) continue;
    } else {
      for (const p of B.pass) scaleEffects(p, f);
      for (const k of B.keys) if (k.effects) scaleEffects(k.effects, f);
      if (B.cap.effects) scaleEffects(B.cap.effects, f);
    }
    moved++;
  }
  writeFileSync(FILE, JSON.stringify(W, null, 2) + '\n');
  console.log(`round ${r + 1}: ${moved} lines moved, worst ${(worst * 100).toFixed(1)}% off its role median`, JSON.stringify(Object.fromEntries(Object.entries(median).map(([k, v]) => [k, +v.toPrecision(4)]))));
  if (!moved) break;
}
