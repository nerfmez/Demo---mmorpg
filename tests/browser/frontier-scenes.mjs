// Greenhollow Frontier's zone scenes in the game: the hero stands at each scene's centre and the game
// camera shows it, for owner review. Screenshots in tests/browser/out/frontier-scenes-<engine>/.
// Usage after a build: node tests/browser/frontier-scenes.mjs [scene ids]   (BROWSER=webkit for iPad)
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/frontier-scenes-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const layout = JSON.parse(readFileSync(new URL('../../data/accepted-scenes.json', import.meta.url), 'utf8')).scenes;
const scenes = layout.map((id) => JSON.parse(readFileSync(new URL(`../../data/accepted-scenes/${id}.json`, import.meta.url), 'utf8'))).filter((s) => s.region === 'frontier-wilds-v1' && s.id !== 'shell-beach');
const only = process.argv.slice(2), list = only.length ? scenes.filter((s) => only.includes(s.id)) : scenes;
const port = 4218, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const report = { engine: engine.name(), shots: [], errors: [] };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(240000);
  await page.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__freeze) cb(t); }); });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text() + ' ' + m.location().url); });
  await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0&map=frontier-wilds-v1');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  await page.evaluate(() => {
    const f = window.__frontier;
    document.querySelector('.banner')?.remove();
    f.paused = true; f.input.reset(); f.input.disabled = true; window.__freeze = true;
    f.game.spawnPoints = []; for (const m of f.game.monsters) m.hp = 0;
    f.draw = () => { f.view.render(0, f.game.time, {}); f.view.renderer.getContext().finish(); };
  });
  for (const s of list) {
    // the hero at the scene's square (its south path's inner end), the game camera on it
    const south = s.roads.find((r) => /\/south$/.test(r.id)), at = south ? south.points.at(-1) : [s.x, s.z];
    for (const [name, dz] of [['', 0], ['-back', -14]]) {
      await page.evaluate(([x, z]) => {
        const f = window.__frontier, p = f.game.player;
        p.x = x; p.z = z; p.y = f.view.world.groundY(x, z);
        for (let i = 0; i < 90; i++) { f.game.update(1 / 60); f.view.render(1 / 60, f.game.time, {}); }
        f.draw();
      }, [at[0], at[1] + dz]);
      const file = `${s.id}${name}.png`;
      await page.screenshot({ path: out + file });
      report.shots.push(file);
    }
  }
} catch (e) { report.errors.push(String(e.stack || e)); }
finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
