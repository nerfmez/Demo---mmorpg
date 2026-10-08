// Focused review capture for monster locomotion and strike marks (render only).
// Steps the real view at a fixed 60 Hz so SwiftShader timing does not matter:
//  - walk: each monster walks across an open field; frames become a strip and a short GIF
//  - strikes: the real AI attacks the hero; frames right after contact show the mark
// node tests/browser/monster-motion.mjs [type ...]   (BROWSER=webkit for WebKit; CLIP=1 also writes MP4 clips)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/monster-motion/${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const ALL = ['tusk_boar', 'thornback_wolf', 'greyfang', 'salt_slime', 'reef_crab', 'hermit_crab', 'moss_beetle', 'sporecap', 'shore_gull', 'crag_golem', 'horned_warden', 'thicket_mantis', 'ironhorn_ram', 'duskmane_stalker', 'reed_viper'];
const STRIKES = [['thornback_wolf', 'bite'], ['thornback_wolf', 'rend'], ['greyfang', 'rake'], ['tusk_boar', 'bite'], ['duskmane_stalker', 'claw'], ['reef_crab', 'pinch'], ['hermit_crab', 'pinch'], ['thicket_mantis', 'scythe'], ['salt_slime', 'slap']];
const only = process.argv.slice(2);
const walkers = process.env.NOWALK ? [] : only.length ? ALL.filter((t) => only.includes(t)) : ALL;
const strikes = only.length ? STRIKES.filter(([t]) => only.includes(t)) : STRIKES;
const gifs = new Set(['tusk_boar', 'thornback_wolf', 'salt_slime', 'reef_crab', 'duskmane_stalker', 'crag_golem', 'shore_gull', 'sporecap']);
const port = 4291, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const report = { engine: engine.name(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), walks: [], strikes: [], errors: [] };
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i > 80) throw Error('preview server');
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 }, hasTouch: true, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__mmFreeze) cb(t); });
  });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3, null, { timeout: 120000 });
  await page.evaluate(() => {
    const f = window.__frontier, g = f.game;
    f.paused = true; f.input?.reset?.(); if (f.input) f.input.disabled = true;
    window.__mmFreeze = true;
    document.querySelector('.banner')?.remove();
    // review captures show the scene only
    const hide = document.createElement('style');
    hide.textContent = 'body > *:not(canvas):not(#app):not(#game){visibility:hidden!important} canvas{visibility:visible!important}';
    document.head.append(hide);
    g.isSafe = () => false;
    g.spawnPoints = [];
    // an open, flat stretch of the field: try spawn sites until one has 9 m of free ground
    const sites = g.monsters.map((m) => [m.homeX, m.homeZ]);
    let spot = null;
    for (const [x0, z0] of sites) {
      let ok = true;
      for (let d = -5; d <= 5 && ok; d += 0.5) ok = g.world.isFree(x0 + d, z0, 1.2) && g.world.isFree(x0 + d, z0 + 3, 1.2) && Math.abs(g.world.groundY(x0 + d, z0) - g.world.groundY(x0, z0)) < 0.6;
      if (ok) { spot = [x0, z0]; break; }
    }
    if (!spot) spot = [g.player.x, g.player.z];
    f.mmSpot = spot;
    f.mmRender = f.view.render.bind(f.view);
    f.view.render = () => f.mmRender(0, f.game.time, {});
    f.mmStep = (seconds, sim) => {
      for (let t = 0; t < seconds - 1e-8; t += 1 / 60) {
        if (sim) { g.player.hp = g.player.maxHp; g.update(1 / 60); for (const e of g.drainEvents()) { if (e.type === 'monsterSwing') f.mmSwing = (f.mmSwing || 0) + 1; f.view.handleEvent(e); } }
        else g.time += 1 / 60;
        f.view.syncMonsters(1 / 60, g.time);
        f.view.vfx.update(1 / 60);
      }
    };
    f.mmShow = () => { f.mmRender(0, f.game.time, {}); f.view.renderer.getContext().finish(); };
    f.mmClip = (h = 1.4) => {
      const m = f.mmMonster, y = f.view.groundAt(m.x, m.z);
      const a = f.view.project(m.x, y + h * 0.5, m.z);
      return { x: a.x, y: a.y };
    };
  });
  const shot = async (file, clip) => {
    await page.evaluate(() => __frontier.mmShow());
    await page.screenshot({ path: out + file, clip });
  };
  const clipAt = (c, w, h) => ({ x: Math.max(0, Math.min(900 - w, c.x - w / 2)), y: Math.max(0, Math.min(640 - h, c.y - h / 2)), width: w, height: h });

  for (const type of walkers) {
    const info = await page.evaluate((type) => {
      const f = __frontier, g = f.game, [x0, z0] = f.mmSpot;
      const m = g.spawnMinion(type, 5, x0 - 4, z0 + 1.5);
      g.monsters = [m]; g.projectiles = []; g.areas = []; g.allies = [];
      Object.assign(m, { aggro: false, state: 'idle', facing: Math.PI / 2, moving: false });
      f.mmMonster = m;
      for (const [id, mv] of f.view.monsterViews) { f.view.releaseRig(mv.rig); f.view.monsterViews.delete(id); }
      Object.assign(g.player, { x: x0, z: z0 + 4.5 });
      f.view.zoom = type === 'horned_warden' || type === 'crag_golem' ? 0.7 : 0.5; f.view.snapCamera();
      // stand, then walk to the right at the monster's own pace
      f.mmStep(0.6, false);
      return { speed: m.def.speed, r: m.r, h: (f.view.monsterViews.get(m.id)?.rig.height || 1.4) * (f.view.monsterViews.get(m.id)?.rig.baseScale || 1) };
    }, type);
    const frames = [], gif = gifs.has(type);
    const n = gif ? 36 : 8;
    const step = gif ? 1 / 24 : 0.07;
    rmSync(out + `walk-${type}`, { recursive: true, force: true });
    mkdirSync(out + `walk-${type}`, { recursive: true });
    for (let i = 0; i < n; i++) {
      const c = await page.evaluate(([dt, speed]) => {
        const f = __frontier, m = f.mmMonster;
        for (let t = 0; t < dt - 1e-8; t += 1 / 60) {
          m.moving = true; m.state = 'idle';
          m.x += speed / 60;
          // the camera follows the walker (the hero stands just behind the camera's view of it)
          Object.assign(f.game.player, { x: m.x - 2.6, z: m.z + 1.2 });
          f.mmStep(1 / 60, false);
        }
        f.view.snapCamera();
        f.mmShow();
        return f.mmClip(f.view.monsterViews.get(m.id).rig.height * f.view.monsterViews.get(m.id).rig.baseScale);
      }, [step, info.speed * (type === 'thornback_wolf' || type === 'greyfang' || type === 'duskmane_stalker' ? 0.8 : 0.6)]);
      const file = `walk-${type}/${String(i).padStart(2, '0')}.png`;
      await shot(file, clipAt(c, 300, 260));
      frames.push(file);
    }
    const strip = `walk-${type}.png`;
    const pick = gif ? frames.filter((_, i) => i % 4 === 0).slice(0, 8) : frames;
    execFileSync('montage', [...pick.map((f) => out + f), '-tile', `${pick.length}x1`, '-geometry', '+2+2', out + strip]);
    if (gif) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', out + `walk-${type}/%02d.png`, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', out + `walk-${type}.gif`]);
    report.walks.push({ type, strip, gif: gif ? `walk-${type}.gif` : null, ...info });
    console.log('WALK', type);
  }

  for (const [type, attack] of strikes) {
    const res = await page.evaluate(([type, attack]) => {
      const f = __frontier, g = f.game, [x0, z0] = f.mmSpot;
      const m = g.spawnMinion(type, 5, x0, z0);
      g.monsters = [m]; g.projectiles = []; g.areas = []; g.allies = [];
      for (const [id, mv] of f.view.monsterViews) { f.view.releaseRig(mv.rig); f.view.monsterViews.delete(id); }
      f.mmMonster = m;
      const atk = m.def.attacks[attack];
      const gap = Math.max(0.3, (atk.range || 1.5) * 0.6);
      Object.assign(g.player, { x: x0 + m.r + g.player.r + gap, z: z0, hp: g.player.maxHp, dead: false, cast: null });
      Object.assign(m, { facing: Math.PI / 2, aggro: true, state: 'chase', stateT: 0, targetUnit: null });
      for (const k in m.cd) m.cd[k] = k === attack ? 0 : 99;
      f.view.zoom = 0.5; f.view.snapCamera();
      f.mmSwing = 0;
      let t = 0;
      // stop just before the strike moves: late in the wind-up (or as the act begins)
      const near = () => m.state === 'act' || (m.state === 'windup' && m.windup?.name === attack && m.stateT >= m.windup.total - 0.1);
      while (t < 8 && !near()) { f.mmStep(1 / 60, true); t += 1 / 60; for (const k in m.cd) if (k !== attack) m.cd[k] = 99; }
      return { reached: near(), state: m.state, windup: m.windup?.name, t };
    }, [type, attack]);
    assert.ok(res.reached, `${type} ${attack}: strike began (${JSON.stringify(res)})`);
    const frames = [];
    for (const [i, dt] of [0.04, 0.04, 0.04, 0.05, 0.05, 0.08].entries()) {
      const c = await page.evaluate((dt) => { const f = __frontier; f.mmStep(dt, true); f.mmShow(); const p = f.game.player; const a = f.view.project((p.x + f.mmMonster.x) / 2, f.view.groundAt(p.x, p.z) + 0.8, p.z); return { x: a.x, y: a.y }; }, dt);
      const file = `strike-${type}-${attack}-${i}.png`;
      await shot(file, clipAt(c, 340, 300));
      frames.push(file);
    }
    const strip = `strike-${type}-${attack}.png`;
    execFileSync('montage', [...frames.map((f) => out + f), '-tile', `${frames.length}x1`, '-geometry', '+2+2', out + strip]);
    res.swung = await page.evaluate(() => __frontier.mmSwing);
    assert.ok(res.swung, `${type} ${attack}: the strike landed during the capture`);
    report.strikes.push({ type, attack, strip, ...res });
    console.log('STRIKE', type, attack);
    // CLIP=1: a moving clip of the same strike from the start of its wind-up, played at real
    // speed and then at a third of the speed (H.264 MP4, plays on iPad)
    if (process.env.CLIP) {
      const at = await page.evaluate((attack) => {
        const f = __frontier, g = f.game, m = f.mmMonster, p = g.player;
        f.mmStep(1.2, true);
        const atk = m.def.attacks[attack], gap = Math.max(0.3, (atk.range || 1.5) * 0.6);
        Object.assign(m, { x: f.mmSpot[0], z: f.mmSpot[1], facing: Math.PI / 2, state: 'chase', stateT: 0, windup: null, melee: null });
        Object.assign(p, { x: m.x + m.r + p.r + gap, z: m.z, hp: p.maxHp });
        for (const k in m.cd) m.cd[k] = k === attack ? 0 : 99;
        f.view.snapCamera();
        for (let t = 0; t < 8 && !(m.state === 'windup' && m.windup?.name === attack); t += 1 / 60) f.mmStep(1 / 60, true);
        f.mmShow();
        const a = f.view.project((p.x + m.x) / 2, f.view.groundAt(p.x, p.z) + 0.7, p.z);
        return { x: a.x, y: a.y, total: m.windup?.total || 0.6 };
      }, attack);
      const dir = `clip-${type}-${attack}`;
      rmSync(out + dir, { recursive: true, force: true });
      mkdirSync(out + dir, { recursive: true });
      const n = Math.min(75, Math.ceil((at.total + 0.9) * 30));
      for (let i = 0; i < n; i++) {
        if (i) await page.evaluate(() => __frontier.mmStep(1 / 30, true));
        await shot(`${dir}/${String(i).padStart(3, '0')}.png`, clipAt(at, 480, 380));
      }
      const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
      const label = (text) => `drawtext=fontfile=${font}:text='${text}':x=12:y=12:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6`;
      for (const [name, rate, text] of [['real', 30, `${type} ${attack} - real speed`], ['slow', 10, `${type} ${attack} - slow x1/3`]])
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', out + `${dir}/%03d.png`, '-vf', `${label(text)},fps=30,format=yuv420p`, '-c:v', 'libx264', '-crf', '20', out + `${dir}-${name}.mp4`]);
      report.clips = [...(report.clips || []), `${dir}-real.mp4`, `${dir}-slow.mp4`];
    }
  }
  if (process.env.CLIP && report.clips?.length) {
    writeFileSync(out + 'clips.txt', report.clips.map((c) => `file '${out}${c}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', out + 'clips.txt', '-c', 'copy', '-movflags', '+faststart', out + 'strikes.mp4']);
  }
  // marks free their materials: geometry count returns to baseline after the effects expire
  report.geometriesAfter = await page.evaluate(() => { const f = __frontier; f.mmStep(1.5, false); f.mmShow(); return f.view.renderer.info.memory.geometries; });
  assert.deepEqual(report.errors, []);
  report.ok = true;
} finally {
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
