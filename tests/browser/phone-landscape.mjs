// Phone landscape review (owner, 2026-11-03: landscape only; "จัดตำแหน่ง ui ของโทรศัพท์แนวนอนให้ดี"):
// the title screen, the field HUD, the main menu and every menu page, the wheel tree journal, and the
// rotate screen a phone shows when held upright. Screenshots plus layout checks (nothing off screen,
// no control under 40 px, no horizontal page scroll).
// node tests/browser/phone-landscape.mjs [outDir] [WxH,...]   (BROWSER=webkit for the iPhone engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { freezeScene } from './freeze-scene.mjs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const S = process.argv[2] || `tests/browser/out/phone-landscape-${engine.name()}`, port = 4194;
const sizes = (process.argv[3] || '844x390,667x375').split(',').map((s) => s.split('x').map(Number));
const base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
mkdirSync(S, { recursive: true });
const errors = [], problems = [];
const only = process.env.ONLY; // 'wheel' | 'pages' to review one part
const PAGES = (process.env.PAGES || 'menu,char,job,skills,mods,movement,growth,bag,craft,forge,shop,journal,map,settings').split(',');
let browser;
const ready = (page) => page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
// controls a finger must hit, and anything poking out of the screen
async function audit(page, name) {
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [], small = [];
    for (const el of document.querySelectorAll('button, [role="button"], select, input, a[href]')) {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
      if (el.closest('svg') || el.closest('.fm-map')) continue; // map places carry their own larger hit circles
      const label = (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 30);
      // a control in a scrolling list is reached by scrolling; one under a page or a modal is not in play
      let scroller = el.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflow + getComputedStyle(scroller).overflowX + getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      const off = b.right > W + 1 || b.bottom > H + 1 || b.left < -1 || b.top < -1;
      if (off) { if (!scroller || scroller === document.documentElement || scroller === document.body) out.push(label); continue; }
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!top || !(el.contains(top) || top.contains(el))) continue;
      if (Math.min(b.width, b.height) < 40 && !el.matches('input[type="range"]')) small.push(`${label} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return { out, small: small.slice(0, 8), scrollX: document.documentElement.scrollWidth > W + 1 };
  });
  if (r.out.length) problems.push(`${name}: off screen ${r.out.slice(0, 6).join(' | ')}`);
  if (r.small.length) problems.push(`${name}: small ${r.small.join(' | ')}`);
  if (r.scrollX) problems.push(`${name}: page scrolls sideways`);
}
const shot = async (page, name) => { await page.screenshot({ path: `${S}/${name}.png`, timeout: 120000 }); await audit(page, name); console.log('shot', name); };
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('no server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const [w, h] of sizes) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(String(e)));
    if (only !== 'wheel') {
    // the title screen
    await page.goto(base + '?load=dev&quality=low');
    await page.waitForTimeout(6000);
    await shot(page, `${tag}-00-title`);
    // the field and every page
    await page.goto(base + '?fresh=1&load=dev&quality=low&seed=5');
    await ready(page);
    await page.waitForTimeout(800);
    await shot(page, `${tag}-01-hud`);
    await freezeScene(page);
    for (const [i, id] of PAGES.entries()) {
      // a full-looking bag: twenty more pieces of gear, copies of the starting three
      if (id === 'bag') await page.evaluate(() => { const g = window.__frontier.game; if (g.ch.gear.length < 10) { const base = g.ch.gear.slice(0, 3); for (let i = 0; i < 20; i++) g.ch.gear.push({ ...structuredClone(base[i % base.length]), uid: 90000 + i }); g.refresh(); } });
      await page.evaluate((id) => { const p = window.__frontier.panels; p.close(); p.open(id); }, id);
      await page.waitForTimeout(id === 'job' ? 1800 : 700);
      await shot(page, `${tag}-${String(i + 2).padStart(2, '0')}-${id}`);
    }
    await page.evaluate(() => window.__frontier.panels.close());
    }
    if (only !== 'pages') {
    // the wheel tree journal (preview)
    await page.goto(base + '?fresh=1&load=dev&quality=low&seed=5&tree=wheel');
    await ready(page);
    await freezeScene(page);
    await page.evaluate(() => { const f = window.__frontier; f.game.ch.jobPoints = 5; f.panels.open('job'); });
    await page.waitForTimeout(3200);
    await shot(page, `${tag}-20-wheel-compass`);
    await page.evaluate(() => window.__frontier.panels.jobJournal.turnTo('sector.str'));
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.__frontier.panels.jobJournal.select('in.center.c1'));
    await page.waitForTimeout(600);
    await shot(page, `${tag}-21-wheel-map-note`);
    await page.evaluate(() => window.__frontier.panels.jobJournal.turnTo('jobs'));
    await page.waitForTimeout(2600);
    await shot(page, `${tag}-22-wheel-jobs`);
    }
    // held upright: the rotate screen
    await page.setViewportSize({ width: h, height: w });
    await page.waitForTimeout(800);
    await shot(page, `${tag}-30-portrait`);
    // landscape only: the card is up and play is held; turned back, the card goes and play goes on
    assert.equal(await page.evaluate(() => document.querySelector('.rotate-lock')?.open && window.__frontier.rotateLock.blocked), true, 'held upright: rotate card');
    const t0 = await page.evaluate(() => window.__frontier.game.time);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__frontier.game.time), t0, 'held upright: the game is paused');
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(() => document.querySelector('.rotate-lock')?.open === false && !window.__frontier.rotateLock.blocked);
    await ctx.close();
  }
  console.log(JSON.stringify({ problems, errors: errors.slice(0, 8) }, null, 1));
  assert.deepEqual(errors, []);
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
