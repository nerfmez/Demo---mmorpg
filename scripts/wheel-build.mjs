// Build the wheel Job Tree the game plays from the simulated draft (owner, 2026-11-03: "ทำทรีวงล้อเข้าเกม").
// data/drafts/wheel.json -> data/wheeltree.json, in the shape core/character.js reads (nodes with
// requires / requiresAny, type, requiresJob, effects) plus what the wheel adds: a node's `cost` in points
// (pass 1, key 2, capstone 3, a job's entry 0), `forkGroup` (pick one of a key's forks, same price) and
// the tree's `jobChoiceLevel` (a job is chosen at Job Lv 40). A conditional effect the simulator weighed
// by its `uptime` is written at that average for now (`uptime` kept on the node; the rule for its
// condition comes later). Re-run after every change to the draft: node scripts/wheel-build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const W = JSON.parse(readFileSync(new URL('../data/drafts/wheel.json', import.meta.url), 'utf8'));
const SECTOR = { center: 'กลางวง', str: 'STR', strdex: 'STR/DEX', dex: 'DEX', dexint: 'DEX/INT', int: 'INT', intstr: 'INT/STR', heavy: 'อาวุธหนัก', dual: 'ถือสองมือ' };
const nodes = { origin: { name: 'Origin', nameTh: 'จุดเริ่ม', type: 'origin', effects: {}, cost: 0, requires: [], links: [] } };
const avg = (n) => { const u = n.uptime ?? 1, e = {}; for (const [k, v] of Object.entries(n.effects || n)) e[k] = k === 'perTargetCap' || u === 1 ? v : Math.round(v * u * 10) / 10; return e; };
const put = (id, n) => { nodes[id] = { links: [], ...n }; return id; };

// the inner ring: the centre and six sectors, each a ladder bought from the centre outward
for (const [sec, list] of Object.entries(W.inner)) {
  // a side line (the heavy weapon and dual wield lines) hangs on a node of its sector (innerFrom)
  let prev = sec === 'center' ? 'origin' : W.innerFrom?.[sec] ? `in.${W.innerFrom[sec]}` : 'in.center.c1';
  for (const n of list) {
    prev = put(`in.${sec}.${n.id}`, { name: n.name, nameTh: n.name, type: /เด่น/.test(n.name) ? 'notable' : 'minor', effects: avg(n), cost: 1, requires: [prev], ring: 'inner', sector: sec, sectorTh: SECTOR[sec], ...(W.innerFrom?.[sec] ? { sideOf: W.innerFrom[sec].split('.')[0] } : {}) });
  }
}
// the jobs: an entry (free, at Job Lv 40, one job only), its trunk, then branches of passes, keys and a capstone
for (const [job, J] of Object.entries(W.jobs)) {
  const base = { ring: 'job', job, requiresJob: job };
  const entry = put(`job.${job}`, { name: J.name, nameTh: J.name, type: 'job', branch: job, effects: avg(J.entry), entryTh: J.entry.name, cost: 0, requires: [], ring: 'job', job });
  let prev = entry;
  J.trunk.forEach((t, i) => { prev = put(`job.${job}.trunk${i}`, { ...base, name: t.name, nameTh: t.name, type: t.cost > 1 ? 'notable' : 'minor', effects: avg(t), cost: t.cost || 1, requires: [prev] }); });
  const trunkEnd = prev;
  for (const [bid, B] of Object.entries(J.branches)) {
    const line = { ...base, branchId: bid, branchTh: B.name, role: B.role };
    let after = [trunkEnd]; // the node(s) the next one hangs on (any one of a fork)
    B.keys.forEach((k, t) => {
      B.pass.forEach((p, i) => { after = [put(`job.${job}.${bid}.t${t}p${i}`, { ...line, name: 'ผ่าน', nameTh: 'โหนดผ่าน', pass: true, type: 'minor', effects: avg(p), cost: 1, ...(after.length > 1 ? { requiresAny: after } : { requires: after }) })]; });
      if (k.forks) after = Object.entries(k.forks).map(([f, fk]) => put(`job.${job}.${bid}.t${t}k.${f}`, { ...line, name: fk.name, nameTh: fk.name, type: 'notable', effects: avg(fk), uptime: fk.uptime, cost: 2, requires: after, forkGroup: `${job}.${bid}.t${t}`, fork: f }));
      else after = [put(`job.${job}.${bid}.t${t}k`, { ...line, name: k.name, nameTh: k.name, type: 'notable', effects: avg(k), uptime: k.uptime, cost: 2, requires: after })];
    });
    const C = B.cap;
    if (C.forks) for (const [f, fk] of Object.entries(C.forks)) {
      // a forked capstone follows the fork the player took at whichever key forked
      const chosen = Object.keys(nodes).find((id) => id.startsWith(`job.${job}.${bid}.t`) && id.endsWith('k.' + f));
      const req = after.length > 1 ? { requiresAny: after } : { requires: [...after] };
      if (chosen && !after.includes(chosen)) (req.requires ||= []).push(chosen);
      put(`job.${job}.${bid}.cap.${f}`, { ...line, name: fk.name, nameTh: fk.name, type: 'keystone', effects: avg(fk), uptime: fk.uptime, cost: 3, ...req, forkGroup: `${job}.${bid}.cap`, fork: f });
    }
    else put(`job.${job}.${bid}.cap`, { ...line, name: C.name, nameTh: C.name, type: 'keystone', effects: avg(C), uptime: C.uptime, cost: 3, ...(after.length > 1 ? { requiresAny: after } : { requires: after }) });
  }
}
// links for drawing: each node to its parents
for (const [id, n] of Object.entries(nodes)) for (const p of [...(n.requires || []), ...(n.requiresAny || [])]) { n.links.push(p); nodes[p].links.push(id); }
const tree = {
  _doc: 'The wheel Job Tree, built by scripts/wheel-build.mjs from data/drafts/wheel.json (do not edit by hand). Inner ring: Job Lv 1-39 points, from the centre outward in any sector. Jobs: one, chosen at jobChoiceLevel; its entry is free, then trunk and branches (pass 1 point, key 2, capstone 3; a fork is one of its keys at the same price). Effects with an uptime are written at the simulated average until their condition is a rule.',
  origin: 'origin', jobChoiceLevel: 40, points: W.points,
  jobs: Object.fromEntries(Object.entries(W.jobs).map(([id, J]) => [id, { nameTh: J.name, entry: `job.${id}`, branches: Object.fromEntries(Object.entries(J.branches).map(([b, B]) => [b, { nameTh: B.name, role: B.role }])) }])),
  sectors: SECTOR,
  nodes,
};
writeFileSync(new URL('../data/wheeltree.json', import.meta.url), JSON.stringify(tree, null, 1) + '\n');
const count = Object.keys(nodes).length, cost = Object.values(nodes).reduce((a, n) => a + n.cost, 0);
console.log(`${count} nodes, ${cost} points in all`);
