// Feel per point (owner, 2026-11-02): every line's tree should grow its role about the same (x1.5-2.0 from
// the trunk to the capstone). A line whose own job skills already carry it barely grows with points; one
// whose skills are weak gets everything from the tree. This moves power between a line's job skills (the
// draft's skillScale over data/skills.json, only skills with that `job`; the live game keeps its numbers) and its branch: it scales the job skills toward a start of
// end / target, then scripts/wheel-tune.mjs puts every line back on its role. Damage roles and income only
// (team and survival lines start near zero on purpose). node scripts/wheel-feel.mjs [rounds=4] [target=1.75]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadData } from '../src/core/data-node.js';
import { skillValue } from '../src/core/content-budget.js';
import { applySkillScale } from './wheel-scale.mjs';

const rounds = +process.argv[2] || 4, target = +process.argv[3] || 1.75, OUT = '/tmp/wheel-feel-out.json';
const SKILLS = new URL('../data/skills.json', import.meta.url), WHEEL = new URL('../data/drafts/wheel.json', import.meta.url);
const run = (script, args = []) => execFileSync('node', [new URL(script, import.meta.url).pathname, ...args], { stdio: 'ignore' });
const round = (v, base) => (base ? Math.round(v) : Math.round(v * 100) / 100);
for (let r = 0; r < rounds; r++) {
  run('./wheel-sim.mjs', [OUT]);
  const out = JSON.parse(readFileSync(OUT, 'utf8')), W = JSON.parse(readFileSync(WHEEL, 'utf8'));
  const C = JSON.parse(readFileSync(SKILLS, 'utf8')).combat, asks = {}, jobAsks = {};
  for (const l of out.ladders) {
    if (!['single', 'pack', 'income'].includes(l.role)) continue;
    const v = l.steps.map((s) => s.value), grow = v[v.length - 1] / v[0];
    if (grow >= 1.5 && grow <= 2.1) continue; // already inside the band
    const [job, rest] = l.group.split('/'), J = W.jobs[job], B = J.branches[rest.split(':')[0]];
    const want = (v[v.length - 1] / target) / v[0];
    for (const id of [...(B.loadout || J.loadout), ...(B.support || J.support || [])]) if (C[id]?.job) (asks[id] ||= []).push(want);
    (jobAsks[job] ||= []).push(want);
  }
  // the job skills' numbers live in the draft (skillScale), not in skills.json: the live game keeps its own
  const scale = (W.skillScale ||= {}), moved = [];
  for (const [id, list] of Object.entries(asks)) {
    const k = Math.min(1.15, Math.max(0.87, Math.exp(list.reduce((a, x) => a + Math.log(x), 0) / list.length) ** 0.7));
    if (Math.abs(k - 1) < 0.02) continue;
    scale[id] = Math.round((scale[id] || 1) * k * 1000) / 1000;
    moved.push(`${id} x${k.toFixed(2)}`);
  }
  // a skill never leaves its budget band (core/content-budget.js): one pushed past it goes back to the edge
  const base = loadData(), level = base.progression.balance.monsterCap, B = base.progression.balance.budgets;
  for (const id of moved.map((m) => m.split(' ')[0])) {
    const at = (m) => skillValue(applySkillScale(base, { ...scale, [id]: scale[id] * m }), id, level);
    const v = at(1), [lo, hi] = v.cls === 'main' ? B.skill.main : (B.skill[v.cls] || B.skill.support);
    if (v.score <= hi && v.score >= lo) continue;
    const edge = v.score > hi ? hi - 0.05 : lo + 0.05;
    let a = 0.2, b = 3; for (let n = 0; n < 25; n++) { const m = (a + b) / 2; if (at(m).score < edge) a = m; else b = m; }
    scale[id] = Math.round(scale[id] * (a + b) / 2 * 1000) / 1000;
    moved.push(`${id} back to its band`);
  }
  // the job's own entry and trunk (bought before any branch): a job whose skills carry little starts
  // stronger, one whose skills carry much starts plainer, so its branches grow alike
  const DMG = new Set(['damagePct', 'meleeDamagePct', 'projectileDamagePct', 'spellDamagePct', 'elementalDamagePct', 'trapDamagePct', 'summonDamagePct', 'singleDamagePct', 'critChancePct', 'critMultPct', 'goldFindPct', 'materialFindPct', 'gearFindPct']);
  for (const [job, list] of Object.entries(jobAsks)) {
    const k = Math.min(1.4, Math.max(0.7, Math.exp(list.reduce((a, x) => a + Math.log(x), 0) / list.length) ** 0.7));
    if (Math.abs(k - 1) < 0.03) continue;
    const J = W.jobs[job];
    for (const node of [J.entry, ...J.trunk]) for (const key of Object.keys(node.effects)) if (DMG.has(key) && node.effects[key] > 0) node.effects[key] = Math.round(node.effects[key] * k * 10) / 10;
    moved.push(`${job} entry/trunk x${k.toFixed(2)}`);
  }
  writeFileSync(WHEEL, JSON.stringify(W, null, 2) + '\n');
  run('./wheel-tune.mjs', ['25', '0.05']);
  console.log(`round ${r + 1}: ${moved.join(', ') || 'nothing to move'}`);
  if (!moved.length) break;
}
