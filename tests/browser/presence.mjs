// Build first: VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createPresenceServer } from '../../server/presence.mjs';
import { initialUiReady } from './startup-ready.mjs';
const OUT = new URL('./out/presence/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const web = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
let app, browser;
const start = async () => { app = createPresenceServer({ origins: ['http://127.0.0.1:4173'] }); app.server.listen(3001, '127.0.0.1'); await once(app.server, 'listening'); };
const evidence = [], errors = [];
const ok = s => { console.log(`PASS ${s}`); evidence.push(s); };
try {
  await start();
  for (let i = 0; ; i++) { try { if ((await fetch('http://127.0.0.1:4173')).ok) break; } catch {} if (i > 80) throw Error('preview startup'); await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ac = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bc = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const a = await ac.newPage(), b = await bc.newPage();
  for (const p of [a, b]) { p.setDefaultTimeout(90000); p.on('pageerror', e => errors.push(String(e))); }
  async function boot(p, map = '') {
    console.log('BOOT', map || 'azure');
    if (p === b) await a.evaluate(() => { __frontier.paused = true; __frontier.panels.tab = 'job'; });
    await p.goto(`http://127.0.0.1:4173/?fresh=1&quality=low&stream=0&map=${map}`);
    await p.bringToFront();
    await p.waitForFunction(initialUiReady, null, { timeout: 180000 });
    await p.evaluate(() => __frontier.view.setRenderScale(.5)); // software GPU; retain full-size HUD/touch layout
    if (p === b) await a.evaluate(() => { __frontier.paused = false; __frontier.panels.tab = null; });
    assert.equal(await p.evaluate(() => Object.keys(__frontier.game.ch.skills).length), 1);
    assert.equal(await p.evaluate(() => !!__frontier.presence.client.endpoint), true, 'build needs VITE_PRESENCE_URL');
  }
  async function join(p, room = 'lobby') {
    await p.bringToFront();
    console.log('JOIN drawer', room);
    await p.locator('.presence-panel summary').click();
    console.log('JOIN fill');
    await p.getByRole('textbox', { name: 'Room', exact: true }).fill(room);
    await p.locator('[data-join]').click();
    console.log('JOIN requested');
    await p.waitForFunction(() => __frontier.presence.client.status === 'online');
    console.log('JOIN online');
    await p.locator('.presence-panel summary').click();
  }
  async function count(p, n) { await p.waitForFunction(n => __frontier.presence.actors.actors.size === n, n); }
  await boot(a); ok('desktop startup; only one basic starting skill');
  await join(a); await boot(b); ok('touch startup; only one basic starting skill'); await join(b);
  await count(a, 1); await count(b, 1); ok('two independent browser contexts join same map/room');
  // Move away from overlapping spawn, then use actual keyboard input.
  await b.evaluate(() => { __frontier.game.player.z += 3; });
  await a.waitForTimeout(700);
  await a.bringToFront();
  const before = await a.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  await a.keyboard.down('d'); await a.waitForTimeout(1500); await a.keyboard.up('d');
  const after = await a.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .2);
  await b.bringToFront();
  await b.waitForFunction(p => { const a = [...__frontier.presence.actors.actors.values()][0]; return a && Math.hypot(a.rig.root.position.x - p.x, a.rig.root.position.z - p.z) < .2; }, after);
  ok('keyboard movement reaches the other browser and interpolated actor converges');
  await a.screenshot({ path: `${OUT}desktop-two-players.png`, timeout: 90000 });
  await b.screenshot({ path: `${OUT}ipad-two-players.png`, timeout: 90000 });
  await b.bringToFront();
  const cd = await bc.newCDPSession(b), box = await b.locator('.joyzone').boundingBox();
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  const pos0 = await b.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y }] });
  for (let i = 0; i < 3; i++) { await b.waitForTimeout(200); await a.screenshot({ path: `${OUT}movement-${i}.png`, timeout: 90000 }); }
  await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const pos1 = await b.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  assert.ok(Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z) > .2);
  await a.bringToFront();
  await a.waitForFunction(p => { const a = [...__frontier.presence.actors.actors.values()][0]; return a && Math.hypot(a.rig.root.position.x - p.x, a.rig.root.position.z - p.z) < .2; }, pos1);
  ok('real emulated touch joystick moves and synchronizes to desktop');
  await b.locator('.presence-panel summary').click();
  await b.screenshot({ path: `${OUT}ipad-room-controls.png`, timeout: 90000 });
  await b.locator('[data-leave]').click(); await count(a, 0); await count(b, 0);
  await b.locator('.presence-panel summary').click(); ok('explicit Solo removes remote actors on both clients');
  const samples = [];
  for (let i = 0; i < 3; i++) {
    await join(b); await count(a, 1); await b.waitForTimeout(500);
    await b.locator('.presence-panel summary').click(); await b.locator('[data-leave]').click(); await count(a, 0); await b.locator('.presence-panel summary').click();
    await a.waitForTimeout(300); samples.push(await a.evaluate(() => __frontier.view.renderer.info.memory.geometries));
  }
  assert.ok(Math.max(...samples) - Math.min(...samples) <= 2, `geometry cleanup ${samples}`); ok(`remote join/leave geometry stabilization: ${samples}`);
  await join(b, 'separate'); await count(a, 0); await count(b, 0); ok('different rooms cannot see one another');
  await b.locator('.presence-panel summary').click(); await b.locator('[data-leave]').click(); await b.locator('.presence-panel summary').click();
  await join(b); await count(a, 1);
  const oldId = await a.evaluate(() => __frontier.presence.client.id);
  await app.close(); app = null; await count(a, 0); await count(b, 0);
  assert.equal(await a.evaluate(() => !!__frontier.game && __frontier.game.ch.skills.slash === 1), true);
  await start(); await a.waitForFunction(() => __frontier.presence.client.status === 'online'); await count(a, 1); await count(b, 1);
  assert.notEqual(await a.evaluate(() => __frontier.presence.client.id), oldId); ok('server shutdown clears ghosts; solo remains playable; restart reconnects with new identities');
  await boot(b, 'frontier-wilds-v1'); await join(b); await count(a, 0); await count(b, 0); ok('different game maps remain isolated in the same lobby');
  await b.close(); await count(a, 0); ok('page close leaves no remote actor');
  assert.deepEqual(errors, []); ok('no browser runtime errors');
  writeFileSync(`${OUT}results.json`, JSON.stringify({ evidence, errors, geometrySamples: samples }, null, 2));
} catch (e) { console.error(e); throw e; } finally { await browser?.close(); await app?.close(); web.kill(); }
