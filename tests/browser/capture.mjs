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
    f.view.camTarget.set(x, 0, z);
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

// 1. hero + boar wind-up (charge) + slash effect
await page.evaluate(() => {
  const f = window.__frontier;
  f.paused = true;
  f.stage(-45, 8, 0.62);
  f.place('tusk_boar', -42, 6.5, -1.9, 'charge', 0.5);
  f.place('tusk_boar', -47.5, 5.5, 0.9);
  f.game.player.facing = 2.0;
  f.view.vfx.slash({ x: -45, z: 8, angle: 2.0, arc: 120, range: 2.4, element: 'physical' });
});
await shot('1-hero-boar', 120);
// 2. beetle spitting + one curled in its shell, firebolt in flight
await page.evaluate(() => {
  const f = window.__frontier;
  f.paused = false;
  f.stage(-2, 10, 0.62);
  const a = f.place('moss_beetle', 1, 8, -1.2, 'spit', 0.4);
  const b = f.place('moss_beetle', -4.5, 7.5, 1.2);
  const m = f.game.monsterById(b);
  m.shell = true;
  m.state = 'shell';
  m.stateDur = 99;
  f.game.player.facing = 1.9;
  f.game.setAimPoint(1, 8);
  f.game.player.cooldowns[1] = 0;
  f.game.player.mp = 99;
  f.game.castSlot(1);
});
await shot('2-beetles', 600);
// 3. wisps over the wetland
await page.evaluate(() => {
  const f = window.__frontier;
  f.paused = true;
  f.stage(31, 10, 0.7);
  f.place('marsh_wisp', 33, 7, -1.5, 'orb', 0.3);
  f.place('marsh_wisp', 28, 6, 0.8);
});
await shot('3-wisps');
// 4. boss slam wind-up telegraph
await page.evaluate(() => {
  const f = window.__frontier;
  f.paused = true;
  f.stage(80, 5, 0.85);
  const boss = f.game.monsters.find((m) => m.boss);
  boss.x = 84;
  boss.z = 1;
  boss.facing = -2.2;
  boss.aggro = true;
  boss.state = 'windup';
  boss.windup = { name: 'slam', total: 1.1, angle: -2.2, radius: 4.8 };
  boss.stateT = 0.8;
});
await shot('4-boss-slam', 1500);
await page.evaluate(() => {
  const f = window.__frontier;
  const boss = f.game.monsters.find((m) => m.boss);
  boss.windup = { name: 'gore', total: 1, angle: -2.3 };
  boss.stateT = 0.7;
  f.stage(78, 7, 1.0);
});
await shot('5-boss-gore', 900);
// 6. town overview
await page.evaluate(() => {
  const f = window.__frontier;
  f.paused = true;
  f.stage(-82, 2, 1.25);
});
await shot('6-town', 1500);
// 7. stone burst + healing spring + ward
await page.evaluate(() => {
  const f = window.__frontier;
  const g = f.game;
  f.paused = false;
  f.stage(-40, 8, 0.75);
  g.ch.skills.stone_burst = 1;
  g.ch.skills.healing_spring = 1;
  g.ch.stats.INT = 8;
  g.ch.slots[3] = { skill: 'stone_burst', mods: [] };
  g.refresh();
  g.player.mp = 999;
  g.castSlot(3, { x: -36, z: 6 });
  g.executeSkill({ ...g.skills[2], mult: 1 }, { angle: 0, x: g.player.x, z: g.player.z });
});
await shot('7-skills', 700);
await browser.close();
process.kill(-server.pid);
