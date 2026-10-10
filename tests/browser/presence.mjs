// Local build: VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build
// Hosted build: npm run build -- --mode presence; PRESENCE_TEST_URL=wss://.../presence npm run test:presence
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createPresenceServer } from '../../server/presence.mjs';
import { initialUiReady } from './startup-ready.mjs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';
const hosted = !!process.env.PRESENCE_TEST_URL;
const endpoint = process.env.PRESENCE_TEST_URL || 'ws://127.0.0.1:3001/presence';
const origin = 'http://127.0.0.1:4173';
const MOONROOT = 'moonroot-grove-v1';
const OUT = new URL(`./out/presence${hosted ? '-hosted' : '-integration'}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const web = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
let app, browser;
const start = async () => { app = createPresenceServer({ origins: [origin] }); app.server.listen(3001, '127.0.0.1'); await once(app.server, 'listening'); };
const evidence = [], errors = [];
const ok = s => { console.log(`PASS ${s}`); evidence.push(s); };
try {
  if (!hosted) await start();
  for (let i = 0; ; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i > 80) throw Error('preview startup'); await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ac = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bc = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const a = await ac.newPage(), b = await bc.newPage();
  for (const p of [a, b]) { p.setDefaultTimeout(90000); p.on('pageerror', e => errors.push(String(e))); }
  const activate = (p, selector) => p === b ? p.locator(selector).tap() : p.locator(selector).click();
  async function boot(p, map = MOONROOT) {
    console.log('BOOT', map || 'azure');
    const other = p === a ? b : a;
    if (await other.evaluate(() => !!window.__frontier?.game)) await other.evaluate(() => { __frontier.paused = true; __frontier.panels.tab = 'job'; });
    await p.goto(`${origin}/?fresh=1&quality=low&stream=0&map=${map}${p === b ? '&kit=bow' : ''}`);
    await p.bringToFront();
    await p.waitForFunction(() => !!window.__frontier?.view);
    await p.evaluate(() => __frontier.view.setRenderScale(.5)); // software GPU; retain full-size HUD/touch layout, including startup
    try { await p.waitForFunction(initialUiReady, null, { timeout: 180000 }); }
    catch (e) {
      console.error('STARTUP diagnostic', await p.evaluate(() => {
        const f = window.__frontier, r = f?.view?.region;
        return { time: f?.game?.time, modelsReady: f?.modelsReady, paused: f?.paused, fullscreen: f?.fullscreen?.blocked, staticReady: r?.staticReady, importedState: r?.importedState, disposed: r?.disposed, loading: document.querySelector('#loading')?.className, build: f?.view?.buildQueue?.stats };
      }), errors);
      await p.screenshot({ path: `${OUT}startup-failure.png`, timeout: 10000 }).catch(() => {});
      throw e;
    }
    if (await other.evaluate(() => !!window.__frontier?.game)) await other.evaluate(() => { __frontier.paused = false; __frontier.panels.tab = null; });
    assert.equal(await p.evaluate(() => Object.keys(__frontier.game.ch.skills).length), 1);
    assert.equal(await p.evaluate(() => __frontier.presence.client.endpoint), endpoint, 'build endpoint matches test configuration');
    assert.equal(await p.evaluate(() => __frontier.supplies.game === __frontier.game), true, 'Supplies remains exposed on F');
  }
  async function join(p, room = 'lobby') {
    await p.bringToFront();
    await activate(p, '.presence-panel summary');
    await p.getByRole('textbox', { name: 'Room', exact: true }).fill(room);
    await activate(p, '[data-join]');
    await p.waitForFunction(() => __frontier.presence.client.status === 'online');
    await activate(p, '.presence-panel summary');
  }
  async function leave(p) { await p.bringToFront(); await activate(p, '.presence-panel summary'); await activate(p, '[data-leave]'); await activate(p, '.presence-panel summary'); }
  async function count(p, n) { await p.waitForFunction(n => __frontier.presence.actors.actors.size === n, n, { polling: 100 }); }
  async function keyboardMovement() {
    await a.bringToFront();
    const before = await a.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
    await a.keyboard.down('d');
    try { await a.waitForFunction(p => Math.hypot(__frontier.game.player.x - p.x, __frontier.game.player.z - p.z) > .5, before, { timeout: 20000 }); }
    finally { await a.keyboard.up('d'); }
    const after = await a.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
    await b.bringToFront();
    await b.waitForFunction(p => { const actor = [...__frontier.presence.actors.actors.values()][0]; return actor && Math.hypot(actor.rig.root.position.x - p.x, actor.rig.root.position.z - p.z) < .2; }, after);
  }
  async function clearHud(p) {
    const overlaps = await p.evaluate(() => {
      const room = document.querySelector('.presence-panel').getBoundingClientRect();
      return ['.pframe', '.quest-widget', '.minimap', '.ammo-hud', '.auto-potions-hud', '.quick-actions', '.joyzone'].filter(selector => {
        const el = document.querySelector(selector); if (!el || !el.checkVisibility()) return false;
        const r = el.getBoundingClientRect(); return Math.min(r.right, room.right) > Math.max(r.left, room.left) && Math.min(r.bottom, room.bottom) > Math.max(r.top, room.top);
      });
    });
    assert.deepEqual(overlaps, [], 'closed presence clears bounded HUD, Supplies and joystick');
  }
  await boot(a); ok('Moonroot desktop startup; only one basic starting skill; Supplies and presence on F');
  await join(a); await boot(b); await join(b);
  await count(a, 1); await count(b, 1); ok('two independent browser contexts join Moonroot in same room');
  await clearHud(a); await clearHud(b);
  await b.bringToFront();
  assert.equal(await b.locator('.ammo-hud').isVisible(), true);
  const owned = await b.evaluate(() => ({ arrows: structuredClone(__frontier.game.ch.arrows), consumables: structuredClone(__frontier.game.ch.consumables), gold: __frontier.game.ch.gold }));
  await activate(b, '.ammo-hud');
  assert.equal(await b.evaluate(() => __frontier.panels.tab === 'craft' && __frontier.panels.sel.craft === 'arrow'), true);
  assert.equal(await b.locator('.presence-panel').isVisible(), false);
  await b.keyboard.press('Escape');
  await activate(b, '.auto-potions-hud');
  assert.equal(await b.evaluate(() => __frontier.panels.tab), 'shop');
  assert.equal(await b.locator('#auto-potions-title').isVisible(), true);
  await b.screenshot({ path: `${OUT}ipad-supplies-settings.png`, timeout: 90000 });
  await b.keyboard.press('Escape');
  await activate(b, '.presence-panel summary');
  await activate(b, '.auto-potions-hud');
  assert.equal(await b.evaluate(() => __frontier.panels.isOpen), false, 'room drawer blocks Supplies navigation');
  await b.getByRole('textbox', { name: 'Room', exact: true }).focus(); await b.keyboard.press('i');
  assert.equal(await b.evaluate(() => __frontier.panels.isOpen), false, 'room editing does not trigger bag hotkey');
  await b.screenshot({ path: `${OUT}ipad-room-controls.png`, timeout: 90000 });
  await activate(b, '.presence-panel summary');
  assert.deepEqual(await b.evaluate(() => ({ arrows: __frontier.game.ch.arrows, consumables: __frontier.game.ch.consumables, gold: __frontier.game.ch.gold })), owned);
  const oldAmmo = await b.locator('.ammo-count').textContent();
  await b.evaluate(() => { const ch = __frontier.game.ch; ch.arrows.stock[ch.arrows.use]++; });
  await b.waitForFunction(n => document.querySelector('.ammo-count').textContent === String(Number(n) + 1), oldAmmo);
  await b.evaluate(() => { const ch = __frontier.game.ch; ch.arrows.stock[ch.arrows.use]--; });
  ok('Supplies HUD actions, frame updates and F exposure survive alongside presence; room editing blocks navigation; no items spent');
  await b.evaluate(() => { const p = __frontier.game.player; const spot = __frontier.game.freeSpotNear(p.x + 3, p.z); p.x = spot.x; p.z = spot.z; });
  await keyboardMovement(); ok('actual keyboard movement synchronizes to the interpolated remote actor');
  await a.screenshot({ path: `${OUT}desktop-two-players.png`, timeout: 90000 });
  await b.screenshot({ path: `${OUT}ipad-two-players.png`, timeout: 90000 });
  await b.bringToFront();
  const cd = await bc.newCDPSession(b), box = await b.locator('.joyzone').boundingBox();
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  const pos0 = await b.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y }] });
  await b.waitForFunction(p => Math.hypot(__frontier.game.player.x - p.x, __frontier.game.player.z - p.z) > .3, pos0, { timeout: 20000 });
  await b.screenshot({ path: `${OUT}ipad-joystick.png`, timeout: 90000 });
  await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const pos1 = await b.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  await a.bringToFront();
  await a.waitForFunction(p => { const actor = [...__frontier.presence.actors.actors.values()][0]; return actor && Math.hypot(actor.rig.root.position.x - p.x, actor.rig.root.position.z - p.z) < .2; }, pos1);
  ok('actual emulated touch joystick movement synchronizes to desktop');
  await leave(b); await count(a, 0); await count(b, 0); ok('Solo removes remote actors on both clients');
  await join(b, 'separate'); await count(a, 0); await count(b, 0); ok('different rooms remain isolated');
  await leave(b); await join(b); await count(a, 1);
  const oldId = await a.evaluate(() => __frontier.presence.client.id);
  if (hosted) await a.evaluate(() => __frontier.presence.client.ws.close());
  else { await app.close(); app = null; await count(a, 0); await count(b, 0); await start(); }
  await a.waitForFunction(id => __frontier.presence.client.status === 'online' && __frontier.presence.client.id !== id, oldId);
  await count(a, 1); await count(b, 1); ok(hosted ? 'hosted socket disconnect reconnects with new server identity' : 'local server restart clears ghosts and reconnects with new identities');
  await boot(a, 'azure-harbor-v1');
  await a.waitForFunction(() => __frontier.presence.client.status === 'online');
  assert.equal(await a.evaluate(() => __frontier.game.world.data.id), 'azure-harbor-v1');
  await count(a, 0); await count(b, 0); ok('Moonroot is accepted as third map and isolated from Azure in same room');
  await boot(a); await a.waitForFunction(() => __frontier.presence.client.status === 'online');
  await count(a, 1); await count(b, 1);
  await b.evaluate(() => { const p = __frontier.game.player; const spot = __frontier.game.freeSpotNear(p.x + 3, p.z); p.x = spot.x; p.z = spot.z; });
  await keyboardMovement();
  await b.screenshot({ path: `${OUT}moonroot-two-players.png`, timeout: 90000 });
  ok('two Moonroot characters render and keyboard movement synchronizes after map reload/rejoin');
  await b.close(); await count(a, 0); ok('page close removes remote actor');
  // Seed a real local slot from the current character; the existing creation flow has prior evidence.
  const saved = await a.evaluate(() => {
    __frontier.game.ch.gold = 777; const character = __frontier.game.snapshot();
    localStorage.setItem('frontier.slot.1', JSON.stringify({ version: 2, savedAt: Date.now(), character }));
    localStorage.setItem('frontier.lastSlot', '1'); return character;
  });
  if (!hosted) { await app.close(); app = null; }
  else await a.routeWebSocket(endpoint, ws => ws.close({ code: 1008, reason: 'test unavailable' }));
  await a.goto(`${origin}/?quality=low&stream=0&map=moonroot-grove-v1`); await a.bringToFront();
  await enterFullscreenGate(a); await activate(a, '[data-act="continue"]');
  await a.waitForFunction(initialUiReady, null, { timeout: 180000 });
  await a.waitForFunction(() => __frontier.presence.client.status === 'reconnecting', null, { polling: 100 });
  assert.equal(await a.evaluate(() => __frontier.save()), true);
  const loaded = await a.evaluate(() => __frontier.game.snapshot());
  for (const key of ['version', 'name', 'gold', 'gear', 'equipped', 'mods', 'materials', 'stats', 'skills', 'slots', 'appearance', 'kit', 'arrows', 'autoPotions']) assert.deepEqual(loaded[key], saved[key], `${key} survives offline Continue`);
  await a.locator('.presence-panel summary').click(); await a.locator('[data-leave]').click(); await a.locator('.presence-panel summary').click();
  const before = await a.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
  await a.keyboard.down('d');
  try { await a.waitForFunction(p => Math.hypot(__frontier.game.player.x - p.x, __frontier.game.player.z - p.z) > .3, before, { timeout: 20000 }); } finally { await a.keyboard.up('d'); }
  assert.equal(await a.evaluate(() => __frontier.save()), true);
  const stored = await a.evaluate(() => JSON.parse(localStorage.getItem('frontier.slot.1')).character);
  assert.equal(stored.gold, 777); assert.equal(stored.worldId, 'moonroot-grove-v1');
  assert.equal('presence' in stored, false); assert.equal('players' in stored, false);
  ok('unavailable endpoint preserves Moonroot local slot through Continue, solo movement and ordinary save; no remote state saved');
  assert.deepEqual(errors, []); ok('no browser runtime errors');
  writeFileSync(`${OUT}results.json`, JSON.stringify({ endpoint, origin, hosted, evidence, errors }, null, 2));
} catch (e) { console.error(e); throw e; } finally { await browser?.close(); await app?.close(); web.kill(); }
