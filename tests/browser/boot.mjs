// Short real title/create/save/Continue gate. Full smoke remains a separate suite.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const base = 'http://localhost:4240/';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4240', '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i > 60) throw Error('boot preview server startup');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const devices = engine === chromium ? [['desktop', 1280, 720, false], ['ipad', 1180, 820, true]] : [['ipad', 1180, 820, true]];
  mkdirSync('tests/browser/out/boot', { recursive: true });
  for (const [device, width, height, touch] of devices) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text()); });
    const activate = selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    const ready = () => page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier.game?.time > .3 && document.getElementById('loading').classList.contains('done'));
    await page.goto(`${base}?quality=low&stream=0`);
    const entry = await enterFullscreenGate(page);
    assert.ok(!entry.blocked && (entry.active || entry.fallback));
    await activate('[data-act="new"]');
    await page.locator('#heroName').fill('CI Boot');
    await activate('[data-act="kit"][data-kit="bow"]');
    await activate('[data-act="start"]');
    await ready();
    const created = await page.evaluate(() => ({ name: __frontier.game.ch.name, weapon: __frontier.game.derived.weaponType, saved: !!localStorage.getItem('frontier.slot.1'), frame: __frontier.view.renderer.info.render.frame }));
    assert.equal(created.name, 'CI Boot'); assert.equal(created.weapon, 'bow'); assert.ok(created.saved); assert.ok(created.frame > 0, 'world really renders');
    await page.evaluate(() => { __frontier.game.ch.gold = 777; __frontier.save(); });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('frontier.slot.1')).character);
    await page.reload();
    await enterFullscreenGate(page);
    await activate('[data-act="continue"]');
    await ready();
    const loaded = await page.evaluate(() => __frontier.game.snapshot());
    for (const key of ['version', 'name', 'gold', 'gear', 'equipped', 'mods', 'materials', 'stats', 'skills', 'slots', 'appearance', 'kit']) assert.deepEqual(loaded[key], saved[key], `${key} survives Continue`);
    await activate('.menu-toggle');
    assert.equal(await page.locator('.hub-tile[data-go]').count(), 13);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => __frontier.panels.isOpen), false);
    await page.screenshot({ path: `tests/browser/out/boot/${engine.name()}-${device}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS boot/create/save/Continue ${engine.name()} ${device}`);
    await context.close();
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
