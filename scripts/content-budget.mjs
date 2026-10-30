// Content budget report (owner, 2026-10-27): every combat skill and mod measured with the build
// profile against its class (core/content-budget.js). node scripts/content-budget.mjs [level] [out.json]
import { writeFileSync } from 'node:fs';
import { loadData } from '../src/core/data-node.js';
import { modFits } from '../src/core/skills.js';
import { skillValue, modValue, classBands } from '../src/core/content-budget.js';

const data = loadData(), level = +(process.argv[2] || data.progression.balance.monsterCap);
const skills = classBands(Object.keys(data.skills.combat).map((id) => skillValue(data, id, level)));
const fits = (def, mod) => modFits(def, mod).ok;
const mods = Object.keys(data.mods.mods).filter((id) => !data.mods.mods[id].retired).map((id) => modValue(data, id, level, fits));
console.log('== skills at level', level, 'class medians', JSON.stringify(Object.fromEntries(Object.entries(skills.medians).map(([k, v]) => [k, +v.toFixed(3)]))));
for (const x of skills.items.sort((a, b) => a.cls.localeCompare(b.cls) || b.score - a.score)) console.log(x.cls.padEnd(14), x.id.padEnd(16), x.ref.padEnd(6), 'score', x.score.toFixed(3).padStart(7), 'x' + (x.ratio === null ? ' -' : x.ratio.toFixed(2)), x.score === 0 ? (x.id === x.refMain ? '(reference)' : '(unmeasured)') : '');
console.log('== mods (best skill / median over fitting skills)');
for (const m of mods.sort((a, b) => b.best - a.best)) console.log(m.id.padEnd(16), 'best', m.best.toFixed(3).padStart(7), (m.rows[0]?.skill || '-').padEnd(14), 'median', m.median.toFixed(3).padStart(7), m.rows.length + ' skills', m.best === 0 ? '(unmeasured)' : '');
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ level, skills, mods }, null, 1));
