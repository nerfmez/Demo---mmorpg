// Pearlshell Grotto monster clips for owner review: the pearl fish flopping along, the slug crawling,
// the clam hopping and the boss woken at the pearl crawling off, as an mp4 at real speed. The page draws frame by frame at a fixed step
// (window.__grotto.step), so the clip plays smoothly however slowly the software renderer draws.
// Usage: npm run build && node tests/browser/grotto-video.mjs   (needs ffmpeg)
// Writes tests/browser/out/grotto-video/grotto-monsters.mp4.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = new URL('./out/grotto-video/', import.meta.url).pathname;
const FRAMES = `${OUT}frames/`;
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const PORT = 4196, FPS = 24, W = 960, H = 640;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/dungeon.html`)).ok) break; } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/dungeon.html`);
  await page.waitForFunction(() => window.__grotto && document.getElementById('loading').classList.contains('gone'));
  await page.evaluate(() => window.__grotto.ready());
  let n = 0;
  // follow: the walker (dungeon-monsters.js) to keep in the middle of the review camera, or null
  const record = async (seconds, follow = null, dist = 6) => {
    for (let i = 0; i < seconds * FPS; i++) {
      await page.evaluate(([dt, k, d]) => {
        const g = window.__grotto;
        if (k !== null) { const m = g.walkers.list[k]; g.frame(m.x, m.y, m.z, d, 40); }
        g.step(dt);
      }, [1 / FPS, follow, dist]);
      await page.screenshot({ path: `${FRAMES}${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    }
  };
  const settle = () => page.evaluate((dt) => { for (let i = 0; i < 15; i++) window.__grotto.step(dt); }, 1 / FPS);
  const list = await page.evaluate(() => window.__grotto.walkers.list.map((m) => ({ type: m.type, at: [m.x, m.z] })));
  const index = (type) => list.findIndex((m) => m.type === type);
  // each small one walks (its rest cut short) on the review camera that follows it; the hero off to one side
  for (const [type, dist, seconds] of [['pearlFish', 5, 4], ['pearlSlug', 6, 4], ['eyeClam', 6, 5]]) {
    const k = index(type), [x, z] = list[k].at;
    await page.evaluate(([x, z, k]) => { const g = window.__grotto; g.go('inside', x + 4, z + 3, -2.2); g.walkers.list[k].timer = 0; }, [x, z, k]);
    await record(seconds, k, dist);
  }
  // the boss on the game camera: asleep, the hero talks to the pearl, the shell shakes, it comes out and crawls off
  const pearl = await page.evaluate(() => window.__grotto.maps.inside.def.props.find((p) => p.talk));
  await page.evaluate(([x, z]) => { const g = window.__grotto; g.frame(); g.zoom(1.5); g.go('inside', x + 3, z, -1.57); }, pearl.at);
  await settle();
  await record(2);
  await page.evaluate(() => document.getElementById('action').click());
  await record(10);
  await browser.close();
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', `${OUT}grotto-monsters.mp4`]);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log(`${n} frames -> ${OUT}grotto-monsters.mp4`);
} finally {
  try { process.kill(-server.pid); } catch {}
}
