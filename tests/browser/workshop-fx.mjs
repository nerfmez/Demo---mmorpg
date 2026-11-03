// Focused capture for the workshop (craft / upgrade / grade): the pages at iPad and phone-landscape size,
// and the result effects frame by frame (owner, 2026-11-03: "ปรับปรุงหน้าคราฟหรือตีบวก ปรับเอฟเฟคด้วย").
// node tests/browser/workshop-fx.mjs [outDir] [WxH,...]   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { freezeScene } from './freeze-scene.mjs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const S = process.argv[2] || `tests/browser/out/workshop-fx-${engine.name()}`, port = 4195;
const sizes = (process.argv[3] || '1180x820,844x390').split(',').map((s) => s.split('x').map(Number));
const FRAMES = (process.env.FRAMES || '120,300,480,650,900,1300').split(',').map(Number);
const base = `http://localhost:${port}/?fresh=1&load=dev&quality=low&seed=5`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
mkdirSync(S, { recursive: true });
const errors = [];
let browser;
const shot = (page, name) => page.screenshot({ path: `${S}/${name}.png`, timeout: 120000 }).then(() => console.log('shot', name));
// play an action and photograph it at fixed times after the tap (real time, the effect is CSS/WAAPI)
// The page clock is paused (timers wait) and every animation is held and stepped to each time exactly,
// so a slow software renderer cannot smear the frames; then the clock runs on to the end of the effect.
async function sequence(page, tag, name, selector) {
  await page.evaluate((sel) => { document.querySelector(sel).click(); document.getAnimations().forEach((a) => a.pause()); }, selector);
  for (const t of FRAMES) {
    const info = await page.evaluate((t) => { const as = document.getAnimations(); as.forEach((a) => { a.currentTime = t; }); return { n: as.length, fx: document.querySelectorAll('.wsfx').length, kids: document.querySelector('.wsfx')?.children.length, busy: window.__frontier.panels.workshop.busy, played: as.filter((a) => a.playState !== 'paused').length }; }, t);
    if (process.env.DEBUG) console.log(name, t, JSON.stringify(info));
    await shot(page, `${tag}-${name}-${String(t).padStart(4, '0')}`);
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.clock.runFor(2500);
}
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('no server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const [w, h] of sizes) {
    const tag = `${w}x${h}`;
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true })).newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.clock.install(); // before the game loads, so its timers (the workshop's busy time) follow the page clock
    await page.goto(base);
    await page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
    await freezeScene(page);
    await page.clock.pauseAt(new Date(Date.now() + 100));
    // stand at the workbench with plenty of materials and gold
    await page.evaluate(() => {
      const g = window.__frontier.game, near = g.nearby.bind(g);
      g.nearby = () => ({ ...near(), workbench: true, inTown: true });
      for (const id of Object.keys(g.data.items.materials)) g.ch.materials[id] = 99;
      g.ch.gold = 99999; g.refresh();
    });
    // upgrade
    await page.evaluate(() => { const p = window.__frontier.panels; p.sel.forgeMode = 'upgrade'; p.open('forge'); });
    await page.waitForSelector('[data-act="gear-up"]');
    await page.waitForTimeout(500);
    await shot(page, `${tag}-a-upgrade`);
    await sequence(page, tag, 'b-upgrade-fx', '[data-act="gear-up"]:not([disabled])');
    // grade
    await page.evaluate(() => { const p = window.__frontier.panels; p.workshop?.clear(); p.sel.forgeMode = 'grade'; p.render(); });
    await page.waitForSelector('[data-act="gear-grade"]');
    await page.waitForTimeout(400);
    await shot(page, `${tag}-c-grade`);
    await sequence(page, tag, 'd-grade-fx', '[data-act="gear-grade"]:not([disabled])');
    // craft: the list, a recipe, the craft
    await page.evaluate(() => { const p = window.__frontier.panels; p.workshop?.clear(); p.sel.craftRecipe = null; p.open('craft'); });
    await page.waitForTimeout(500);
    await shot(page, `${tag}-e-craft-list`);
    await page.evaluate(() => document.querySelector('[data-act="craft-open"]').click());
    await page.waitForSelector('.craft-single');
    await page.waitForTimeout(400);
    await shot(page, `${tag}-f-craft-detail`);
    await sequence(page, tag, 'g-craft-fx', '.craft-single:not([disabled])');
    await page.context().close();
  }
  console.log(JSON.stringify({ errors: errors.slice(0, 8) }));
  assert.deepEqual(errors, []);
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
