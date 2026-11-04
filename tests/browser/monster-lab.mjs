// The monster sandbox (?fresh=1&monsterLab=<type>, src/ui/monster-lab.js) in the real game: for each of the
// monster's attacks, frames from the game camera stepped 1/30 s at a time from the wind-up to the recovery.
// Usage after a build: node tests/browser/monster-lab.mjs leaf_fox [attack...]   (BROWSER=webkit for iPad)
// Frames in tests/browser/out/monster-lab/<type>/<attack>/ and report.json.
// VIDEO=1 (the owner reviews every round as a video, 2026-11-03): every 1/30 s step is a frame, from a moment
// before the wind-up to a moment after the recovery, encoded with ffmpeg into <type>/<attack>.mp4 and
// <type>/<type>.mp4 (each attack at normal speed, then again at half speed).
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const VIDEO = !!process.env.VIDEO, EVERY = VIDEO ? 1 : Number(process.env.EVERY || 3);
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
  const page = await (await browser.newContext({ viewport: VIDEO ? { width: 1024, height: 640 } : { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text()); });
  await page.goto(`${base}?fresh=1&seed=9&quality=low&load=dev&monsterLab=${type}`);
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.monsterLab && window.__frontier.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  // one game frame per step: the game's loop asked for this frame before we did, so it runs (and takes the step) first
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const attacks = await page.evaluate(() => Object.keys(window.__frontier.monsterLab.lab.m.def.attacks));
  // closer than the game camera for detail (ZOOM=1 keeps the game camera); the camera frames hero and monster
  await page.evaluate((z) => { window.__frontier.view.zoom = z; }, Number(process.env.ZOOM || 0.72));
  for (const attack of attacks.filter((a) => !only.length || only.includes(a))) {
    const dir = `${out}${attack}/`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await page.evaluate((attack) => { const L = window.__frontier.monsterLab.lab; L.attack = attack; L.cool = 0; L.paused = true; L.step = false; }, attack);
    // step until this attack winds up (a video keeps the last 12 frames before it)
    const lead = [];
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => { window.__frontier.monsterLab.lab.step = true; });
      await frame();
      if (await page.evaluate((a) => { const m = window.__frontier.monsterLab.lab.m; return m.state === 'windup' && m.windup?.name === a; }, attack)) break;
      if (VIDEO && i >= 10) { lead.push(await page.screenshot({ type: 'jpeg', quality: 85 })); if (lead.length > 12) lead.shift(); }
    }
    let n = 0;
    const save = (buf) => writeFileSync(`${dir}${String(n++).padStart(3, '0')}.jpg`, buf);
    for (const b of lead) save(b);
    const states = [];
    for (let i = 0, after = 0, cap = Number(process.env.MAXSTEPS || 180); i < cap; i++) {
      const s = await page.evaluate(() => { const m = window.__frontier.monsterLab.lab.m; return { state: m.state, t: +m.stateT.toFixed(3) }; });
      if (i % EVERY === 0) { states.push({ n, ...s }); save(await page.screenshot({ type: 'jpeg', quality: VIDEO ? 85 : 82 })); }
      if (i > 4 && (s.state === 'chase' || s.state === 'idle') && ++after > (VIDEO ? 10 : 0)) break;
      await page.evaluate(() => { window.__frontier.monsterLab.lab.step = true; });
      await frame();
    }
    report.attacks[attack] = states;
    // an attack that never wound up is reported at the end; the others still make their video
    if (!states.some((s) => s.state === 'windup')) { (report.missing ||= []).push(attack); delete report.attacks[attack]; }
  }
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  if (VIDEO) {
    const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); assert.equal(r.status, 0, 'ffmpeg'); };
    const names = Object.keys(report.attacks);
    for (const a of names) ff(['-framerate', '30', '-i', `${out}${a}/%03d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', `${out}${a}.mp4`]);
    // every attack at normal speed, then again at half speed
    const inputs = names.flatMap((a) => ['-i', `${out}${a}.mp4`]);
    const parts = names.map((a, i) => `[${i}:v]split[n${i}][s${i}];[s${i}]setpts=2*PTS[h${i}]`).join(';');
    const order = names.map((a, i) => `[n${i}][h${i}]`).join('');
    ff([...inputs, '-filter_complex', `${parts};${order}concat=n=${names.length * 2}:v=1:a=0[v]`, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', `${out}${type}.mp4`]);
    console.log('video', `${out}${type}.mp4`);
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.missing || [], [], 'every attack wound up');
  console.log('PASS monster lab', type, Object.fromEntries(Object.entries(report.attacks).map(([k, v]) => [k, v.length])));
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
