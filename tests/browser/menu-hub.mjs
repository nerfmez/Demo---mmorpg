// Main menu (hub): one button opens it, every page has a tile and opens only when pressed, each page
// lists only its own group, and every page can go back to the hub. Screenshots for review.
// Usage after a build: node tests/browser/menu-hub.mjs   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/menu-hub-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4223, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const errors = [];
const GROUPS = { hero: ['char', 'job'], build: ['skills', 'mods', 'movement', 'growth'], items: ['bag', 'craft', 'shop'], world: ['journal', 'map'], system: ['settings'] };
const TITLE = { char: 'ตัวละคร', job: null, skills: 'ชุดสกิล', mods: 'ชุดสกิล', movement: 'ชุดสกิล', growth: 'อัปเลเวล', bag: 'อุปกรณ์', craft: 'โต๊ะคราฟต์', shop: 'ร้านค้า · ยา', journal: 'ภารกิจ', map: 'แผนที่', settings: 'ตั้งค่า' };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const [name, width, height] of [['ipad', 1180, 820], ['phone-landscape', 844, 390], ['phone-portrait', 390, 844]]) {
    const page = await (await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })).newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(name + ': ' + m.text()); });
    await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0');
    await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
    await page.evaluate(() => { document.querySelector('.banner')?.remove(); window.__frontier.paused = true; });
    const open = () => page.evaluate(() => window.__frontier.panels.isOpen);
    const tap = (sel) => page.locator(sel).tap();
    const title = () => page.evaluate(() => (document.querySelector('#atelier:not([hidden]) h1') || document.querySelector('#panel-title'))?.textContent);

    // nothing is shown until the button is pressed
    assert.equal(await open(), false, 'no menu page at start');
    await tap('.menu-toggle');
    assert.equal(await open(), true);
    assert.equal(await page.locator('#panel-title').textContent(), 'เมนูหลัก');
    assert.equal(await page.locator('.hub-group').count(), 5);
    assert.equal(await page.locator('.hub-tile[data-go]').count(), 12, 'one tile per page');
    for (const [g, pages] of Object.entries(GROUPS)) {
      const got = await page.locator(`.hub-group[data-group=${g}] .hub-tile`).evaluateAll((els) => els.map((e) => e.dataset.go));
      assert.deepEqual(got, pages, g + ' group pages');
    }
    assert.ok(await page.locator('.hub-tile[data-go=char] .dot').count(), 'unspent stat points show on the tile');
    assert.equal(await page.locator('.panel-back').isVisible(), false, 'the hub has no back button');
    assert.equal(await page.locator('.tabs').isVisible(), false, 'the hub has no sidebar');
    if (name === 'ipad') {
      const fits = await page.locator('.pbody').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
      assert.ok(fits, 'five groups fit the iPad screen without scrolling');
    }
    await page.screenshot({ path: `${out}${name}-1-hub.png` });

    // every tile opens its own page; the page lists only its group; back returns to the hub
    for (const [g, pages] of Object.entries(GROUPS)) for (const id of pages) {
      if (id === 'job') continue; // the passive journal keeps its own full-screen layout
      if (!await page.locator(`.hub-tile[data-go=${id}]`).count()) await page.evaluate(() => window.__frontier.panels.open('menu'));
      await page.locator(`.hub-tile[data-go=${id}]`).scrollIntoViewIfNeeded();
      await tap(`.hub-tile[data-go=${id}]`);
      await page.waitForTimeout(150);
      assert.equal(await title(), TITLE[id], id + ' title');
      const atelier = await page.locator('#atelier').isVisible();
      if (atelier) {
        assert.ok(await page.locator('#atelier [data-action=hub]').isVisible() || height > width, id + ': back button in the workspace');
        if (height > width) { await page.evaluate(() => window.__frontier.panels.open('menu')); continue; }
        await tap('#atelier [data-action=hub]');
      } else {
        const tabs = await page.locator('[data-tab]').evaluateAll((els) => els.map((e) => e.dataset.tab));
        if (pages.length > 1) assert.deepEqual(tabs, pages, id + ' sidebar lists its group only'); else assert.equal(await page.locator('.tabs').isVisible(), false, id + ' has no sidebar');
        assert.ok(await page.locator('.panel-back').isVisible(), id + ': back button');
        if (id === 'char' || id === 'craft') await page.screenshot({ path: `${out}${name}-2-${id}.png` });
        await tap('.panel-back');
      }
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#panel-title').textContent(), 'เมนูหลัก', id + ': back reaches the hub');
    }

    // moving between pages of one group needs no trip through the hub
    await page.locator('.hub-tile[data-go=journal]').scrollIntoViewIfNeeded();
    await tap('.hub-tile[data-go=journal]');
    if (width > 700) await tap('[data-tab=map]'); else await page.locator('[data-page-select]').selectOption('map');
    assert.equal(await page.locator('#panel-title').textContent(), 'แผนที่');
    await tap('.panel-close');
    assert.equal(await open(), false);

    // keyboard: Esc opens the hub, Esc again closes it
    await page.keyboard.press('Escape');
    assert.equal(await open(), true);
    assert.equal(await page.locator('#panel-title').textContent(), 'เมนูหลัก');
    await page.keyboard.press('Escape');
    assert.equal(await open(), false);
    // the HUD shortcuts still open their pages directly
    await tap('.quick-actions [aria-label="กระเป๋า"]');
    assert.equal(await page.locator('#atelier').isVisible() || height > width, true);
    await page.evaluate(() => window.__frontier.panels.close());
    console.log('PASS menu hub ' + engine.name() + ' ' + name);
    await page.context().close();
  }
  assert.deepEqual(errors, [], 'page errors');
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
