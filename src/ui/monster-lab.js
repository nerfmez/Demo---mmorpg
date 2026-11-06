// The monster sandbox (?fresh=1&monsterLab=<type>; docs/MONSTER-ATTACKS.md): one monster of the chosen type
// in the real game, its chosen attack looped on a hero who takes no lasting harm, so a monster's wind-up,
// strike and effect can be reviewed on the iPad from the game camera. Pause, slow motion and a frame step
// drive the game's clock (main.js asks tick(dt) for the step to run). Nothing here is saved.
import './monster-lab.css';
import MOTION from '../../data/monster-motion.json';
import { motionStyle } from '../render/monster-motion.js';
import { labTrigger } from '../core/ai.js';

const SPEEDS = [1, 0.5, 0.25];
// the walk mode's path: across in front of the hero (toward the camera), this far either side of them
const WALK_HALF = 2.6, WALK_FRONT = 1.6;

/**
 * The arena (?arena=1): a rules world made flat, open ground - no height, water, rocks, walls or safe town - to match
 * the View's bare arena floor. Only the sandbox page does this; the rules themselves are untouched.
 */
export function flattenWorld(w) {
  const zero = () => 0, no = () => false;
  Object.assign(w, {
    groundY: zero, surfaceY: zero, terrainY: zero, slopeAt: zero,
    isWater: no, isBeach: no, inSea: no, inRiver: no, inPond: no, onBridge: no, isSafe: no,
    isFree: () => true,
    move: (x, z, r, dx, dz) => ({ x: x + dx, z: z + dz, blocked: false, blockedHard: false }),
  });
  return w;
}

/**
 * Find a free, unsafe spot near (x, z) with room around it, spiralling out; the ground toward the camera (+z) and
 * to the right (where the monster stands) clear too, so no wreck or wall in the foreground hides the fight.
 */
function clearSpot(game, x, z, room = 3) {
  const W = game.world, open = (px, pz) => W.isFree(px, pz, room) && W.isFree(px, pz + 4, 3) && W.isFree(px + 4, pz, 3) && W.isFree(px + 3, pz + 4, 3) && !game.isSafe(px, pz);
  for (let r = 0; r < 160; r += 2) for (let a = 0; a < 6.28; a += r ? 1.2 / r : 7) {
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (open(px, pz)) return [px, pz];
  }
  for (let r = 0; r < 120; r += 2) for (let a = 0; a < 6.28; a += r ? 1.2 / r : 7) {
    const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (W.isFree(px, pz, room) && !game.isSafe(px, pz)) return [px, pz];
  }
  return [x, z];
}

export function startMonsterLab({ game, view, root, input, data, type, bare = false, arena = false }) {
  if (arena) { flattenWorld(game.world); game.isSafe = () => false; }
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
  const lab = { type, attack: null, m: null, speed: 0, paused: false, step: false, cool: 0.6, auto: true, walk: null, style: null, leg: 1 };
  // walk choices for this type (data/monster-motion.json styles), the first being the game's own
  const stylesOf = (t) => Object.keys(MOTION.styles?.[t] || {}).filter((k) => k !== '_doc');

  const spawn = () => {
    const def = defs[lab.type];
    const level = def.levels ? def.levels[0] : 10;
    const ang = 0.6; // in front of the hero, toward the camera's side
    const m = game.spawnMinion(lab.type, level, p.x + Math.sin(ang) * 5, p.z + Math.cos(ang) * 5);
    game.monsters = [m];
    lab.m = m;
    // first shown: an attack it can come round to on its own (one at its back has to be set up every time)
    const own = Object.keys(def.attacks).find((k) => !def.attacks[k].use?.behind) || Object.keys(def.attacks)[0];
    lab.attack = lab.attack && def.attacks[lab.attack] ? lab.attack : own;
    lab.cool = 0.8;
    if (!stylesOf(lab.type).includes(lab.style)) lab.style = stylesOf(lab.type)[0] || null;
    if (lab.walk) startWalk(lab.walk);
  };

  // The walk mode (owner, 2026-11-04: the walks are judged on their own): no attacks; the monster walks across in
  // front of the hero and back, side on to the camera, at its strolling pace ('walk', as it wanders) or its
  // chasing pace ('run'). It is put on a copy of its type that never takes notice of the hero.
  const startWalk = (mode) => {
    const m = lab.m, base = defs[lab.type];
    lab.walk = mode;
    lab.front = mode === 'trail' ? m.r + 0.9 : WALK_FRONT; // a slime trail is laid just past the hero's feet
    m.def = { ...base, aggroRange: 0, dormant: undefined, speed: mode === 'run' ? base.speed / 0.45 : base.speed }; // a dormant boss would not wander
    // from the left end, already facing along the path (the first lap is the same as the rest)
    Object.assign(m, { x: p.x - WALK_HALF, z: p.z + lab.front, facing: Math.PI / 2, aggro: false, targetUnit: null, state: 'idle', stateT: 0, windup: null, charge: null, melee: null, wanderTo: null, wanderT: 99 });
    lab.leg = -1;
  };
  const stopWalk = () => {
    if (!lab.walk) return;
    lab.walk = null;
    lab.m.def = defs[lab.type];
    lab.cool = 0.6;
    arrange();
  };

  // ready the monster for another go: alive, hurt enough for an attack kept for a hurt monster (use.hpBelow), a
  // once-a-fight attack allowed again, old doubles gone
  const refresh = () => {
    const m = lab.m, u = m.def.attacks[lab.attack].use || {};
    if (m.dead || m.hp < m.maxHp * 0.2) Object.assign(m, { dead: false, hp: m.maxHp });
    if (u.hpBelow) m.hp = Math.min(m.hp, m.maxHp * u.hpBelow * 0.8);
    m.used = null;
    for (const o of game.monsters) if ((o.illusion || o.bud) && !o.dead) game.killMonster(o);
    Object.assign(m, { aggro: true, targetUnit: p });
  };
  // Each new go: if the monster can get to where the attack starts on its own feet, it walks there - the sandbox
  // no longer moves it (owner, 2026-11-04: the walk "still stutters"; it was this jump, every few seconds, with
  // the camera). Only an attack at its back (use.behind) or one it is too close to start puts it in place.
  // Returns false while a monster that circles is still backing off to where the attack can start (it walks
  // there on its own, for up to 3 s).
  const again = (dt) => {
    const m = lab.m, atk = m.def.attacks[lab.attack], u = atk.use || {}, lo = u.min ?? atk.minRange ?? 0;
    const gap = Math.hypot(m.x - p.x, m.z - p.z) - m.r - p.r;
    if (!m.dead && !u.behind && gap < lo && m.def.kit?.circle && (lab.wait = (lab.wait || 0) + dt) < 3) { refresh(); return false; }
    lab.wait = 0;
    if (m.dead || u.behind || gap < lo || gap > 14) arrange();
    else refresh();
    return true;
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
    Object.assign(m, { x, z, homeX: x, homeZ: z, facing: Math.atan2(p.x - x, p.z - z) + (u.behind ? Math.PI : 0), state: 'chase', stateT: 0, windup: null, charge: null, melee: null });
    refresh();
    // the camera glides to the middle of the two (tick keeps focusShift there), it does not jump
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
  const walkRow = document.createElement('div');
  walkRow.className = 'ml-attacks ml-walk';
  const tools = document.createElement('div');
  tools.className = 'ml-tools';
  const btn = (label, fn, aria) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); }); tools.append(b); return b; };
  const playB = btn('หยุด', () => { lab.paused = !lab.paused; sync(); });
  const speedB = btn('×1', () => { lab.speed = (lab.speed + 1) % SPEEDS.length; sync(); }, 'ความเร็ว');
  const stepB = btn('ทีละเฟรม', () => { lab.paused = true; lab.step = true; sync(); });
  btn('อีกครั้ง', () => { lab.cool = 0; arrange(); });
  const zoomB = btn('ซูม', () => { view.zoom = view.zoom < 1 ? 1 : 0.5; zoomB.classList.toggle('on', view.zoom < 1); });
  bar.append(head, chips, walkRow, tools);
  for (const ev of ['pointerdown', 'touchstart']) bar.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  const renderChips = () => {
    chips.textContent = '';
    for (const [id, a] of Object.entries(defs[lab.type].attacks)) {
      const c = document.createElement('button');
      c.type = 'button';
      c.textContent = a.nameTh || id;
      // a trail (kit.trail: the snail king's slime) is shown by crawling past the hero
      const trail = defs[lab.type].kit?.trail?.attack === id;
      c.classList.toggle('on', trail ? lab.walk === 'trail' : !lab.walk && id === lab.attack);
      c.addEventListener('click', (e) => { e.stopPropagation(); lab.attack = id; lab.cool = 0; if (trail) startWalk('trail'); else if (lab.walk) stopWalk(); else arrange(); renderChips(); });
      chips.append(c);
    }
    renderWalk();
  };
  // walk / run (the walk mode) and the walk choices, when the type has some
  const renderWalk = () => {
    walkRow.textContent = '';
    const chip = (label, on, fn) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.textContent = label;
      c.classList.toggle('on', on);
      c.addEventListener('click', (e) => { e.stopPropagation(); fn(); renderChips(); });
      walkRow.append(c);
    };
    chip('เดิน', lab.walk === 'walk', () => (lab.walk === 'walk' ? stopWalk() : startWalk('walk')));
    chip('วิ่ง', lab.walk === 'run', () => (lab.walk === 'run' ? stopWalk() : startWalk('run')));
    for (const st of stylesOf(lab.type)) chip('ท่า: ' + (MOTION.styles[lab.type][st].nameTh || st), st === lab.style, () => { lab.style = st; });
  };
  const sync = () => {
    playB.textContent = lab.paused ? 'เล่น' : 'หยุด';
    speedB.textContent = '×' + SPEEDS[lab.speed];
    stepB.disabled = !lab.paused && false;
  };
  pick.addEventListener('change', () => { input.reset(); lab.type = pick.value; lab.attack = null; lab.walk = null; spawn(); renderChips(); });
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
      // the camera frames the hero and the monster together (walking, it holds still while the monster crosses)
      view.focusShift ||= { x: 0, z: 0 };
      if (m && lab.walk) { view.focusShift.x = 0; view.focusShift.z = lab.front * (lab.walk === 'trail' ? 0.5 : 0.25); }
      else if (m) { view.focusShift.x = (m.x - p.x) * 0.5; view.focusShift.z = (m.z - p.z) * 0.5; }
      // the chosen walk on its rig (rigs are pooled and posed by the view; this only swaps the walk's tuning)
      const mv = m && lab.style && view.monsterViews?.get(m.id);
      if (mv && mv.rig.labStyle !== lab.style) { mv.rig.motion = motionStyle(MOTION, lab.type, lab.style); mv.rig.labStyle = lab.style; }
      if (!m || m.dead) { if (m?.dead && m.deathT > 1.2) spawn(); }
      else if (lab.walk) {
        // across in front of the hero and back: a new end each time it gets there
        for (const k in m.cd) m.cd[k] = 99;
        Object.assign(m, { aggro: false, targetUnit: null, wanderT: 99 });
        if (m.state !== 'idle') Object.assign(m, { state: 'idle', stateT: 0, windup: null });
        if (!m.wanderTo) { lab.leg = -lab.leg; m.wanderTo = { x: p.x + lab.leg * WALK_HALF * (lab.walk === 'trail' ? 1.6 : 1), z: p.z + lab.front }; }
      } else {
        // only the chosen attack is ever ready; after it ends, a short pause, then it goes again
        for (const k in m.cd) if (k !== lab.attack) m.cd[k] = 99;
        // what an attack leaves on the ground (eggs, pools) is gone before it goes again, so a review is not cluttered
        const lingering = game.areas.some((a) => a.sourceId === m.id && a.attack === lab.attack);
        if ((m.state === 'chase' || m.state === 'idle') && !lingering) {
          lab.cool -= dt;
          // (not ready yet: the chosen attack stays cooling a moment longer, so the monster circles out to its band)
          // an attack that answers what is done to it (no `use`: hit hard, brought low) is set off as if that happened
          const reactive = !m.def.attacks[lab.attack].use;
          if (lab.cool <= 0 && reactive) { refresh(); if (labTrigger(game, m, lab.attack)) lab.cool = 4.5; else lab.cool = 1; }
          else if (lab.cool <= 0) { if (!lab.auto || again(dt)) { m.cd[lab.attack] = 0; lab.cool = 1.2; } else m.cd[lab.attack] = 0.7; }
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
