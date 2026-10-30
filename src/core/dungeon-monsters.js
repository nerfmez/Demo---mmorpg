// The dungeon's monsters walking about (owner, 30 October 2026: "ทำอนิเมชั่นเดินของแต่ละตัว หอยขอเป็นกระโดด").
// Until they get a fight, each monster prop whose type has `walk` in propTypes wanders near its home:
// it rests, picks a spot within `wander` m it can stand on, turns to it and goes, then rests again.
// Two gaits: `crawl` moves at `speed` m/s; `hop` moves only in the air, `length` m per hop of `air` s,
// one hop every `every` s (the clam leaps along, the stranded fish flops along). `stay` keeps it on a
// floor kind (the fish in the shallows). A monster never steps where its body does not fit, onto the
// hero or into another prop, and its collision circles move with it, so the hero bumps into it.
// The boss sleeps (no walking) until wake(); then it waits `wakeRest` s and keeps inside the arena.
// Pure rules: no three, no DOM; the renderer reads x, z, y, facing, moving, air and travelled.
import { createRng } from './rng.js';
import { turn } from './dungeon.js';

const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * @param {object} map createDungeon(...) result (its blockers are moved with the monsters)
 * @param {object} rules the dungeon file's shared rules (propTypes with `walk`, heroRadius)
 * @param {number} seed
 */
export function createDungeonMonsters(map, rules, seed = 1) {
  const rng = createRng(seed);
  const arena = map.def.arena || null;
  const list = [];
  for (const p of map.def.props || []) {
    const walk = rules.propTypes[p.type]?.walk;
    if (!walk) continue;
    const s = p.scale ?? 1, own = map.blockers.filter((b) => b.src === p);
    const body = Math.max(0.3, ...own.map((b) => b.r));
    list.push({
      prop: p, type: p.type, walk, own, body, home: [...p.at],
      x: p.at[0], z: p.at[1], y: map.surfaceAt(p.at[0], p.at[1])?.y ?? 0, facing: p.rot ?? 0,
      asleep: !!walk.asleep, state: 'rest', timer: rng.range(...walk.rest), target: null,
      gaitT: 0, air: -1, moving: false, travelled: 0, scale: s,
    });
  }

  const kindAt = (x, z) => map.surfaceAt(x, z)?.floor.kind;
  // the spot the monster may stand on: its body fits on walkable ground one step from where it is,
  // its floor kind if it keeps to one, inside the arena for the boss, clear of other props and the hero
  function fits(m, x, z, hero) {
    if (Number.isNaN(map.standY(x, z, m.y, m.body))) return false;
    if (m.walk.stay && kindAt(x, z) !== m.walk.stay) return false;
    if (m.walk.arena && arena && Math.hypot(x - arena.at[0], z - arena.at[1]) > arena.clear - m.body) return false;
    for (const b of map.blockers) {
      if (b.src === m.prop) continue;
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < (b.r + m.body * 0.6) ** 2) return false;
    }
    if (hero && Math.hypot(x - hero.x, z - hero.z) < m.body + rules.heroRadius) return false;
    return true;
  }

  function place(m) {
    for (const b of m.own) {
      const [ox, oz] = turn(b.local[0], b.local[1], m.facing);
      b.x = m.x + ox;
      b.z = m.z + oz;
    }
  }

  function pickTarget(m, hero) {
    const reach = m.walk.arena && arena ? arena.clear - m.body : m.walk.wander;
    const centre = m.walk.arena && arena ? arena.at : m.home;
    for (let k = 0; k < 10; k++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(reach * 0.35, reach);
      const x = centre[0] + Math.sin(a) * d, z = centre[1] + Math.cos(a) * d;
      if (Math.hypot(x - m.x, z - m.z) > 1 && fits(m, x, z, hero)) return [x, z];
    }
    return null;
  }

  function rest(m, seconds) {
    m.state = 'rest';
    m.timer = seconds ?? rng.range(...m.walk.rest);
    m.target = null;
    m.moving = false;
    m.air = -1;
    m.gaitT = 0;
  }

  function step(m, dt, hero) {
    if (m.asleep) return;
    if (m.state === 'rest') {
      m.timer -= dt;
      if (m.timer > 0) return;
      m.target = pickTarget(m, hero);
      if (!m.target) return rest(m);
      m.state = 'walk';
    }
    const w = m.walk, [tx, tz] = m.target;
    const want = Math.atan2(tx - m.x, tz - m.z), off = angleTo(m.facing, want);
    // it turns toward where it goes; a big turn is made on the spot before it sets off
    const turnBy = Math.sign(off) * Math.min(Math.abs(off), w.turn * dt);
    m.facing += turnBy;
    place(m);
    if (Math.abs(off) > 0.6 && m.air < 0) { m.moving = false; return; }
    let go = 0;
    if (w.gait === 'hop') {
      m.gaitT += dt;
      const ph = m.gaitT % w.every;
      m.air = ph < w.air ? ph / w.air : -1;
      if (m.air >= 0) go = (w.length / w.air) * dt;
      else if (Math.hypot(tx - m.x, tz - m.z) < w.length * 0.6) return rest(m); // landed near enough
    } else {
      go = w.speed * dt;
      if (Math.hypot(tx - m.x, tz - m.z) < 0.3) return rest(m);
    }
    m.moving = true;
    if (!go) return;
    const x = m.x + Math.sin(m.facing) * go, z = m.z + Math.cos(m.facing) * go;
    if (!fits(m, x, z, hero)) {
      // something in the way: land where it is and rest
      return rest(m);
    }
    m.y = map.standY(x, z, m.y, m.body);
    m.x = x;
    m.z = z;
    m.travelled += go;
    place(m);
  }

  return {
    list,
    /** Advance every monster by dt seconds; hero {x, z} is kept clear. */
    update(dt, hero = null) {
      for (const m of list) step(m, dt, hero);
    },
    /** Wake a sleeping monster type (the boss, from the throne's pearl): it waits, then walks. */
    wake(type) {
      for (const m of list) if (m.type === type && m.asleep) { m.asleep = false; rest(m, m.walk.wakeRest ?? 2); }
    },
    byProp: (p) => list.find((m) => m.prop === p) || null,
  };
}
