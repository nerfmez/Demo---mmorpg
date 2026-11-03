// The monster sandbox (?fresh=1&monsterLab=<type>, src/ui/monster-lab.js) in the real game: for each of the
// monster's attacks, frames from the game camera stepped 1/30 s at a time from the wind-up to the recovery.
// Usage after a build: node tests/browser/monster-lab.mjs leaf_fox [attack...]   (BROWSER=webkit for iPad)
// Frames in tests/browser/out/monster-lab/<type>/<attack>/ and report.json.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const [type = 'leaf_fox', ...only] = process.argv.slice(2);
const out = new URL(`./out/monster-lab/${type}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4233, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const report = { engine: engine.name(), type, attacks: {}, errors: [] };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text()); });
  await page.goto(`${base}?fresh=1&seed=9&quality=low&load=dev&monsterLab=${type}`);
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.monsterLab && window.__frontier.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const attacks = await page.evaluate(() => Object.keys(window.__frontier.monsterLab.lab.m.def.attacks));
  // closer than the game camera for detail (ZOOM=1 keeps the game camera); the camera frames hero and monster
  await page.evaluate((z) => { window.__frontier.view.zoom = z; }, Number(process.env.ZOOM || 0.72));
  for (const attack of attacks.filter((a) => !only.length || only.includes(a))) {
    const dir = `${out}${attack}/`;
    mkdirSync(dir, { recursive: true });
    await page.evaluate((attack) => { const L = window.__frontier.monsterLab.lab; L.attack = attack; L.cool = 0; L.paused = true; L.step = false; }, attack);
    // step until this attack winds up
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => { window.__frontier.monsterLab.lab.step = true; });
      await frame();
      if (await page.evaluate((a) => { const m = window.__frontier.monsterLab.lab.m; return m.state === 'windup' && m.windup?.name === a; }, attack)) break;
    }
    const states = [];
    for (let i = 0, n = 0; i < 150; i++) {
      const s = await page.evaluate(() => { const m = window.__frontier.monsterLab.lab.m; return { state: m.state, t: +m.stateT.toFixed(3) }; });
      if (i % Number(process.env.EVERY || 3) === 0) { await page.screenshot({ path: `${dir}${String(n).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 82 }); states.push({ n, ...s }); n++; }
      if (i > 4 && (s.state === 'chase' || s.state === 'idle')) break;
      await page.evaluate(() => { window.__frontier.monsterLab.lab.step = true; });
      await frame();
    }
    report.attacks[attack] = states;
    assert.ok(states.some((s) => s.state === 'windup'), `${attack}: winds up`);
  }
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, []);
  console.log('PASS monster lab', type, Object.fromEntries(Object.entries(report.attacks).map(([k, v]) => [k, v.length])));
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
