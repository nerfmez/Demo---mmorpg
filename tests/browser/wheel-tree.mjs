// Focused capture for the wheel Job Tree as the field journal of maps (owner's "สมุดเส้นทางสกิล",
// 2026-11-03; ?tree=wheel until phase C): the compass, the camp, a sector map with a route inked in one
// go, a job destination chosen, a branch map with its fork, the jobs compass and a phone sheet.
// node tests/browser/wheel-tree.mjs [outDir]   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { freezeScene } from './freeze-scene.mjs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const S = process.argv[2] || `tests/browser/out/wheel-tree-${engine.name()}`, port = 4192;
const url = `http://localhost:${port}/?fresh=1&load=dev&quality=low&seed=5&tree=wheel`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
mkdirSync(S, { recursive: true });
const errors = [];
let browser;
const W = () => window.__frontier.panels.jobJournal;
const idle = (page) => page.waitForFunction(() => { const s = window.__frontier.panels.jobJournal?.snapshot(); return s && !s.turning && !s.animating && !s.pending.length; }, null, { timeout: 60000 });
const shot = async (page, name) => { await page.screenshot({ path: `${S}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
// tap a place on the map with a real touch, scrolling the map to it first
const tap = async (page, sel) => {
  const box = await page.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
  await page.touchscreen.tap(box[0], box[1]);
  await page.waitForTimeout(450);
};
const node = (id) => `.wheel-tree [data-node="${id}"]`;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(url)).ok) break; } catch {} if (i > 80) throw Error('no server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
  await freezeScene(page);
  // 1) the compass at Job Lv 1 with three points
  await page.evaluate(() => { const f = window.__frontier; f.game.ch.jobPoints = 3; f.panels.open('job'); });
  await page.waitForSelector('.wheel-tree .fm-region');
  await page.waitForTimeout(2800);
  await shot(page, '01-compass');
  // 2) the camp: tap the hub, take the first place, watch the ink
  await tap(page, '.wheel-tree .fm-hub');
  await page.waitForTimeout(450);
  await shot(page, '02-laying-the-map');
  await idle(page); await page.waitForTimeout(300);
  await tap(page, node('in.center.c1'));
  await shot(page, '03-camp-note');
  await page.click('.wheel-tree [data-f="buy"]');
  await page.waitForTimeout(700);
  await shot(page, '04-camp-ink');
  await idle(page); await page.waitForTimeout(900);
  // 3) Job Lv 40: the STR map, a route inked in one go
  await page.evaluate(() => { const f = window.__frontier, ch = f.game.ch; ch.jobLevel = 40; ch.jobPoints = 40; f.panels.changed(); });
  await page.click('.wheel-tree [data-tab="sector.str"]');
  await idle(page); await page.waitForTimeout(400);
  await shot(page, '05-str-map');
  await tap(page, node('in.str.s8'));
  await shot(page, '06-str-route-note');
  await page.click('.wheel-tree [data-f="route"]');
  await page.waitForTimeout(1500);
  await shot(page, '07-str-route-ink');
  await idle(page); await page.waitForTimeout(900);
  await shot(page, '08-str-route-done');
  // 4) the heavy weapon job at the end of the iron road
  await tap(page, node('job.heavy'));
  await shot(page, '09-job-gate-note');
  await page.click('.wheel-tree [data-f="buy"]');
  await idle(page); await page.waitForTimeout(600);
  const P = await page.evaluate(() => window.__frontier.panels.jobJournal.snapshot().page);
  assert.equal(P, 'job.heavy.sweeper', 'choosing the job opens its map');
  await page.click('.wheel-tree [data-branch="crusher"]');
  await idle(page); await page.waitForTimeout(400);
  await tap(page, node('job.heavy.crusher.t0k.debuff'));
  await shot(page, '10-branch-fork-route');
  await page.click('.wheel-tree [data-f="route"]');
  await idle(page); await page.waitForTimeout(900);
  await tap(page, node('job.heavy.crusher.t0k.charge'));
  await shot(page, '11-fork-closed');
  // 5) the jobs compass
  await page.evaluate(() => window.__frontier.panels.jobJournal.turnTo('jobs'));
  await idle(page); await page.waitForTimeout(2800);
  await shot(page, '12-jobs-compass');
  const res = await page.evaluate(() => { const ch = window.__frontier.game.ch; return { points: ch.jobPoints, owned: ch.jobNodes.length, job: ch.jobNodes.includes('job.heavy'), debuff: ch.jobNodes.includes('job.heavy.crusher.t0k.debuff'), charge: ch.jobNodes.includes('job.heavy.crusher.t0k.charge'), s8: ch.jobNodes.includes('in.str.s8') }; });
  assert.ok(res.job && res.debuff && !res.charge && res.s8, JSON.stringify(res));
  // 6) a phone held sideways: the DEX/INT map with a note
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__frontier.panels.jobJournal.turnTo('sector.dexint'));
  await idle(page); await page.waitForTimeout(500);
  await tap(page, node('in.dexint.di4'));
  await shot(page, '13-phone');
  console.log(JSON.stringify({ res, errors: errors.slice(0, 8) }));
  assert.deepEqual(errors, []);
  void W;
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
