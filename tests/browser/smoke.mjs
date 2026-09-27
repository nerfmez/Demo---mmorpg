// Browser smoke test: builds nothing, serves dist/ with `vite preview`, loads the game in
// Chromium (desktop + iPad-sized touch), checks for errors, plays a little through the
// game's own API and saves screenshots to tests/browser/out/.
// Usage: npm run build && npm run test:browser  (BROWSER=webkit to use WebKit if installed)
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4178;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 60) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 300));
}

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

async function run(name, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://localhost:${PORT}/?fresh=1&seed=5&quality=medium`);
  await page.waitForFunction(() => window.__frontier && window.__frontier.game.time > 0.5, null, { timeout: 30000 });
  check(errors.length === 0, `${name}: no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${name}-1-town.png` });

  // walk to the meadow and fight through the game API
  const res = await page.evaluate(async () => {
    const { game, input } = window.__frontier;
    input.disabled = true;
    const p = game.player;
    p.x = -52;
    p.z = 5;
    const t0 = game.time;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let casts = 0;
    for (let i = 0; i < 100; i++) {
      const near = game.monsters.filter((m) => !m.dead && !m.boss && m.x > -60 && m.x < -20).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near) {
        const d = Math.hypot(near.x - p.x, near.z - p.z);
        if (d > 9) {
          // test harness: hop next to the next monster instead of walking
          p.x = near.x - 4;
          p.z = near.z;
        }
        game.setMove(0, 0);
        game.setAimPoint(near.x, near.z);
        if (game.castSlot(1)) casts++;
        if (game.castSlot(0)) casts++;
        if (p.hp < p.maxHp * 0.4) p.hp = p.maxHp;
      }
      // software GL renders slowly here, so step the simulation directly (1/10 s per loop)
      for (let k = 0; k < 6; k++) game.update(1 / 60);
      await wait(30);
    }
    return { gameTime: game.time - t0, kills: game.stats.kills, dealt: game.stats.damageDealt, casts, drops: game.drops.length, mats: { ...game.ch.materials }, level: game.ch.level };
  });
  console.log(`     gameTime=${res.gameTime.toFixed(1)}s casts=${res.casts} dealt=${res.dealt} kills=${res.kills} lv=${res.level} drops=${res.drops} mats=${JSON.stringify(res.mats)}`);
  check(res.dealt > 0, `${name}: skills hit monsters`);
  check(res.kills > 0, `${name}: monsters die and drop loot`);
  await page.screenshot({ path: `${OUT}${name}-2-meadow.png` });

  // panels open without errors
  for (const t of ['skills', 'job', 'bag', 'char']) {
    await page.evaluate((tab) => window.__frontier.panels.open(tab), t);
    await page.waitForTimeout(150);
    if (t === 'skills') await page.screenshot({ path: `${OUT}${name}-3-skills.png` });
    if (t === 'job') await page.screenshot({ path: `${OUT}${name}-4-job.png` });
  }
  await page.evaluate(() => window.__frontier.panels.close());

  // boss arena view
  await page.evaluate(() => {
    const { game } = window.__frontier;
    game.player.x = 70;
    game.player.z = 2;
    game.player.hp = game.player.maxHp;
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}${name}-5-ruins.png` });
  const fps = await page.evaluate(() => window.__frontier.fps);
  console.log(`     fps(software GL, not a device measure)=${fps}`);
  check(errors.length === 0, `${name}: still no page errors ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

try {
  await run('desktop', { viewport: { width: 1600, height: 900 } });
  await run('ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
} finally {
  await browser.close();
  stopServer();
}
console.log(failures ? `${failures} FAILED` : 'ALL OK');
process.exit(failures ? 1 : 0);
