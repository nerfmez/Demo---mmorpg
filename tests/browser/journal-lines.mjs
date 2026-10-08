import {freezeScene} from './freeze-scene.mjs';
// Build lines in the field journal: stage pages with many lines, a line's page, and a funded
// character buying along one line. Screenshots for review. Usage after a build:
// node tests/browser/journal-lines.mjs   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/journal-lines-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4213, url = `http://localhost:${port}/?fresh=1&quality=low&seed=5&stream=0`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 60) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
const browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const errors = [];
try {
  for (const [name, width, height] of [['ipad', 1180, 820], ['phone', 844, 390]]) {
    const page = await (await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })).newPage(); // reduced motion: no page turn mid-capture
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
    await freezeScene(page);
    // A character who has walked the damage line far enough to see every stage.
    await page.evaluate(() => { const g = window.__frontier.game; g.ch.jobLevel = 40; g.ch.jobPoints = 39; window.__frontier.panels.open('job'); });
    await page.waitForSelector('.skill-journal [data-stage="2"]');
    const tabs = width <= 760 ? '#mobile-stages' : '#chapter-tabs';
    for (const stage of [2, 4, 5]) {
      await page.locator(`${tabs} [data-stage="${stage}"]`).first().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}${name}-stage${stage}.png` });
      // Every line card on a page must stand clear of its neighbours.
      for (let p = 0; ; p++) {
        const boxes = await page.locator('.skill-journal .discipline-node').evaluateAll((els) => els.map((e) => { const r = e.querySelector('.discipline-disc').getBoundingClientRect(), t = document.createRange(); t.selectNodeContents(e.querySelector('.discipline-caption b')); const c = t.getBoundingClientRect(); return [Math.min(r.x, c.x), r.y, Math.max(r.right, c.right) - Math.min(r.x, c.x), c.bottom - r.y]; }));
        for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${name} stage ${stage} cards overlap`);
        const next = page.locator('#junction-pagination:not([hidden]) [data-junction-page="1"]:not([disabled])');
        if (!(await next.count())) break;
        await next.click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${out}${name}-stage${stage}-page${p + 2}.png` });
      }
    }
    // Start in the physical line, cross the bridge, then follow damage to the end, all with the
    // journal's own rules (one node at a time, every gate checked).
    const bought = await page.evaluate(() => {
      const f = window.__frontier, g = f.game, d = g.data, N = d.jobtree.nodes;
      const path = [], seen = new Set();
      const visit = (id) => { if (seen.has(id) || id === d.jobtree.origin || g.ch.jobNodes.includes(id)) return; seen.add(id); for (const p of N[id].requires || []) visit(p); path.push(id); };
      ['line.physical.2.a2', 'line.physical.2.b1', 'line.damage.2.a2', 'line.damage.2.join'].forEach(visit);
      Object.keys(N).filter((id) => N[id].line === 'line.damage' && N[id].stage > 2).forEach(visit);
      let n = 0;
      for (const id of path) { if (!g.ch.jobPoints) break; f.panels.jobJournal.learn(id); n++; }
      return { n, left: g.ch.jobPoints, damage: g.ch.jobNodes.filter((id) => N[id]?.line === 'line.damage').length, bridge: g.ch.jobNodes.includes('bridge.physical-damage.2') };
    });
    assert.equal(bought.left, 0, JSON.stringify(bought));
    assert.equal(bought.bridge,false,'no cross-group purchases');
    // A main line page: one fork plus its bridges; mastery stays within the same line.
    const nodesClear = async (label) => {
      const boxes = await page.locator('#plane > [data-node]').evaluateAll((els) => els.map((e) => { const r = e.querySelector('.node-disc').getBoundingClientRect(), t = document.createRange(); t.selectNodeContents(e.querySelector('.node-caption b')); const c = t.getBoundingClientRect(); return [Math.min(r.x, c.x), r.y, Math.max(r.right, c.right) - Math.min(r.x, c.x), c.bottom - r.y]; }));
      assert.ok(boxes.length >= 6 && boxes.length <= 10, label);
      for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], `${name} ${label}: nodes overlap`);
    };
    for (const [stage, gate] of [[3, 'view.physical.3'], [5, 'view.physical.5'], [5, 'view.physical.mastery']]) {
      await page.locator(`${tabs} [data-stage="${stage}"]`).first().click();
      await page.waitForTimeout(800);
      const hub=gate.endsWith('.mastery')?'view.physical.5':gate;
      for (let i = 0; i < 3 && !(await page.locator(`[data-gateway="${hub}"]`).count()); i++) { await page.locator('#junction-pagination [data-junction-page="1"]').click(); await page.waitForTimeout(600); }
      await page.locator(`[data-gateway="${hub}"]`).click();
      if(gate!==hub)await page.locator(`[data-line-page="${gate}"]`).click();
      await page.waitForTimeout(1200);
      await nodesClear(gate);
      await page.screenshot({ path: `${out}${name}-${gate}.png` });
      // The whole page, for review, when it scrolls.
      await page.locator('[data-action="fit"]').click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}${name}-${gate}-fit.png` });
      await page.locator('#place-switch').click();
      await page.waitForTimeout(600);
    }
    console.log(name, JSON.stringify(bought));
  }
  assert.deepEqual(errors, []);
  console.log('PASS journal lines', engine.name());
} finally { await browser.close(); process.kill(-server.pid); }
