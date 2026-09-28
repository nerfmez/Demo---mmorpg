// CPU cost per frame of the simulation, renderer submission and HUD (not GPU time), in a busy fight.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4184;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} if (i > 60) throw new Error('server'); await new Promise((r) => setTimeout(r, 300)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
await page.goto(`http://localhost:${PORT}/?fresh=1&seed=3&quality=low`);
await page.waitForFunction(() => window.__frontier?.game?.time > 0.5, null, { timeout: 60000 });
const r = await page.evaluate(async () => {
  const { game, view, hud, input } = window.__frontier;
  input.disabled = true;
  const t = { game: [], render: [], hud: [], sync: [] };
  const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const out = f(...a); t[key].push(performance.now() - s); return out; }; };
  wrap(game, 'update', 'game'); wrap(hud, 'update', 'hud'); wrap(view, 'syncMonsters', 'sync');
  const R = view.renderer; const rr = R.render.bind(R); let inRender = 0;
  wrap(view, 'render', 'render');
  const p = game.player; const s0 = game.freeSpotNear(-60, -60); p.x = s0.x; p.z = s0.z; // forest
  for (const m of game.monsters.filter((m) => m.zone === 'forest').slice(0, 12)) { m.x = p.x + (Math.random() - 0.5) * 10; m.z = p.z + (Math.random() - 0.5) * 10; m.aggro = true; }
  for (let i = 0; i < 60; i++) { p.hp = p.maxHp; p.mp = p.maxMp; const m = game.target; if (m) game.setAimPoint(m.x, m.z); for (let k = 0; k < 3; k++) { p.cooldowns[k] = 0; game.castSlot(k); } await new Promise((res) => setTimeout(res, 60)); }
  const st = (a) => { a = a.slice(5).sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), max: +a[a.length - 1].toFixed(2) }; };
  return { game: st(t.game), syncMonsters: st(t.sync), renderTotal: st(t.render), hud: st(t.hud), monsters: game.monsters.length };
});
console.log(JSON.stringify(r));
await browser.close(); process.kill(-server.pid);
