// Design the wheel Job Tree by simulation (owner, 2026-10-27): every build the draft allows (a job's
// branch, its forks, an inner-ring plan, a gear set, where the spare points go) gets a profile from
// core/build-rules.js, then the rules look for overpowered builds, builds with no weakness, roles that
// do not lead and same-role gaps, and each branch's ladder (what every point adds) is measured.
// node scripts/wheel-sim.mjs [out.json]   (reads data/drafts/wheel.json; the game is untouched)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadData } from '../src/core/data-node.js';
import { buildProfile, auditBuilds, AXES } from '../src/core/build-rules.js';

const data = loadData();
const W = JSON.parse(readFileSync(new URL('../data/drafts/wheel.json', import.meta.url), 'utf8'));
const nodes = {}; // synthetic Job Tree nodes: id -> { effects, cost, name }
const scaled = (n) => { const u = n.uptime ?? 1, e = {}; for (const [k, v] of Object.entries(n.effects)) e[k] = k === 'perTargetCap' ? v : v * u; return e; };
const add = (id, n, cost = n.cost || 1) => { nodes[id] = { effects: scaled(n), cost, name: n.name }; return id; };
const inner = {};
for (const [sec, list] of Object.entries(W.inner)) inner[sec] = list.map((n) => add(`w.${sec}.${n.id}`, n));
// the game's data with the draft's nodes added (rebuilt per use: branches add their nodes as they go)
const withNodes = () => ({ ...data, jobtree: { ...data.jobtree, nodes: { ...data.jobtree.nodes, ...nodes } } });

// a list of node ids filling `budget` points from the given ladders, in order
const fill = (ladders, budget) => { const out = []; let left = budget; for (const l of ladders) for (const id of l) { if (left < nodes[id].cost) return out; out.push(id); left -= nodes[id].cost; } return out; };
const cost = (ids) => ids.reduce((a, id) => a + nodes[id].cost, 0);

/** A branch's nodes in buying order (passes then key per tier, then the capstone), forks resolved. */
function branchNodes(job, bid, fork) {
  const b = W.jobs[job].branches[bid], out = [];
  b.keys.forEach((k, t) => {
    b.pass.forEach((p, i) => out.push(add(`w.${job}.${bid}.t${t}p${i}`, { name: 'ผ่าน', effects: p })));
    const key = k.forks ? k.forks[fork] : k;
    out.push(add(`w.${job}.${bid}.t${t}k${k.forks ? '.' + fork : ''}`, key, 2));
  });
  const cap = b.cap.forks ? b.cap.forks[fork] : b.cap;
  out.push(add(`w.${job}.${bid}.cap${b.cap.forks ? '.' + fork : ''}`, cap, 3));
  return out;
}
const forksOf = (job, bid) => { const b = W.jobs[job].branches[bid], f = b.keys.find((k) => k.forks); return f ? Object.keys(f.forks) : [null]; };

const builds = [], ladders = [];
for (const [job, J] of Object.entries(W.jobs)) {
  const entry = add(`w.${job}.entry`, J.entry, 0), trunk = J.trunk.map((n, i) => add(`w.${job}.trunk${i}`, n, n.cost || 1));
  for (const bid of Object.keys(J.branches)) for (const fork of forksOf(job, bid)) {
    const B = J.branches[bid], path = branchNodes(job, bid, fork);
    const spec0 = { kit: job, level: W.level, build: { ...J.build, stats: B.stats || J.build.stats }, loadout: B.loadout || J.loadout, support: B.support || J.support };
    const jobBase = [entry, ...trunk, ...path];
    const spareOptions = { inner: null };
    for (const other of Object.keys(J.branches)) if (other !== bid) spareOptions['side:' + other] = branchNodes(job, other, forksOf(job, other)[0]).slice(0, 4).concat(branchNodes(job, other, forksOf(job, other)[0]).slice(4, 8));
    for (const [plan, secs] of Object.entries(J.inner)) for (const gear of Object.keys(data.progression.balance.rules.gearSets)) for (const [spare, side] of Object.entries(spareOptions)) {
      const spareBudget = W.points.job - cost(jobBase);
      const innerIds = fill(secs.map((s) => inner[s]), W.points.inner + (side ? 0 : spareBudget));
      const sideIds = side ? fill([side], spareBudget) : [];
      const jobNodes = [...innerIds, ...jobBase, ...sideIds];
      const id = `${job}/${bid}${fork ? ':' + fork : ''}/${plan}/${gear}/${spare}`;
      builds.push({ id, job, group: `${job}/${bid}${fork ? ':' + fork : ''}`, role: B.role, plan, gear, spare, points: cost(jobNodes), profile: buildProfile(withNodes(), { ...spec0, jobNodes, gear }) });
    }
    // the ladder: the job's own inner plan and trunk bought, then the branch point by point
    const innerIds = fill(J.inner.own.map((s) => inner[s]), W.points.inner);
    const steps = [];
    for (let n = 0; n <= path.length; n++) {
      const p = buildProfile(withNodes(), { ...spec0, jobNodes: [...innerIds, entry, ...trunk, ...path.slice(0, n)], gear: 'mixed' });
      steps.push({ points: cost(path.slice(0, n)), node: n ? nodes[path[n - 1]].name : 'start', axes: p.axes, dead: n > 0 && AXES.every((k) => Math.abs(p.axes[k] - steps[n - 1].axes[k]) < 1e-9) });
    }
    ladders.push({ group: `${job}/${bid}${fork ? ':' + fork : ''}`, role: B.role, steps });
  }
}
const audit = auditBuilds(data, builds);
const byGroup = {};
for (const x of builds) { const g = byGroup[x.group] ||= { role: x.role, best: null }; if (!g.best || x.profile.axes[x.role] > g.best.profile.axes[x.role]) g.best = x; }
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * (k === 'team' ? 1000 : 10)) / (k === 'team' ? 1000 : 10)]));
const out = {
  builds: builds.length, axes: AXES, best: round(audit.best),
  groups: Object.entries(byGroup).map(([g, v]) => ({ group: g, role: v.role, best: v.best.id, axes: round(v.best.profile.axes) })),
  overpowered: audit.overpowered, noWeakness: audit.noWeakness, roleMisses: audit.roleMisses,
  roleGaps: audit.roleGaps.map((r) => ({ ...r, gap: Math.round(r.gap * 100) / 100 })),
  traps: audit.traps.length,
  overBudget: audit.overBudget, underBudget: audit.underBudget, scores: audit.scores,
  ladders: ladders.map((l) => ({ group: l.group, role: l.role, steps: l.steps.map((s) => ({ points: s.points, node: s.node, dead: s.dead, value: Math.round(s.axes[l.role] * 1000) / 1000, axes: round(s.axes) })) })),
};
const file = process.argv[2];
if (file) writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${out.builds} builds`);
for (const g of out.groups) console.log(g.group.padEnd(22), g.role.padEnd(9), AXES.map((k) => `${k} ${g.axes[k]}`).join(' | '));
console.log('overpowered', out.overpowered.length, out.overpowered.slice(0, 8).map((p) => p.join(' > ')).join('\n  '));
console.log('noWeakness', out.noWeakness.length, out.noWeakness.slice(0, 8).join(', '));
console.log('budget', out.scores.map((x) => x.id.split('/').slice(0, 2).join('/') + ' ' + x.score.toFixed(2)).join(' | '));
console.log('overBudget', JSON.stringify(out.overBudget.map((x) => x.id + ' ' + x.ratio.toFixed(2))));
console.log('underBudget', JSON.stringify(out.underBudget.map((x) => x.id + ' ' + x.ratio.toFixed(2))));
console.log('roleMisses', JSON.stringify(out.roleMisses.map((m) => m.id.split('/').slice(0, 2).join('/') + ' <' + m.leader.split('/').slice(0, 2).join('/'))));
console.log('roleGaps', JSON.stringify(out.roleGaps.map((r) => ({ role: r.role, gap: r.gap }))));
for (const l of out.ladders) {
  const v = l.steps.map((s) => s.value), gains = v.slice(1).map((x, i) => (x - v[i]) / Math.max(1e-9, Math.abs(v[0])));
  console.log('ladder', l.group.padEnd(22), l.role, 'x' + (v[v.length - 1] / v[0]).toFixed(2), 'min step', (Math.min(...gains) * 100).toFixed(1) + '%', 'max step', (Math.max(...gains) * 100).toFixed(1) + '%');
  const off = l.steps.slice(1).filter((st, i) => Math.abs(st.value - l.steps[i].value) < 1e-9).map((st, i) => st.node + (st.dead ? ' (ไม่ได้อะไรเลย)' : ''));
  if (off.length) console.log('   not on its role axis:', [...new Set(off)].join(', '));
}
