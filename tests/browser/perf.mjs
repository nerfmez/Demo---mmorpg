import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], { cwd: '/home/user/demo---mmorpg', stdio: 'ignore', detached: true });
await new Promise(r => setTimeout(r, 3000));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:4179/?fresh=1&seed=5&quality=medium');
await page.waitForFunction(() => window.__frontier && window.__frontier.game.time > 0.5, null, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { game, input, view } = window.__frontier;
  input.disabled = true;
  const times = [];
  let last = performance.now();
  let run = true;
  const tick = (t) => { times.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const p = game.player; p.x = -52; p.z = 5;
  await new Promise(r => setTimeout(r, 3000));
  const walk = [...times]; times.length = 0;
  const near = game.monsters.filter(m => !m.dead && !m.boss && m.x > -60 && m.x < -20)[0];
  p.x = near.x - 4; p.z = near.z;
  for (let i = 0; i < 30; i++) { game.setAimPoint(near.x, near.z); game.castSlot(1); game.castSlot(0); await new Promise(r => setTimeout(r, 100)); }
  run = false;
  const stat = (a) => ({ n: a.length, avg: (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0), max: Math.max(...a).toFixed(0), top: a.slice().sort((x,y)=>y-x).slice(0,5).map(v=>v.toFixed(0)).join(',') });
  return { walk: stat(walk), fight: stat(times), calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, programs: view.renderer.info.programs.length };
});
console.log(JSON.stringify(r, null, 1));
await browser.close(); process.kill(-server.pid);
