// Focused skill-effect capture: casts one skill at a placed monster and saves frozen frames of
// each beat (cast, travel, impact, aftermath) at a fixed 60 fps step, so the frames are the same
// on every machine. Usage: npm run build && node tests/browser/skill-fx.mjs [skill]
// Frames go to tests/browser/out/skill-fx-<skill>-<beat>.png (BROWSER=webkit for WebKit).
// VIDEO=1 records every frame instead and encodes tests/browser/out/skill-fx-<skill>.mp4 (needs ffmpeg).
import { chromium, webkit } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const SKILL = process.argv[2] || 'firebolt';
const TAG = `skill-fx-${SKILL}`;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/?fresh=1&seed=9&quality=high`);
  await page.waitForFunction(() => window.__frontier?.game?.time > 0.3, null, { timeout: 60000 });

  const setup = await page.evaluate(
    (skill) => {
      const f = window.__frontier;
      const g = f.game;
      f.paused = true;
      f.input && (f.input.disabled = true);
      const spot = g.freeSpotNear(g.player.x + 4, g.player.z + 4);
      g.player.x = spot.x;
      g.player.z = spot.z;
      g.ch.skills[skill] = 1;
      g.ch.stats.INT = 12;
      g.ch.slots[0] = { skill, mods: [] };
      g.refresh();
      g.player.mp = 999;
      // a sturdy target 4.5 m to the west (the open side of the HUD), so the projectile flies across the frame
      const m = g.monsters.find((q) => !q.dead && !q.boss);
      if (!m) return { error: 'no monster to place' };
      m.x = spot.x - 4.5;
      m.z = spot.z;
      m.hp = m.maxHp = 99999;
      m.state = 'idle';
      m.aggro = false;
      f.view.snapCamera();
      f.view.zoom = 0.55;
      f.fxTime = 0;
      f.step = (n) => {
        const events = [];
        for (let i = 0; i < n; i++) {
          const dt = 1 / 60;
          f.fxTime += dt;
          g.monsters.forEach((q) => q.id === m.id && ((q.x = spot.x - 4.5), (q.z = spot.z), (q.state = 'idle')));
          g.update(dt);
          for (const e of g.drainEvents()) {
            events.push(e.type);
            f.view.handleEvent(e);
          }
          f.view.render(dt, f.fxTime, { aim: null });
        }
        return events;
      };
      f.step(30); // settle
      f.cast = () => {
        g.player.mp = 999;
        g.player.cooldowns[0] = 0;
        g.setAimPoint(spot.x - 4.5, spot.z);
        g.castSlot(0, { x: spot.x - 4.5, z: spot.z });
      };
      return { ok: true };
    },
    SKILL,
  );
  if (setup.error) throw new Error(setup.error);

  const shot = (beat) => page.screenshot({ path: `${OUT}${TAG}-${beat}.png` });
  const step = (n) => page.evaluate((k) => window.__frontier.step(k), n);
  if (process.env.VIDEO) {
    // two casts, every 60 fps frame of the action area, played back at real speed
    const dir = `${OUT}${TAG}-frames/`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const clip = { x: 0, y: 180, width: 820, height: 460 };
    let n = 0;
    for (const len of [100, 110]) {
      await page.evaluate(() => window.__frontier.cast());
      for (let i = 0; i < len; i++) {
        await step(1);
        await page.screenshot({ path: `${dir}${String(n++).padStart(4, '0')}.png`, clip });
      }
    }
    await browser.close();
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '60', '-i', `${dir}%04d.png`, '-vf', 'scale=820:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}${TAG}.mp4`]);
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    console.log(`saved ${TAG}.mp4 (${n} frames)`);
    stop();
    process.exit(0);
  }
  await page.evaluate(() => window.__frontier.cast());
  await step(8);
  await shot('1-cast');
  let seen = [];
  for (let i = 0; i < 20 && !seen.includes('projectile'); i++) seen = seen.concat(await step(1));
  await step(9);
  await shot('2-travel');
  seen = [];
  for (let i = 0; i < 90 && !seen.includes('impact'); i++) seen = seen.concat(await step(1));
  if (!seen.includes('impact')) throw new Error('no impact within 1.5 s');
  // the impact unfolds over about a second: flash, burst, fireball, smoke
  const beats = [['3-flash', 2], ['4-burst', 5], ['5-fireball', 14], ['6-smoke', 30]];
  for (const [beat, n] of beats) {
    await step(n);
    await shot(beat);
  }
  await browser.close();
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log(`saved ${TAG}-{1-cast,2-travel,${beats.map((b) => b[0]).join(',')}}.png`);
} finally {
  stop();
}
