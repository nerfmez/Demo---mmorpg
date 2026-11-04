// The monster sandbox (?fresh=1&monsterLab=<type>; docs/MONSTER-ATTACKS.md): one monster of the chosen type
// in the real game, its chosen attack looped on a hero who takes no lasting harm, so a monster's wind-up,
// strike and effect can be reviewed on the iPad from the game camera. Pause, slow motion and a frame step
// drive the game's clock (main.js asks tick(dt) for the step to run). Nothing here is saved.
import './monster-lab.css';

const SPEEDS = [1, 0.5, 0.25];

/** Find a free, unsafe spot near (x, z) with room around it, spiralling out. */
function clearSpot(game, x, z, room = 3) {
  for (let r = 0; r < 120; r += 2) for (let a = 0; a < 6.28; a += r ? 1.2 / r : 7) {
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (game.world.isFree(px, pz, room) && !game.isSafe(px, pz)) return [px, pz];
  }
  return [x, z];
}

export function startMonsterLab({ game, view, root, input, data, type, bare = false }) {
  // bare (&bare=1, for quick review videos): the map's scenery, grass and townsfolk hidden, only its ground left,
  // so a frame draws fast without a graphics card; the monster, the hero and every effect are unchanged
  if (bare) view.region?.staticReadyPromise?.then(() => {
    const R = view.region, top = (o) => { while (o && o.parent !== R.root) o = o.parent; return o; };
    for (const g of R.grass) { const t = top(g); if (t) t.visible = false; }
    for (const w of R.waypointStones?.values?.() || []) { const t = top(w); if (t) t.visible = false; }
    for (const n of R.npcs) n.root.visible = false;
  });
  const defs = data.monsters.monsters;
  if (!defs[type]) type = Object.keys(defs).find((k) => defs[k].behavior === 'kit') || Object.keys(defs)[0];
  const p = game.player;
  const [sx, sz] = clearSpot(game, p.x, p.z, 4);
  Object.assign(p, { x: sx, z: sz });
  view.snapCamera();
  game.spawnPoints = []; // only the monster under review
  const lab = { type, attack: null, m: null, speed: 0, paused: false, step: false, cool: 0.6, auto: true };

  const spawn = () => {
    const def = defs[lab.type];
    const level = def.levels ? def.levels[0] : 10;
    const ang = 0.6; // in front of the hero, toward the camera's side
    const m = game.spawnMinion(lab.type, level, p.x + Math.sin(ang) * 5, p.z + Math.cos(ang) * 5);
    game.monsters = [m];
    lab.m = m;
    lab.attack = lab.attack && def.attacks[lab.attack] ? lab.attack : Object.keys(def.attacks)[0];
    lab.cool = 0.8;
  };

  // put the monster at the attack's distance from the hero, facing them, ready to use only that attack
  const arrange = () => {
    const m = lab.m, atk = m.def.attacks[lab.attack];
    const u = atk.use || {}, lo = u.min ?? atk.minRange ?? 0, hi = u.max ?? atk.maxRange ?? atk.range ?? 2;
    const gap = Math.max(0.3, Math.min(hi - 0.2, lo + (hi - lo) * 0.45));
    // beside the hero across the screen (the game camera looks down -z, so +x is screen right): a leap or a
    // cone then reads in full; the other side, or a diagonal, where that is blocked
    const d = m.r + p.r + gap;
    let x = p.x + d, z = p.z;
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI * 0.3, -Math.PI * 0.3, Math.PI * 0.7, -Math.PI * 0.7]) {
      const tx = p.x + Math.sin(a) * d, tz = p.z + Math.cos(a) * d;
      if (game.world.isFree(tx, tz, m.r) && !game.isSafe(tx, tz)) { x = tx; z = tz; break; }
    }
    // an attack at what is behind it (use.behind) gets the monster's back to the hero
    Object.assign(m, { x, z, homeX: x, homeZ: z, facing: Math.atan2(p.x - x, p.z - z) + (u.behind ? Math.PI : 0), aggro: true, state: 'chase', stateT: 0, windup: null, charge: null, melee: null, targetUnit: p });
    if (m.dead || m.hp < m.maxHp * 0.2) Object.assign(m, { dead: false, hp: m.maxHp });
    // an attack kept for a hurt monster (use.hpBelow) gets it hurt; a once-a-fight one may go again; old doubles go
    if (u.hpBelow) m.hp = Math.min(m.hp, m.maxHp * u.hpBelow * 0.8);
    m.used = null;
    for (const o of game.monsters) if (o.illusion && !o.dead) game.killMonster(o);
    // the camera goes straight to the middle of the two
    view.focusShift ||= { x: 0, z: 0 };
    view.focusShift.x = (x - p.x) * 0.5; view.focusShift.z = (z - p.z) * 0.5;
    view.camTarget.x = p.x + view.focusShift.x; view.camTarget.z = p.z + view.focusShift.z;
  };

  // --- the bar ---
  const bar = document.createElement('div');
  bar.className = 'monster-lab';
  const head = document.createElement('div');
  head.className = 'ml-head';
  const pick = document.createElement('select');
  pick.setAttribute('aria-label', 'มอนสเตอร์');
  for (const [id, d] of Object.entries(defs)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = (d.behavior === 'kit' ? '★ ' : '') + (d.nameTh || id);
    pick.append(o);
  }
  pick.value = lab.type;
  const note = document.createElement('b');
  note.textContent = 'ห้องทดลองท่ามอน · ไม่บันทึก';
  head.append(note, pick);
  const chips = document.createElement('div');
  chips.className = 'ml-attacks';
  const tools = document.createElement('div');
  tools.className = 'ml-tools';
  const btn = (label, fn, aria) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); tools.append(b); return b; };
  const playB = btn('หยุด', () => { lab.paused = !lab.paused; sync(); });
  const speedB = btn('×1', () => { lab.speed = (lab.speed + 1) % SPEEDS.length; sync(); }, 'ความเร็ว');
  const stepB = btn('ทีละเฟรม', () => { lab.paused = true; lab.step = true; sync(); });
  btn('อีกครั้ง', () => { lab.cool = 0; arrange(); });
  const zoomB = btn('ซูม', () => { view.zoom = view.zoom < 1 ? 1 : 0.5; zoomB.classList.toggle('on', view.zoom < 1); });
  bar.append(head, chips, tools);
  for (const ev of ['pointerdown', 'touchstart']) bar.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  const renderChips = () => {
    chips.textContent = '';
    for (const [id, a] of Object.entries(defs[lab.type].attacks)) {
      const c = document.createElement('button');
      c.type = 'button';
      c.textContent = a.nameTh || id;
      c.classList.toggle('on', id === lab.attack);
      c.addEventListener('click', (e) => { e.stopPropagation(); lab.attack = id; lab.cool = 0; renderChips(); arrange(); });
      chips.append(c);
    }
  };
  const sync = () => {
    playB.textContent = lab.paused ? 'เล่น' : 'หยุด';
    speedB.textContent = '×' + SPEEDS[lab.speed];
    stepB.disabled = !lab.paused && false;
  };
  pick.addEventListener('change', () => { input.reset(); lab.type = pick.value; lab.attack = null; spawn(); renderChips(); });
  root.append(bar);
  spawn();
  renderChips();
  sync();

  return {
    bar,
    lab,
    /** The game step for this frame: 0 while paused (one 1/30 s step on request), scaled for slow motion. */
    tick(dt) {
      // the hero takes no lasting harm; statuses still show
      p.hp = p.maxHp;
      p.dead = false;
      const m = lab.m;
      // the camera frames the hero and the monster together
      if (m) { view.focusShift ||= { x: 0, z: 0 }; view.focusShift.x = (m.x - p.x) * 0.5; view.focusShift.z = (m.z - p.z) * 0.5; }
      if (!m || m.dead) { if (m?.dead && m.deathT > 1.2) spawn(); }
      else {
        // only the chosen attack is ever ready; after it ends, a short pause, then it goes again
        for (const k in m.cd) if (k !== lab.attack) m.cd[k] = 99;
        if (m.state === 'chase' || m.state === 'idle') {
          lab.cool -= dt;
          if (lab.cool <= 0) { if (lab.auto) arrange(); m.cd[lab.attack] = 0; lab.cool = 1.2; }
          else m.cd[lab.attack] = Math.max(m.cd[lab.attack], 0.05);
        }
      }
      if (lab.paused) {
        if (!lab.step) return 0;
        lab.step = false;
        return 1 / 30;
      }
      return dt * SPEEDS[lab.speed];
    },
  };
}
