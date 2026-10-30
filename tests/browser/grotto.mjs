// Pearlshell Grotto focused capture: goes in from the game's Singing Conch (dungeon.html dressed as
// the game's hero), saves screenshots of every room and the whole-map view, then walks out through
// the pearl gate back to the game beside the conch.
// Usage: npm run build && node tests/browser/grotto.mjs   (BROWSER=webkit for the Safari engine)
// Frames: tests/browser/out/grotto/<n>-<name>.png. Fails on page errors or a broken flow.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { enterFullscreenGate } from './fullscreen-entry.mjs';

const OUT = new URL('./out/grotto/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4193;
const W = Number(process.env.WIDTH || 1180), H = Number(process.env.HEIGHT || 820);
const ONLY = process.argv[2] || null;
// development load: the game prepares only the map it starts on (AGENTS.md, two load modes)
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true, env: { ...process.env, FRONTIER_LOAD: 'dev' } });
const shots = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/dungeon.html`)).ok) break; } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
  page.setDefaultTimeout(180000); // the software renderer draws the game and the cave slowly
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const settle = (ms = 900) => page.waitForTimeout(ms);
  let n = 0;
  const shot = async (name) => {
    if (ONLY && !name.includes(ONLY)) return;
    const path = `${OUT}${String(++n).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path });
    shots.push(path);
  };
  const gameReady = async () => {
    await page.waitForFunction(() => window.__frontier?.game && document.getElementById('loading').classList.contains('done'), null, { timeout: 240000 });
    await enterFullscreenGate(page);
  };
  const grottoReady = async () => {
    await page.waitForFunction(() => window.__grotto && document.getElementById('loading').classList.contains('gone'), null, { timeout: 120000 });
    await page.evaluate(() => window.__grotto.ready());
  };

  // the game: beside the Singing Conch the prompt offers the way in
  let t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?fresh=1`);
  await gameReady();
  console.log(`game ready in ${Date.now() - t0} ms`);
  const conch = await page.evaluate(() => {
    const map = 'frontier-wilds-v1', l = window.__frontier.game.data.maps[map].landmarks.find((x) => x.dungeon);
    return { map, at: l?.at, r: l?.dungeon.r };
  });
  assert.ok(conch.at, `the conch landmark is found: ${JSON.stringify(conch)}`);
  await page.evaluate(({ map, at, r }) => {
    const g = window.__frontier.game;
    g.monsters = [];
    [g.player.x, g.player.z] = g.scenePoint(map, at[0] + r - 1.5, at[1]);
    g.activateRegion(map);
  }, conch);
  // frames are slow under the software renderer: wait for the HUD to draw the prompt
  await page.waitForFunction(() => document.querySelector('.pbtn span'), null, { timeout: 60000 }).catch(() => {});
  const prompt = await page.evaluate(() => document.querySelector('.pbtn span')?.textContent || '');
  assert.ok(prompt.includes('หอยสังข์'), `the conch prompt is offered: "${prompt}"`);
  await shot('conch-prompt');
  t0 = Date.now();
  await Promise.all([page.waitForURL(/dungeon\.html/, { timeout: 30000 }), page.tap('.pbtn')]);
  await grottoReady();
  console.log(`grotto ready in ${Date.now() - t0} ms`);
  assert.ok(await page.evaluate(() => !!window.__grotto.trip?.character), 'the grotto knows the game\'s hero');

  await settle(1000);
  await shot('entrance');

  // where to stand in each area, in concept pixels (data/dungeons/shell-grotto-trace.json), and the facing
  const TRACE = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto-trace.json', import.meta.url), 'utf8'));
  const px = ([x, y]) => [(x - TRACE.origin[0]) * TRACE.scale, (y - TRACE.origin[1]) * TRACE.zScale];
  const rooms = [
    ['coral-steps', [395, 600], 3.0],
    ['hoard', [240, 240], 3.1],
    ['junction', [520, 405], 1.6],
    ['corridor', [760, 420], 1.6],
    ['coral-island', [660, 540], 3.1],
    ['sealed-arch', [676, 345], 3.1],
    ['temple', [1060, 700], 3.1],
    ['temple-altar', [1120, 690], 3.1],
    ['throne-steps', [1160, 400], 3.1],
    ['throne', [1200, 300], 3.1],
  ].map(([name, at, f]) => [name, ...px(at), f]);
  for (const [name, x, z, f] of rooms) {
    await page.evaluate(([x, z, f]) => window.__grotto.go('inside', x, z, f), [x, z, f]);
    await settle();
    await shot(name);
  }
  // the monsters: the fish flop on their sides in the shallows, the slug and the clam idle
  const props = await page.evaluate(() => window.__grotto.maps.inside.def.props.filter((p) => ['pearlFish', 'pearlSlug', 'eyeClam', 'bossSnail'].includes(p.type) || p.talk));
  const first = (type) => props.find((p) => p.type === type);
  for (const [type, dist] of [['pearlFish', 7], ['pearlSlug', 8], ['eyeClam', 8]]) {
    const [x, z] = first(type).at;
    // the hero stands off to one side (go() finds standing room); the camera looks at the monster's own floor
    await page.evaluate(([x, z, d]) => { const g = window.__grotto; g.go('inside', x + 2.5, z + 2.5, 0); g.frame(x, g.maps.inside.surfaceAt(x, z)?.y ?? 0, z, d, 42); }, [x, z, dist]);
    await settle(1200);
    await shot(`monster-${type}`);
  }
  // the boss sleeps in its shell until the hero talks to the pearl on the throne behind it
  const boss = first('bossSnail'), pearl = props.find((p) => p.talk);
  // the game camera, pulled back: the review camera from this far sees the cave's dark shell, not the room
  await page.evaluate(() => { window.__grotto.frame(); window.__grotto.zoom(1.5); });
  await page.evaluate(([x, z]) => window.__grotto.go('inside', x, z, Math.PI), [boss.at[0], boss.at[1] + 8.5]);
  await settle(1200);
  await shot('boss-asleep');
  assert.equal(await page.evaluate(() => window.__grotto.views.inside.boss?.awake), false, 'the boss sleeps');
  const spot = await page.evaluate((p) => {
    const m = window.__grotto.maps.inside;
    for (let k = 0; k < 48; k++) {
      const t = (k / 48) * Math.PI * 2, x = p.at[0] + Math.cos(t) * (p.talk.r - 0.4), z = p.at[1] + Math.sin(t) * (p.talk.r - 0.4);
      if (Number.isFinite(m.landY(x, z)) && !m.blockedAt(x, z)) return [x, z, Math.atan2(p.at[0] - x, p.at[1] - z)];
    }
    return null;
  }, pearl);
  assert.ok(spot, 'a spot beside the pearl');
  await page.evaluate(([x, z, f]) => window.__grotto.go('inside', x, z, f), spot);
  await page.waitForFunction((l) => document.getElementById('action').textContent === l, pearl.talk.labelTh, { timeout: 30000 }).catch(() => {});
  await settle(300);
  const label = await page.evaluate(() => document.getElementById('action').textContent);
  assert.equal(label, pearl.talk.labelTh, 'the pearl offers to talk');
  await shot('pearl-talk');
  await page.tap('#action');
  await settle(700);
  await shot('boss-waking');
  await page.waitForFunction(() => window.__grotto.views.inside.boss.awake, null, { timeout: 5000 });
  await settle(2600);
  await shot('boss-awake');
  const still = await page.evaluate((l) => { const b = document.getElementById('action'); return b.classList.contains('show') && b.textContent === l; }, pearl.talk.labelTh);
  assert.ok(!still, 'the pearl has said its piece');
  await page.evaluate(([x, z]) => window.__grotto.go('inside', x, z, Math.PI), [boss.at[0], boss.at[1] + 8.5]);
  await settle(1200);
  await shot('boss-awake-front');
  await page.evaluate(() => window.__grotto.zoom(0.8));

  await page.evaluate(() => window.__grotto.overview(true));
  await settle(1200);
  await shot('overview');
  await page.evaluate(() => window.__grotto.overview(false));

  // the pearl gate: tap its button beside it and the game comes back with the hero by the conch
  const gate = await page.evaluate(() => window.__grotto.maps.inside.def.links.find((l) => l.to === 'game'));
  await page.evaluate(([x, z]) => window.__grotto.go('inside', x, z, -Math.PI / 2), [gate.at[0] + gate.r + 1.2, gate.at[1]]);
  await settle();
  await shot('pearl-gate');
  t0 = Date.now();
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith('dungeon.html'), { timeout: 60000, waitUntil: 'commit' }), page.tap('#action')]);
  await gameReady();
  console.log(`back in the game in ${Date.now() - t0} ms`);
  const back = await page.evaluate(({ map, at }) => {
    const g = window.__frontier.game, [x, z] = g.scenePoint(map, at[0], at[1]);
    return { d: Math.hypot(g.player.x - x, g.player.z - z), near: g.nearby().dungeon };
  }, conch);
  assert.ok(back.d < conch.r && back.near === 'shell-grotto', `back beside the conch: ${JSON.stringify(back)}`);
  await settle(1200);
  await shot('back-at-conch');
  assert.deepEqual(errors, [], 'no page errors');
  await browser.close();
  console.log(`saved ${shots.length} frames to ${OUT}`);
} finally {
  try { process.kill(-server.pid); } catch {}
}
