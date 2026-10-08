// Mid/high monsters in the real Frontier map, from the game camera: idle, wind-up, contact and
// recovery for each new monster (fixed simulation steps, so software GPUs capture the same
// frames), plus a close view and a size check against the hero. Screenshots for review.
// Usage after a build: node tests/browser/midhigh-monsters.mjs   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/midhigh-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4215, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const CASES = [
  ['thicket_mantis', 'scythe', 0.6], ['thicket_mantis', 'whirl', 0.6], ['reed_viper', 'lash', 2.5], ['reed_viper', 'venom', 6],
  ['ironhorn_ram', 'shove', 1.5], ['thornback_wolf', 'rend', 1.2], ['greyfang', 'rake', 1.5], ['horned_warden', 'quake', 7], ['ironhorn_ram', 'stomp', 0.3], ['duskmane_stalker', 'pounce', 5],
  ['duskmane_stalker', 'claw', 0.4], ['rune_sentinel', 'beam', 6], ['rune_sentinel', 'shards', 0.3],
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
  await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0&map=frontier-wilds-v1');
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
      if (!m) { m = g.spawnMinion(type, 14, p.x, p.z); f.roster.push(m); } // not native to this map: borrow one
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
    await page.evaluate(() => { const f = window.__frontier, m = f.current; f.until(() => m.state !== 'windup', 3); const atk = m.melee && m.def.attacks[m.melee.name]; f.step(atk ? (atk.hits?.[0].at ?? atk.hitTime) + 0.02 : 0.08); });
    await shot(`${type}-${attack}-2-contact`);
    await page.evaluate(() => window.__frontier.closeUp(true));
    await shot(`${type}-${attack}-2-contact-close`);
    await page.evaluate(() => window.__frontier.closeUp(false));
    const contacts = await page.evaluate(() => window.__frontier.current.melee && window.__frontier.current.def.attacks[window.__frontier.current.melee.name].hits?.map(h => h.at) || []);
    for (let i = 1; i < contacts.length; i++) {
      await page.evaluate(at => { const f = window.__frontier; f.step(Math.max(0, at + 0.02 - f.current.stateT)); }, contacts[i]);
      await page.evaluate(() => window.__frontier.closeUp(true));
      await shot(`${type}-${attack}-2-contact-${i + 1}-close`);
      await page.evaluate(() => window.__frontier.closeUp(false));
    }
    await page.evaluate(() => { const f = window.__frontier, m = f.current; f.until(() => m.state === 'recover' || m.state === 'stunned', 4); f.step(0.15); });
    await shot(`${type}-${attack}-3-recover`);
    if (type === 'duskmane_stalker' && attack === 'claw') {
      // after the strike it backs off and circles half-seen until its next attack
      const fade = await page.evaluate(() => { const f = window.__frontier, m = f.current; for (const k in m.cd) m.cd[k] = 4; f.until(() => m.stealth, 4); f.step(0.8); return [m.stealth, (() => { const rig = f.view.monsterViews.get(m.id)?.rig; return (rig?.modelMaterial || rig?.material)?.opacity; })()]; });
      assert.equal(fade[0], true, 'the stalker circles in stealth');
      assert.ok(fade[1] < 0.6, 'and is drawn half-seen');
      await shot(`${type}-4-stalk`);
      await page.evaluate(() => window.__frontier.closeUp(true));
      await shot(`${type}-4-stalk-close`);
      await page.evaluate(() => window.__frontier.closeUp(false));
    }
  }
  // size against the hero: world-space height of each rig at its spawn level
  report.sizes = await page.evaluate(() => {
    const f = window.__frontier, out = {}, THREE = f.view.scene.constructor;
    for (const [type, mv] of f.view.monsterViews) out[type] = mv.rig.height;
    const box = (o) => { o.updateMatrixWorld(true); const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]; o.traverse((c) => { if (!c.isMesh || !c.geometry) return; c.geometry.computeBoundingBox(); const b = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld); for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) { min[i] = Math.min(min[i], b.min[k]); max[i] = Math.max(max[i], b.max[k]); } }); return max.map((v, i) => Math.round((v - min[i]) * 100) / 100); };
    const res = { hero: box(f.view.hero.root) };
    for (const type of ['thicket_mantis', 'reed_viper', 'ironhorn_ram', 'duskmane_stalker', 'rune_sentinel']) { const m = f.roster.find((x) => x.type === type); const rig = f.view.takeRig(type, m.level, false); rig.root.position.set(0, -500, 0); f.view.scene.add(rig.root); res[type] = { level: m.level, size: box(rig.root) }; f.view.releaseRig(rig); }
    // triangles per rig (an outline hull shares its body's geometry): the new monsters stay inside the regular monster budget
    const tris = (type) => { const rig = f.view.takeRig(type, 10, false); let n = 0; const seen = new Set(); rig.root.traverse((c) => { if (c.isMesh && c.geometry && !seen.has(c.geometry)) seen.add(c.geometry), n += (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3; }); f.view.releaseRig(rig); return Math.round(n); };
    res.triangles = Object.fromEntries(['thornback_wolf', 'crag_golem', 'thicket_mantis', 'reed_viper', 'ironhorn_ram', 'duskmane_stalker', 'rune_sentinel'].map((t) => [t, tris(t)]));
    return res;
  });
  for (const t of ['thicket_mantis', 'reed_viper', 'ironhorn_ram', 'duskmane_stalker', 'rune_sentinel']) assert.ok(report.sizes.triangles[t] <= 5000, t + ' triangle budget');
  // the field guide (world map): each zone lists its monsters with the parts they drop
  for (const zone of ['wolf_den', 'wetland', 'highlands', 'ruins']) {
    await page.evaluate((zone) => { const f = window.__frontier; f.paused = false; f.game.ch.progress.zones = [...new Set([...(f.game.ch.progress.zones || []), zone])]; f.panels.sel = { ...(f.panels.sel || {}), zone: 'frontier-wilds-v1:' + zone }; f.panels.open('map'); }, zone);
    await page.waitForSelector('.creature-entry');
    const names = await page.locator('.creature-entry b').allInnerTexts();
    report.guide = { ...(report.guide || {}), [zone]: names };
    await page.locator('.creature-entry').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(`guide-${zone}`);
  }
  assert.ok(report.guide.ruins.includes('ทหารยามศิลารูน') && report.guide.highlands.includes('แพะผาเขาเหล็ก'), JSON.stringify(report.guide));
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.sizes));
  assert.deepEqual(report.errors, []);
  console.log('PASS midhigh monsters', engine.name());
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
