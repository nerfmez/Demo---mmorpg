// Art review captures: stages scenes through the game API and saves close-ups of the
// hero, each monster (with its wind-up pose), skill effects, the town and the ruins.
// Usage: npm run build && node tests/browser/capture.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4180;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
  } catch {}
  if (i > 60) throw new Error('server');
  await new Promise((r) => setTimeout(r, 300));
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(`http://localhost:${PORT}/?fresh=1&seed=9&quality=high`);
await page.waitForFunction(() => window.__frontier && window.__frontier.game.time > 0.3, null, { timeout: 30000 });
await page.evaluate(() => {
  const f = window.__frontier;
  f.input.disabled = true;
  f.stage = (x, z, zoom = 1) => {
    const g = f.game;
    g.player.x = x;
    g.player.z = z;
    f.view.snapCamera();
    f.view.zoom = zoom;
  };
  f.place = (type, x, z, facing, windup, t = 0.6) => {
    const g = f.game;
    let m = g.monsters.find((q) => q.type === type && !q.dead && !q.placed);
    if (!m) return null;
    m.placed = true;
    m.x = x;
    m.z = z;
    m.facing = facing;
    m.aggro = true;
    if (windup) {
      m.state = 'windup';
      m.windup = { name: windup, total: 1, angle: facing, radius: m.def.attacks[windup]?.radius };
      m.stateT = t;
    } else m.state = 'chase';
    return m.id;
  };
});
const shot = async (name, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.screenshot({ path: `${OUT}art-${name}.png` });
  console.log('saved', name);
};

const run = (fn, arg) => page.evaluate(fn, arg);
const freeAt = (x, z) => run(([x, z]) => window.__frontier.game.freeSpotNear(x, z), [x, z]);

// 1. monster line-up on open meadow ground (every regular type, idle animation)
await run(() => {
  const f = window.__frontier;
  f.paused = true;
  f.stage(-82, 4, 0.95);
  const types = ['tusk_boar', 'thornback_wolf', 'moss_beetle', 'sporecap', 'marsh_wisp', 'crag_golem', 'gale_hawk'];
  types.forEach((t, i) => {
    const id = f.place(t, -91 + i * 3, -1, 0);
    const m = f.game.monsterById(id);
    if (m) m.aggro = false;
  });
  f.paused = false; // let the new models grow in, then freeze
  setTimeout(() => (f.paused = true), 700);
});
await shot('1-lineup', 1400);

// 2. hero animation strip: run, then a three-hit slash combo (frames every 90 ms)
const heroSpot = await freeAt(-80, 0);
await run((s) => {
  const f = window.__frontier;
  f.paused = false;
  f.stage(s.x, s.z, 0.55);
  f.input.disabled = true;
  f.game.setMove(1, 0);
}, heroSpot);
for (let i = 0; i < 3; i++) await shot(`2-run-${i}`, 110);
await run(() => {
  const f = window.__frontier;
  f.game.setMove(0, 0);
  f.game.player.facing = 1.2;
  f.game.setAimAngle(1.2);
  f.game.castSlot(0);
});
for (let i = 0; i < 4; i++) await shot(`2-slash-${i}`, 90);

// 3. greyfang in its den with its pack
await run(() => {
  const f = window.__frontier;
  f.paused = true;
  const [x, z] = f.world.data.den.centre;
  f.stage(x, z + 7, 0.9);
  const g = f.game.monsters.find((m) => m.type === 'greyfang');
  g.x = x;
  g.z = z;
  g.facing = 0;
  g.state = 'windup';
  g.aggro = true;
  g.windup = { name: 'howl', total: 1, angle: 0 };
  g.stateT = 0.6;
});
await shot('3-greyfang', 1200);

// 4. golem throw + hawk dive telegraphs on the highlands
await run(() => {
  const f = window.__frontier;
  f.paused = false;
  f.stage(52, -58, 0.95);
  const gid = f.place('crag_golem', 56, -62, -2.4);
  const hid = f.place('gale_hawk', 48, -61, 1);
  f.game.player.hp = 1e6;
});
await shot('4-highlands', 2600);

// 5. warden boss slam on the ruins plateau
await run(() => {
  const f = window.__frontier;
  f.paused = true;
  const boss = f.game.monsters.find((m) => m.type === 'horned_warden');
  f.stage(boss.spawn.x - 4, boss.spawn.z + 6, 0.95);
  boss.x = boss.spawn.x;
  boss.z = boss.spawn.z;
  boss.facing = -2.2;
  boss.aggro = true;
  boss.state = 'windup';
  boss.windup = { name: 'slam', total: 1.1, angle: -2.2, radius: 4.8 };
  boss.stateT = 0.8;
});
await shot('5-warden', 1500);

// 6. new skills: chain spark, frost nova, venom mire, spirit wolves
const skSpot = await freeAt(-86, 0);
await run((s) => {
  const f = window.__frontier;
  const g = f.game;
  f.paused = false;
  f.stage(s.x, s.z, 0.8);
  for (const id of Object.keys(g.data.skills.combat)) g.ch.skills[id] = 1;
  g.ch.stats.INT = 12;
  g.ch.slots[0] = { skill: 'chain_spark', mods: [] };
  g.ch.slots[1] = { skill: 'frost_nova', mods: [] };
  g.ch.slots[2] = { skill: 'venom_mire', mods: [] };
  g.ch.slots[3] = { skill: 'spirit_wolf', mods: [] };
  g.refresh();
  for (let i = 0; i < 4; i++) f.place('tusk_boar', s.x + 3 + (i % 2) * 2, s.z - 2 + i * 1.5, 0);
  g.player.mp = 999;
  g.castSlot(3);
  setTimeout(() => {
    g.player.mp = 999;
    g.castSlot(2, { x: s.x + 4, z: s.z });
  }, 500);
  setTimeout(() => {
    g.player.mp = 999;
    g.setAimPoint(s.x + 4, s.z);
    g.castSlot(0);
  }, 1000);
  setTimeout(() => {
    g.player.mp = 999;
    g.castSlot(1);
  }, 1300);
}, skSpot);
await shot('6-skills-a', 1150);
await shot('6-skills-b', 300);

// 7. the coast: beach, palms, crabs and the sea
const coastSpot = await run(() => window.__frontier.game.freeSpotNear(-30, window.__frontier.world.shoreZ(-30) - 7));
await run((s) => {
  const f = window.__frontier;
  f.paused = false;
  f.stage(s.x, s.z, 1.15);
  for (let i = 0; i < 3; i++) f.place('reef_crab', s.x - 4 + i * 4, s.z - 3, 0.4);
}, coastSpot);
await shot('7-coast', 1500);
// 8. the whole world map
await run(() => window.__frontier.panels.open('map'));
await shot('8-worldmap', 500);
await browser.close();
process.kill(-server.pid);
