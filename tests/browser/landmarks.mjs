// Zone landmarks: every drawn landmark from the game camera (the player at its foot on the road
// side) and a closer framing, plus the world-map landmark card. Screenshots in
// tests/browser/out/landmarks-<engine>/ for visual review.
// Usage after a build: node tests/browser/landmarks.mjs [landmark ids...]   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadData } from '../../src/core/data-node.js';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/landmarks-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const data = loadData();
const port = 4219, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const report = { engine: engine.name(), shots: [], errors: [] };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(180000);
  await page.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__freeze) cb(t); }); });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text() + ' ' + m.location().url); });
  const shot = (name) => { report.shots.push(name); return page.screenshot({ path: out + name + '.png' }); };
  for (const [mapId, map] of Object.entries(data.maps)) {
    const list = map.landmarks.filter((l) => !l.builtin && (!only.length || only.includes(l.id)));
    if (!list.length) continue;
    await page.goto(base + `?fresh=1&seed=9&quality=low&stream=0&map=${mapId}`);
    await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
    await page.evaluate(() => {
      const f = window.__frontier;
      document.querySelector('.banner')?.remove();
      f.paused = true; f.input.reset(); f.input.disabled = true; window.__freeze = true;
      f.game.monsters = []; f.game.spawnPoints = [];
      f.draw = () => { f.view.render(1 / 60, f.game.time, {}); f.view.renderer.getContext().finish(); };
    });
    for (const lm of list) {
      const placed = await page.evaluate((id) => {
        const f = window.__frontier, w = f.game.world, lm = w.landmarks.find((l) => l.id === id), p = f.game.player;
        // stand beside it (east or west, then the camera side) so its full height stays in view
        let at = null;
        for (let d = lm.clear + 1.5; d < lm.clear + 9 && !at; d += 0.5) for (const da of [1.57, -1.57, 1.1, -1.1, 0.6, -0.6, 0]) {
          const a = da, x = lm.x + Math.sin(a) * d, z = lm.z + Math.cos(a) * d;
          if (w.isFree(x, z, 0.5) && !w.isWater(x, z)) { at = [x, z]; break; }
        }
        if (!at) return null;
        Object.assign(p, { x: at[0], z: at[1], facing: Math.atan2(lm.x - at[0], lm.z - at[1]) });
        f.view.zoom = 1; f.view.snapCamera(); f.draw(); f.draw();
        return at;
      }, lm.id);
      assert.ok(placed, `${lm.id}: a free spot in front of it`);
      await shot(`${lm.id}-game`);
      await page.evaluate((id) => {
        const f = window.__frontier, w = f.game.world, lm = w.landmarks.find((l) => l.id === id), v = f.view;
        v.zoom = 0.8; v.camTarget.set(lm.x, w.groundY(lm.x, lm.z) + 2.5, lm.z); f.draw(); f.draw();
        v.zoom = 1;
      }, lm.id);
      await shot(`${lm.id}-close`);
    }
    // the world map lists the zone's landmark
    const first = list[0];
    await page.evaluate(([mapId, zone]) => { const f = window.__frontier; f.paused = false; f.game.ch.progress.zones = [...new Set([...(f.game.ch.progress.zones || []), zone])]; f.panels.sel = { ...(f.panels.sel || {}), zone: mapId + ':' + zone }; f.panels.open('map'); }, [mapId, first.zone]);
    await page.waitForSelector(`[data-landmark="${first.id}"]`);
    await page.waitForTimeout(400);
    await shot(`map-${mapId}`);
    await page.evaluate(() => { const f = window.__frontier; f.panels.close(); f.paused = true; });
  }
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, []);
  console.log('PASS landmarks', engine.name(), report.shots.length, 'shots');
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
