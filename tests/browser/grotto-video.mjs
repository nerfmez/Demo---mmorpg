// Pearlshell Grotto monster clips for owner review: the flopping pearl fish, the slug, the clam and
// the boss woken at the pearl, as an mp4 at real speed. The page draws frame by frame at a fixed step
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
  const record = async (seconds) => {
    for (let i = 0; i < seconds * FPS; i++) {
      await page.evaluate((dt) => window.__grotto.step(dt), 1 / FPS);
      await page.screenshot({ path: `${FRAMES}${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    }
  };
  const settle = () => page.evaluate((dt) => { for (let i = 0; i < 15; i++) window.__grotto.step(dt); }, 1 / FPS);
  const props = await page.evaluate(() => window.__grotto.maps.inside.def.props.filter((p) => ['pearlFish', 'pearlSlug', 'eyeClam', 'bossSnail'].includes(p.type) || p.talk));
  const first = (type) => props.find((p) => p.type === type);
  // close views of the small ones on the review camera, the hero off to one side
  for (const [type, dist, seconds] of [['pearlFish', 5, 6], ['pearlSlug', 6, 3], ['eyeClam', 6, 3]]) {
    const [x, z] = first(type).at;
    await page.evaluate(([x, z, d]) => { const g = window.__grotto; g.go('inside', x + 2.5, z + 2, -2.2); g.frame(x, g.maps.inside.surfaceAt(x, z)?.y ?? 0, z, d, 40); }, [x, z, dist]);
    await settle();
    await record(seconds);
  }
  // the boss on the game camera: asleep, the hero talks to the pearl, the shell shakes and it comes out
  const pearl = props.find((p) => p.talk);
  await page.evaluate(([x, z]) => { const g = window.__grotto; g.frame(); g.zoom(1.3); g.go('inside', x + 3, z, -1.57); }, pearl.at);
  await settle();
  await record(2);
  await page.evaluate(() => document.getElementById('action').click());
  await record(7);
  await browser.close();
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', `${OUT}grotto-monsters.mp4`]);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log(`${n} frames -> ${OUT}grotto-monsters.mp4`);
} finally {
  try { process.kill(-server.pid); } catch {}
}
