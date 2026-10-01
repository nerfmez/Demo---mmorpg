// Skill Lab smoke + quick look: opens lab.html, casts the skill and saves a few frames.
// Usage: npm run build && node tests/browser/lab.mjs [skill]   (BROWSER=webkit for WebKit)
// Frames: tests/browser/out/lab-<skill>-<n>.png. Fails on page errors or if nothing hits.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const SKILL = process.argv[2] || 'firebolt';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4185;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/lab.html`)).ok) break;
    } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/lab.html?skill=${SKILL}`);
  await page.waitForFunction(() => window.__lab, null, { timeout: 30000 });
  console.log(`lab ready in ${Date.now() - t0} ms`);
  // freeze the live loop and step it by hand so the frames are repeatable
  const hits = await page.evaluate(() => {
    const L = window.__lab;
    L.state.paused = true;
    let hit = 0;
    const orig = L.vfx.impact.bind(L.vfx);
    L.vfx.impact = (e) => {
      hit++;
      orig(e);
    };
    L.cast();
    window.__hits = () => hit;
    return hit;
  });
  const marks = [[12, 'cast'], [14, 'travel'], [8, 'impact'], [14, 'fireball'], [40, 'smoke']];
  let n = 0;
  for (const [frames, name] of marks) {
    await page.evaluate((k) => {
      for (let i = 0; i < k; i++) window.__lab.step(1 / 60);
    }, frames);
    await page.screenshot({ path: `${OUT}lab-${SKILL}-${++n}-${name}.png` });
  }
  const hit = await page.evaluate(() => window.__hits());
  await browser.close();
  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  if (hits !== 0 || hit < 1) throw new Error(`expected an impact, got ${hit}`);
  console.log(`ok: ${hit} impact(s), frames lab-${SKILL}-*.png`);
} finally {
  try {
    process.kill(-server.pid);
  } catch {}
}
