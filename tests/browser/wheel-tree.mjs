// Focused capture for the wheel Job Tree screen (phase B, 2026-11-03): ?tree=wheel, the wheel at Job Lv 1, a
// tap on a node and its card, points spent along a line, choosing a job at Job Lv 40, a job's page with a
// fork, and a phone-width sheet. node tests/browser/wheel-tree.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const S = process.argv[2] || 'tests/browser/out/wheel-tree', port = 4192, base = `http://localhost:${port}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '/home/user/Demo---mmorpg', stdio: 'ignore', detached: true });
mkdirSync(S, { recursive: true });
const errors = [];
let browser;
const shot = async (page, name) => { await page.screenshot({ path: `${S}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
// tap the middle of a wheel node with a real touch, through the screen's own hit test
const tapNode = async (page, id) => {
  const at = await page.evaluate((id) => {
    const svg = document.querySelector('.wt-svg'), w = window.__frontier.panels.jobJournal;
    const art = document.querySelector('.wt-cam'), m = art.getScreenCTM();
    const lay = w.layout[id], p = svg.createSVGPoint(); p.x = lay[0]; p.y = lay[1];
    const s = p.matrixTransform(m);
    return [s.x, s.y];
  }, id);
  await page.touchscreen.tap(at[0], at[1]);
  await page.waitForTimeout(150);
};
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('no server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '?fresh=1&load=dev&quality=low&tree=wheel');
  await page.waitForFunction(() => window.__frontier?.panels && window.__frontier?.game?.time > 0.3, null, { timeout: 120000 });
  await page.evaluate(() => { const f = window.__frontier; f.paused = true; f.panels.open('job'); });
  await page.waitForSelector('.wt-svg');
  // 1) Job Lv 1, a few points: the wheel and the starting card
  await page.evaluate(() => { const f = window.__frontier; f.game.ch.jobPoints = 3; f.panels.changed(); });
  await shot(page, '1-wheel-start');
  // 2) a tap on the centre, then on a far STR node (route offered)
  await tapNode(page, 'in.center.c1');
  await shot(page, '2-tap-centre');
  await page.click('.wt-go');
  await page.evaluate(() => { const f = window.__frontier; f.game.ch.jobPoints = 30; f.panels.changed(); });
  await tapNode(page, 'in.str.s8');
  await shot(page, '3-route-card');
  await page.click('.wt-go');
  await page.waitForTimeout(100);
  await shot(page, '4-route-bought');
  // 3) Job Lv 40: the heavy weapon line, then the jobs open
  const state = await page.evaluate(() => {
    const f = window.__frontier, ch = f.game.ch; ch.jobLevel = 40; ch.jobPoints = 40; f.panels.changed();
    return { pts: ch.jobPoints, nodes: ch.jobNodes.length };
  });
  await tapNode(page, 'in.heavy.h4');
  await page.click('.wt-go');
  await tapNode(page, 'job.heavy');
  await shot(page, '5-job-card');
  await page.click('.wt-go'); // choose the job: the page turns to its line
  await page.waitForSelector('.wt-jobpage:not([hidden])');
  await page.click('[data-id="job.heavy.trunk2"]'); await page.click('.wt-go');
  await page.click('[data-id="job.heavy.crusher.t0k.debuff"]'); await page.click('.wt-go');
  await page.click('[data-id="job.heavy.crusher.t0k.charge"]');
  await shot(page, '6-job-page-fork');
  await page.click('[data-w="page"][data-page="wheel"]');
  await page.click('[data-w="zoom"][data-z="1.35"]');
  await shot(page, '7-wheel-with-job');
  // 4) phone width: the card is a sheet
  await page.setViewportSize({ width: 430, height: 860 });
  await page.evaluate(() => window.__frontier.panels.changed());
  await page.click('[data-w="fit"]');
  await tapNode(page, 'in.int.i4');
  await shot(page, '8-phone-sheet');
  const res = await page.evaluate(() => { const ch = window.__frontier.game.ch; return { jobPoints: ch.jobPoints, jobNodes: ch.jobNodes.length, job: ch.jobNodes.find((n) => n === 'job.heavy') }; });
  console.log(JSON.stringify({ state, res, errors: errors.slice(0, 8) }));
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
