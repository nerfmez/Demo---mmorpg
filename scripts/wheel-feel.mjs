// Feel per point (owner, 2026-11-02): every line's tree should grow its role about the same (x1.5-2.0 from
// the trunk to the capstone). A line whose own job skills already carry it barely grows with points; one
// whose skills are weak gets everything from the tree. This moves power between a line's job skills (data/
// skills.json, only skills with that `job`) and its branch: it scales the job skills toward a start of
// end / target, then scripts/wheel-tune.mjs puts every line back on its role. Damage roles and income only
// (team and survival lines start near zero on purpose). node scripts/wheel-feel.mjs [rounds=4] [target=1.75]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadData } from '../src/core/data-node.js';
import { skillValue } from '../src/core/content-budget.js';

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
  let text = readFileSync(SKILLS, 'utf8'), moved = [];
  for (const [id, list] of Object.entries(asks)) {
    const k = Math.min(1.15, Math.max(0.87, Math.exp(list.reduce((a, x) => a + Math.log(x), 0) / list.length) ** 0.7));
    if (Math.abs(k - 1) < 0.02) continue;
    const i = text.indexOf(`\n    "${id}": {`), end = text.indexOf('\n    },', i);
    let block = text.slice(i, end);
    // its hit, its heal, its summons' bite: base and scale together
    block = block.replace(/("(?:damage|heal)": \{\s*"base": )([0-9.]+)(,\s*"scale": )([0-9.]+)/g, (m, a, b, c, d) => a + round(+b * k, 1) + c + round(+d * k));
    text = text.slice(0, i) + block + text.slice(end);
    moved.push(`${id} x${k.toFixed(2)}`);
  }
  JSON.parse(text);
  writeFileSync(SKILLS, text);
  // a skill never leaves its budget band (core/content-budget.js): one pushed past it goes back to the edge
  const data = loadData(), level = data.progression.balance.monsterCap, B = data.progression.balance.budgets;
  for (const id of moved.map((m) => m.split(' ')[0])) {
    const def = data.skills.combat[id], v = skillValue(data, id, level), [lo, hi] = v.cls === 'main' ? B.skill.main : (B.skill[v.cls] || B.skill.support);
    if (v.score <= hi && v.score >= lo) continue;
    const edge = v.score > hi ? hi - 0.05 : lo + 0.05, F = def.damage ? 'damage' : def.heal ? 'heal' : def.summon?.damage ? 'summon' : null;
    if (!F) continue;
    const at = (k) => { const d2 = structuredClone(def); const t = F === 'summon' ? d2.summon.damage : d2[F]; t.base *= k; t.scale *= k; return skillValue({ ...data, skills: { ...data.skills, combat: { ...data.skills.combat, [id]: d2 } } }, id, level).score; };
    let a = 0.2, b = 3; for (let n = 0; n < 25; n++) { const m = (a + b) / 2; if (at(m) < edge) a = m; else b = m; }
    const k = (a + b) / 2, i = text.indexOf(`\n    "${id}": {`), end = text.indexOf('\n    },', i);
    text = text.slice(0, i) + text.slice(i, end).replace(/("(?:damage|heal)": \{\s*"base": )([0-9.]+)(,\s*"scale": )([0-9.]+)/g, (m, p1, p2, p3, p4) => p1 + round(+p2 * k, 1) + p3 + round(+p4 * k)) + text.slice(end);
    moved.push(`${id} back to its band x${k.toFixed(2)}`);
  }
  writeFileSync(SKILLS, text);
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
