// Shop + potions + quick item slots in the real game on the iPad viewport: walk to the shopkeeper,
// open the shop from the prompt, buy, assign a slot, drink from the HUD button, and check the
// quick bar does not overlap the combat buttons. Screenshots for review.
// Usage after a build: node tests/browser/shop-potions.mjs   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/shop-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4219, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const errors = [];
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const map of ['', 'frontier-wilds-v1']) {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
    await page.goto(base + `?fresh=1&seed=9&quality=low&stream=0${map ? '&map=' + map : ''}`);
    await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
    const tag = map ? 'frontier' : 'coast';
    // stand at the shop, facing the shopkeeper
    await page.evaluate(() => {
      const f = window.__frontier, g = f.game, t = g.data.world.town;
      document.querySelector('.banner')?.remove();
      Object.assign(g.player, g.freeSpotNear(t.shop[0], t.shop[1]));
      g.player.facing = Math.atan2(t.shopkeeper[0] - g.player.x, t.shopkeeper[1] - g.player.z);
      g.ch.gold = 500;
      f.view.zoom = 0.75; f.view.snapCamera();
    });
    await page.waitForTimeout(1200);
    const prompt = page.locator('#hud .prompt .pbtn');
    await prompt.waitFor();
    assert.match(await prompt.innerText(), /ร้านค้า/, 'shop prompt');
    await page.screenshot({ path: out + tag + '-1-shopkeeper.png' });
    await prompt.click();
    await page.waitForSelector('.pbody[data-panel=shop] .shop-item');
    await page.locator('[data-act=quick-select][data-slot="3"]').click();
    await page.locator('[data-act=buy][data-id=hp_potion_l][data-n="5"]').click();
    // buying fills the first empty slot (3); then move it to the chosen slot 4
    assert.equal(await page.evaluate(() => window.__frontier.game.ch.quickItems[2]), 'hp_potion_l');
    await page.locator('[data-act=quick-assign][data-id=hp_potion_l]').click();
    const st = await page.evaluate(() => { const g = window.__frontier.game; return { gold: g.ch.gold, l: g.ch.consumables.hp_potion_l, slots: g.ch.quickItems }; });
    assert.equal(st.l, 5); assert.equal(st.gold, 500 - 5 * 80); assert.equal(st.slots[3], 'hp_potion_l'); assert.equal(st.slots[2], null);
    await page.screenshot({ path: out + tag + '-2-shop-panel.png' });
    await page.locator('.panel-close').click();
    // drink from the HUD button while hurt
    await page.evaluate(() => { const p = window.__frontier.game.player; p.hp = Math.round(p.maxHp * 0.3); p.mp = 1; });
    await page.locator('#hud .quickbar .qbtn').nth(3).click();
    await page.locator('#hud .quickbar .qbtn').nth(1).click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => { const g = window.__frontier.game, p = g.player; return { hp: p.hp / p.maxHp, mp: p.mp, l: g.ch.consumables.hp_potion_l, cd: p.itemCooldowns }; });
    assert.ok(after.hp > 0.6, 'large potion healed: ' + after.hp); assert.ok(after.mp > 1); assert.equal(after.l, 4); assert.ok(after.cd.hp > 0 && after.cd.mp > 0);
    await page.screenshot({ path: out + tag + '-3-drink.png' });
    // the quick bar must not overlap a combat button or the quest tracker
    const overlap = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect(), hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const bar = r(document.querySelector('#hud .quickbar'));
      return [...document.querySelectorAll('#hud .combat .sbtn, #hud .quest-widget, #hud .prompt')].filter((el) => el.getClientRects().length && hit(bar, r(el))).map((el) => el.className);
    });
    assert.deepEqual(overlap, [], 'quick bar overlaps ' + overlap);
    await page.context().close();
  }
  // phone portrait: with the shop prompt showing, the quick bar must stay clear of it and of the buttons
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '?fresh=1&seed=9&quality=low&stream=0');
    await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
    await page.evaluate(() => { const g = window.__frontier.game, t = g.data.world.town; document.querySelector('.banner')?.remove(); Object.assign(g.player, g.freeSpotNear(t.shop[0], t.shop[1])); window.__frontier.view.snapCamera(); });
    await page.locator('#hud .prompt .pbtn').waitFor();
    await page.waitForTimeout(500);
    const overlap = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect(), hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const bar = r(document.querySelector('#hud .quickbar'));
      return [...document.querySelectorAll('#hud .combat .sbtn, #hud .quest-widget, #hud .prompt .pbtn, #hud .pframe')].filter((el) => el.getClientRects().length && hit(bar, r(el))).map((el) => el.className);
    });
    await page.screenshot({ path: out + 'portrait-prompt.png' });
    assert.deepEqual(overlap, [], 'portrait quick bar overlaps ' + overlap);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS shop + potions', engine.name());
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
