// Focused production-style UI harness. Never contacts Render or creates a renderer.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'vite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const out = new URL('./out/presence-responsive/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const built = await build({ configFile: false, logLevel: 'error', define: { 'import.meta.env.VITE_PRESENCE_URL': JSON.stringify('ws://127.0.0.1:3001/presence') }, build: { write: false, minify: false, lib: { entry: new URL('./presence-layout-harness.js', import.meta.url).pathname, name: 'PresenceLayout', formats: ['iife'] } } });
const files = built[0].output, code = files.find(o => o.type === 'chunk').code;
let css = [...readFileSync(resolve(root, 'index.html'), 'utf8').matchAll(/href="(\/src\/ui\/[^\"]+\.css)"/g)].map(m => readFileSync(resolve(root, m[1].slice(1)), 'utf8')).join('\n');
css += files.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => o.source).join('\n');
for (const subset of ['thai', 'latin']) css += `@font-face{font-family:Mitr;src:url(data:font/woff2;base64,${readFileSync(resolve(root, `node_modules/@fontsource/mitr/files/mitr-${subset}-400-normal.woff2`)).toString('base64')}) format('woff2');font-weight:400;}`;
const html = '<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><body><canvas id="game"></canvas><div id="hud"></div></body></html>';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium' });
const reports = [], errors = [], external = [], screenshots = [];
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://127.0.0.1:4173') { external.push(u.origin); return route.abort(); }
    if (u.pathname === '/presence-layout.html') return route.fulfill({ contentType: 'text/html', body: html });
    const file = resolve(root, 'public', '.' + u.pathname);
    if (!file.startsWith(resolve(root, 'public') + '/')) return route.abort();
    try { await route.fulfill({ contentType: ({ '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[extname(file)] || 'application/octet-stream', body: readFileSync(file) }); } catch { await route.abort(); }
  });
  await page.goto('http://127.0.0.1:4173/presence-layout.html');
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: code });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => __frontier.game.time > .2);
  const selectors = ['.presence-panel', '.presence-panel summary', '.pframe', '.quest-widget', '.ammo-hud', '.auto-potions-hud', '.joyzone', '.joy', '.quick-actions', '.minimap', '.fullscreen-control', '[data-join]', '[data-leave]'];
  async function bounds() { return page.evaluate(selectors => Object.fromEntries(selectors.map(s => { const e = document.querySelector(s); if (!e?.checkVisibility()) return [s, null]; const r = e.getBoundingClientRect(); return [s, { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }]; })), selectors); }
  function within(r, width, height) { assert.ok(r && r.x >= 0 && r.y >= 0 && r.right <= width + .1 && r.bottom <= height + .1, JSON.stringify(r)); }
  function overlap(a, b) { return a && b && Math.min(a.right, b.right) > Math.max(a.x, b.x) && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y); }
  async function reachable(selector) { assert.equal(await page.locator(selector).evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, `${selector} center is reachable`); }
  async function capture(name) { const path = out + name + '.png'; await page.screenshot({ path }); screenshots.push({ name, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }); }
  for (const [name, width, height] of [['tablet', 1024, 768], ['landscape', 760, 430]]) {
    await page.setViewportSize({ width, height });
    await page.locator('.presence-panel summary').tap(); await page.locator('[data-join]').tap(); await page.locator('.presence-panel summary').tap();
    const closed = await bounds(); within(closed['.presence-panel'], width, height);
    for (const s of ['.pframe', '.quest-widget', '.ammo-hud', '.auto-potions-hud', '.joyzone', '.quick-actions', '.minimap', '.fullscreen-control']) assert.equal(overlap(closed['.presence-panel'], closed[s]), false, `closed drawer overlaps ${s} at ${name}`);
    for (const s of ['.presence-panel summary', '.ammo-hud', '.auto-potions-hud']) await reachable(s);
    await capture(name + '-closed');
    // Real keyboard and joystick input after closing the drawer; no renderer/transport claims.
    const position = () => page.evaluate(() => ({ x: __frontier.game.player.x, z: __frontier.game.player.z }));
    const k0 = await position(); await page.keyboard.down('d');
    try { await page.waitForFunction(p => Math.hypot(__frontier.game.player.x - p.x, __frontier.game.player.z - p.z) > .3, k0, { timeout: 3000 }); } finally { await page.keyboard.up('d'); }
    const k1 = await position(), cd = await context.newCDPSession(page), j = closed['.joyzone'];
    const x = j.x + j.w * .5, y = j.y + j.h * .5, t0 = await position();
    await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y }] });
    try { await page.waitForFunction(p => Math.hypot(__frontier.game.player.x - p.x, __frontier.game.player.z - p.z) > .3, t0, { timeout: 3000 }); } finally { await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    const t1 = await position(); await cd.detach();
    await page.locator('.presence-panel summary').tap();
    const open = await bounds(); within(open['.presence-panel'], width, height);
    for (const s of ['.presence-panel summary', '[data-join]', '[data-leave]']) { within(open[s], width, height); await reachable(s); assert.ok(open[s].h >= 44); }
    for (const s of ['.pframe', '.ammo-hud', '.auto-potions-hud', '.fullscreen-control']) assert.equal(overlap(open['.presence-panel'], open[s]), false, `open drawer overlaps ${s} at ${name}`);
    await page.locator('input[aria-label="Room"]').fill('layout-test'); await page.keyboard.press('i');
    assert.equal(await page.evaluate(() => __frontier.panels.isOpen), false);
    await page.locator('[data-leave]').tap(); assert.equal(await page.evaluate(() => __frontier.presence.client.status), 'solo');
    await capture(name + '-open');
    await page.locator('.presence-panel summary').tap();
    await page.locator('.ammo-hud').tap(); assert.equal(await page.evaluate(() => __frontier.panels.sel.craft), 'arrow');
    await reachable('.panel-close'); const craftClose = await page.locator('.panel-close').boundingBox(); await page.locator('.panel-close').tap();
    await page.locator('.auto-potions-hud').tap(); assert.equal(await page.evaluate(() => __frontier.panels.tab), 'shop');
    await reachable('.panel-close'); const potionClose = await page.locator('.panel-close').boundingBox(); await capture(name + '-supplies-close'); await page.locator('.panel-close').tap();
    reports.push({ name, width, height, closed, open, craftClose, potionClose, keyboardDisplacement: Math.hypot(k1.x - k0.x, k1.z - k0.z), joystickDisplacement: Math.hypot(t1.x - t0.x, t1.z - t0.z), assertions: 'bounds, no HUD/Supplies overlap, center hit tests, native close, Join/Solo, real keyboard/joystick movement, room hotkey isolation, real Supplies navigation and panel Close' });
    console.log('PASS', name, JSON.stringify(reports.at(-1)));
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  writeFileSync(out + 'results.json', JSON.stringify({ sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), cssSha256: createHash('sha256').update(readFileSync(resolve(root, 'src/ui/presence.css'))).digest('hex'), rendererOmitted: true, networkStubbed: true, reports, screenshots, errors, external }, null, 2));
} finally { await browser.close(); }
