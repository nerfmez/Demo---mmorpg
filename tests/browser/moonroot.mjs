// Moonroot Grove: its three monsters' wind-ups and contacts from the game camera, the places
// and the field guide. Screenshots in tests/browser/out/moonroot-<engine>/ for visual review.
// Usage after a build: node tests/browser/moonroot.mjs   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/moonroot-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4217, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const CASES = [
  ['fern_ear_hare', 'kick', 0.4], ['fern_ear_hare', 'hop', 5], ['mirrorwing_moth', 'glint', 5], ['mirrorwing_moth', 'scale_dust', 1],
  ['rootdigger_mole', 'swipe', 0.6], ['rootdigger_mole', 'erupt', 6],
];
const report = { engine: engine.name(), sizes: {}, errors: [] };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__freeze) cb(t); }); });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text() + ' ' + m.location().url); });
  await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0&map=moonroot-grove-v1');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  await page.evaluate(() => {
    const f = window.__frontier;
    document.querySelector('.banner')?.remove();
    f.paused = true; f.input.reset(); f.input.disabled = true; window.__freeze = true;
    f.roster = f.game.monsters.slice();
    f.game.spawnPoints = [];
    f.draw = () => { f.view.render(0, f.game.time, {}); f.view.renderer.getContext().finish(); };
    f.step = (seconds, present = true) => {
      for (let t = 0; t < seconds - 1e-8; t += 1 / 60) {
        f.game.player.hp = f.game.player.maxHp; // poses, not survival
        f.game.update(1 / 60);
        for (const e of f.game.drainEvents()) f.view.handleEvent(e);
        f.view.syncMonsters(1 / 60, f.game.time);
        f.view.vfx.update(1 / 60);
      }
      if (present) f.draw();
    };
    // a closer camera on the monster for detail review; the game camera shots stay the reference
    f.closeUp = (on) => {
      const v = f.view, m = f.current, p = f.game.player;
      if (on) { const d = Math.hypot(p.x - m.x, p.z - m.z) || 1, k = Math.min(1.5, d * 0.25) / d; f.saved = { zoom: v.zoom, t: v.camTarget.clone() }; v.zoom = 0.4; v.camTarget.set(m.x + (p.x - m.x) * k, v.world.groundY(m.x, m.z), m.z + (p.z - m.z) * k); }
      else { v.zoom = f.saved.zoom; v.camTarget.copy(f.saved.t); }
      f.draw();
    };
    f.until = (cond, max = 12) => { for (let t = 0; t < max && !cond(); t += 1 / 60) f.step(1 / 60, false); f.draw(); return cond(); };
  });
  const shot = (name) => page.screenshot({ path: out + name + '.png' });
  for (const [type, attack, gap] of CASES) {
    const ok = await page.evaluate(([type, attack, gap]) => {
      const f = window.__frontier, g = f.game, p = g.player;
      let m = f.roster.find((x) => x.type === type);
      if (!m) return 'no spawn';
      g.monsters = [m];
      // a clear spot in the monster's own zone, facing it from the south-east (camera side)
      let spot = null;
      for (let r = 0; r < 30 && !spot; r += 1.5) for (let a = 0; a < 6.28 && !spot; a += 0.5) {
        const x = m.homeX + Math.sin(a) * r, z = m.homeZ + Math.cos(a) * r;
        let clear = true;
        for (let d = -2; d <= gap + 4; d += 0.4) if (!g.world.isFree(x + d * 0.7, z + d * 0.7, 1.2) || g.isSafe(x + d * 0.7, z + d * 0.7)) { clear = false; break; }
        if (clear) spot = [x, z];
      }
      if (!spot) return 'no clear spot';
      const dist = m.r + p.r + gap;
      Object.assign(m, { x: spot[0], z: spot[1], homeX: spot[0], homeZ: spot[1], hp: m.maxHp, dead: false, state: 'idle', stateT: 0, aggro: false, windup: null, charge: null, melee: null, stealth: false, revealT: 0 });
      for (const k in m.cd) m.cd[k] = k === attack ? 0 : 99;
      // first an unaware monster (the player out of its aggro range), then the player steps in
      const far = m.def.aggroRange + 3;
      Object.assign(p, { x: spot[0] + far * 0.7071, z: spot[1] + far * 0.7071, facing: -2.36, dead: false });
      f.near = [spot[0] + dist * 0.7071, spot[1] + dist * 0.7071];
      f.view.monsterViews.forEach((mv) => f.view.releaseRig(mv.rig)); f.view.monsterViews.clear();
      f.view.snapCamera();
      f.current = m;
      f.step(0.3);
      return 'ok';
    }, [type, attack, gap]);
    assert.equal(ok, 'ok', `${type} ${attack}: ${ok}`);
    await shot(`${type}-${attack}-0-start`);
    await page.evaluate(() => window.__frontier.closeUp(true));
    await shot(`${type}-${attack}-0-start-close`);
    await page.evaluate(() => window.__frontier.closeUp(false));
    // the wind-up at about two thirds, then contact and recovery
    const phases = await page.evaluate((attack) => {
      const f = window.__frontier, m = f.current, seen = [];
      Object.assign(f.game.player, { x: f.near[0], z: f.near[1] }); f.view.snapCamera();
      m.aggro = true; m.state = 'chase';
      f.until(() => m.state === 'windup' && m.windup?.name === attack, 6);
      seen.push(m.windup?.name);
      f.until(() => m.stateT >= m.windup.total * 0.66, 3);
      return seen;
    }, attack);
    assert.deepEqual(phases, [attack], `${type} winds up ${attack}`);
    await shot(`${type}-${attack}-1-windup`);
    await page.evaluate(() => window.__frontier.closeUp(true));
    await shot(`${type}-${attack}-1-windup-close`);
    await page.evaluate(() => window.__frontier.closeUp(false));
    await page.evaluate(() => { const f = window.__frontier, m = f.current; f.until(() => m.state !== 'windup', 3); f.step(m.melee ? m.def.attacks[m.melee.name].hitTime + 0.02 : 0.08); });
    await shot(`${type}-${attack}-2-contact`);
    await page.evaluate(() => window.__frontier.closeUp(true));
    await shot(`${type}-${attack}-2-contact-close`);
    await page.evaluate(() => window.__frontier.closeUp(false));
    await page.evaluate(() => { const f = window.__frontier, m = f.current; f.until(() => m.state === 'recover' || m.state === 'stunned', 4); f.step(0.15); });
    await shot(`${type}-${attack}-3-recover`);
  }
  // the grove from the game camera: camp, pond, stone ring, root warren
  for (const [name, x, z] of [['camp', -108, -2], ['pond', -5, 22], ['ring', 126, 8], ['elder', 126, -1], ['tents', -112, 15], ['warren', -150, 0], ['fern', 160, 10]]) {
    await page.evaluate(([x, z]) => { const f = window.__frontier, g = f.game; g.monsters = f.roster.slice(); Object.assign(g.player, { x, z }); f.view.snapCamera(); f.step(0.5); }, [x, z]);
    await shot('place-' + name);
  }
  // the field guide (world map): each zone lists its monsters with the parts they drop
  for (const zone of ['fern_rise', 'mirror_pond', 'root_warren', 'settlement']) {
    await page.evaluate((zone) => { const f = window.__frontier; f.paused = false; f.game.ch.progress.zones = [...new Set([...(f.game.ch.progress.zones || []), zone])]; f.panels.sel = { ...(f.panels.sel || {}), zone: 'moonroot-grove-v1:' + zone }; f.panels.open('map'); }, zone);
    await page.waitForSelector('.region-cover');
    report.guide = { ...(report.guide || {}), [zone]: await page.locator('.creature-entry b').allInnerTexts() };
    await page.waitForTimeout(400);
    await shot(`guide-${zone}`);
    await page.evaluate(() => { const f = window.__frontier; f.panels.close(); f.paused = true; });
  }
  assert.ok(report.guide.root_warren.includes('ตุ่นขุดราก') && report.guide.fern_rise.includes('กระต่ายหูเฟิร์น'), JSON.stringify(report.guide));
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
    assert.deepEqual(report.errors, []);
  console.log('PASS moonroot', engine.name());
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
