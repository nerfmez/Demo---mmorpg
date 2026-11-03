// Layout of the wheel Job Tree as the field journal's maps (owner, 2026-11-03: the "สมุดเส้นทางสกิล"
// prototype, artifact NNGNp6fkVzKu1ue9k4Boq8, is the skill tree page). Presentation only, no DOM: which
// maps the book has, where each node stands on its map, and which roads join them. Rules stay in
// core/character.js (jobNodeState, allocateJobNode, jobRoute).
//
// Pages: the overview (a compass with the six sectors of the inner ring), the camp (the centre), one map
// per sector (its ladder as a winding road from the camp, the heavy weapon / dual wield side line
// branching off below, the sector's two jobs as destinations at the far end), the jobs (twelve
// destinations round a compass) and one map per job branch (the job's gate and trunk, then the branch,
// a fork's choices stacked on one step).

export const SECTOR_ORDER = ['str', 'strdex', 'dex', 'dexint', 'int', 'intstr'];
export const SIDE_LINES = { str: 'heavy', strdex: 'dual' };
export const JOB_SECTOR = {
  guardian: 'str', heavy: 'str', blade: 'strdex', duelist: 'strdex', power: 'dex', hunter: 'dex',
  trapper: 'dexint', spellarcher: 'dexint', elemage: 'int', summoner: 'int', priest: 'intstr', spellblade: 'intstr',
};
// the compass bearing of each sector (degrees, 0 = right, 90 = down: INT at the top, STR/DEX at the foot)
export const SECTOR_ANGLE = { int: -90, dexint: -30, dex: 30, strdex: 90, str: 150, intstr: 210 };

const DX = 84; // one step of road
const R = { origin: 24, minor: 15, notable: 21, keystone: 23, job: 30 };
export const radius = (n) => (n.type === 'job' ? R.job : n.type === 'origin' ? R.origin : R[n.type] || R.minor);

const num = (id) => Number(id.match(/(\d+)$/)?.[1] || 0);
// a road that wanders: neighbours alternate above and below the line so their captions never meet
const wander = (i, mid, amp, seed = 0) => mid + (i % 2 ? amp : -amp) + 14 * Math.sin(i * 0.9 + seed);

function roads(tree, coords) {
  const edges = [];
  for (const id of Object.keys(coords)) {
    const n = tree.nodes[id];
    for (const p of [...(n.requires || []), ...(n.requiresAny || [])]) if (coords[p] && p !== id) edges.push([p, id]);
  }
  return edges;
}

/** Every page of the book, in reading order (job branch pages follow the jobs index). */
export function bookPages(tree) {
  const pages = [{ id: 'overview', kind: 'overview' }, { id: 'camp', kind: 'camp' }];
  for (const s of SECTOR_ORDER) pages.push({ id: `sector.${s}`, kind: 'sector', sector: s });
  pages.push({ id: 'jobs', kind: 'jobs' });
  for (const [job, J] of Object.entries(tree.jobs)) for (const b of Object.keys(J.branches)) pages.push({ id: `job.${job}.${b}`, kind: 'job', job, branch: b });
  return pages;
}

/** The map of one page: { width, height, coords: {id: [x, y]}, edges: [[from, to]], context: [ids],
 *  destinations: [{job, x, y}], terrain }. Overview and jobs index are drawn by the view itself. */
export function pageMap(tree, page) {
  const N = tree.nodes, ids = Object.keys(N);
  if (page.kind === 'camp') {
    const coords = { [tree.origin]: [110, 250] };
    const centre = ids.filter((id) => N[id].ring === 'inner' && N[id].sector === 'center').sort((a, b) => num(a) - num(b));
    centre.forEach((id, i) => { coords[id] = [110 + (i + 1) * DX * 1.35, wander(i + 1, 250, 70)]; });
    const c1 = coords[centre[0]];
    // signposts: six roads out of the first crossroads, one to each sector's map
    const signs = SECTOR_ORDER.map((s, i) => ({ sector: s, x: c1[0] + 40 + (i % 3) * 120, y: 455 + Math.floor(i / 3) * 70 }));
    return { width: Math.max(1000, 110 + (centre.length + 1) * DX * 1.35 + 80), height: 600, coords, edges: roads(tree, coords), context: [], destinations: [], signs, terrain: 'camp' };
  }
  if (page.kind === 'sector') {
    const s = page.sector, side = SIDE_LINES[s], coords = {}, context = [];
    const start = 'in.center.c1';
    coords[start] = [80, 205]; context.push(start);
    const main = ids.filter((id) => N[id].ring === 'inner' && N[id].sector === s).sort((a, b) => num(a) - num(b));
    main.forEach((id, i) => { coords[id] = [80 + (i + 1) * DX, wander(i + 1, 205, 52, 1)]; });
    let height = 470;
    if (side) {
      const line = ids.filter((id) => N[id].ring === 'inner' && N[id].sector === side).sort((a, b) => num(a) - num(b));
      const from = N[line[0]].requires[0], col = main.indexOf(from) + 1;
      line.forEach((id, i) => { coords[id] = [80 + (col + i + 1) * DX, wander(i, 420, 42, 2)]; });
      height = 560;
    }
    const jobs = Object.keys(tree.jobs).filter((j) => JOB_SECTOR[j] === s);
    const jx = 80 + (main.length + 2) * DX;
    const destinations = jobs.map((job, i) => ({ job, x: jx, y: side ? [150, 330][i] : [140, 330][i] }));
    return { width: jx + 120, height, coords, edges: roads(tree, coords), context, destinations, terrain: s };
  }
  if (page.kind === 'job') {
    const { job, branch } = page, coords = {}, entry = tree.jobs[job].entry;
    const trunk = [entry, ...ids.filter((id) => id.startsWith(`job.${job}.trunk`)).sort((a, b) => num(a) - num(b))];
    trunk.forEach((id, i) => { coords[id] = [90 + i * DX, i ? wander(i, 260, 50) : 260]; });
    const own = ids.filter((id) => N[id].job === job && N[id].branchId === branch);
    // steps: passes and keys in tree order; a fork group shares one step
    const steps = [];
    for (const id of own) {
      const g = N[id].forkGroup, last = steps.at(-1);
      if (g && last && N[last[0]].forkGroup === g) last.push(id); else steps.push([id]);
    }
    const MID = 260;
    steps.forEach((step, i) => {
      const x = 90 + (trunk.length + i) * DX;
      if (step.length === 1) coords[step[0]] = [x, wander(trunk.length + i, MID, 50)];
      else step.forEach((id, k) => { coords[id] = [x, MID + (k - (step.length - 1) / 2) * (step.length > 3 ? 112 : step.length > 2 ? 140 : 180)]; });
    });
    const width = 90 + (trunk.length + steps.length - 1) * DX + 120;
    return { width: Math.max(1000, width), height: 520, coords, edges: roads(tree, coords), context: [], destinations: [], steps, terrain: JOB_SECTOR[job] };
  }
  return null;
}

/** The page a node is drawn on (for jumping to a node from anywhere). */
export function pageOf(tree, id) {
  const n = tree.nodes[id];
  if (!n) return null;
  if (id === tree.origin || n.sector === 'center') return 'camp';
  if (n.ring === 'inner') return `sector.${Object.entries(SIDE_LINES).find(([, l]) => l === n.sector)?.[0] || n.sector}`;
  const branch = n.branchId || Object.keys(tree.jobs[n.job].branches)[0];
  return `job.${n.job}.${branch}`;
}
