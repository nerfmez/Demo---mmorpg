// Open world: approaching the Azure/Frontier seam streams the neighbouring map in over
// many frames (no long stall), it is drawn across the border, and walking over the
// seam hands over in place (no page reload), then back again. Usage after a build:
// node tests/browser/open-world.mjs   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadData } from '../../src/core/data-node.js';

const data = loadData(), AZURE = 'azure-harbor-v1', FRONTIER = 'frontier-wilds-v1';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/open-world-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4207, url = `http://localhost:${port}/?fresh=1&quality=low&seed=4&streamBudget=${process.env.STREAM_BUDGET || 600}`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  if (i > 60) throw Error('open-world server startup');
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
const errors = [];
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const report = {};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  console.log('loaded');
  await page.evaluate(() => { window.__sameDocument = true; document.querySelector('.banner')?.remove(); });
  report.wreckBefore = await page.evaluate(() => {
    const v = __frontier.view, geometries = new Set();
    window.__oldWreck = v.wreck;
    window.__wreckDisposals = 0;
    for (const o of [v.wreck, ...Object.values(v.weaponProps)]) o.traverse(child => {
      if (child.geometry && !child.geometry.userData.shared) geometries.add(child.geometry);
    });
    for (const geometry of geometries) geometry.addEventListener('dispose', () => window.__wreckDisposals++);
    return { owned: v.wreck.parent === v.region.root, geometries: geometries.size };
  });
  assert.ok(report.wreckBefore.owned, 'the wreck belongs to Azure');
  const seam = data.maps[AZURE].atlas.seams[0];
  // Walk-in distance: 100 m inside the seam on the border road's line.
  const place = (x, z) => page.evaluate(([x, z]) => { const F = window.__frontier, g = F.game; Object.assign(g.player, g.freeSpotNear(x, z)); g.player.hp = 1e9; g.monsters = g.monsters.filter((m) => Math.hypot(m.x - g.player.x, m.z - g.player.z) > 40); F.view.snapCamera(); }, [x, z]); // crossing is refused in combat
  await place(seam.gate[0] + 100, seam.gate[1]);
  // Record frame gaps while the neighbour streams in.
  await page.evaluate(() => {
    window.__gaps = []; let last = performance.now();
    const tick = (t) => { window.__gaps.push(t - last); last = t; if (!window.__stopGaps) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  console.log('placed', JSON.stringify(await page.evaluate(() => [window.__frontier.game.player.x, window.__frontier.view.mode])));
  // Software-GPU CI renders a frame in ~1 s; the per-frame budget (?streamBudget) is large here
  // and the wait long, while the slicing itself is what the stepMs report measures.
  await page.waitForFunction((id) => window.__frontier.view.neighbourReady(id), FRONTIER, { timeout: 420000 });
  const stream = await page.evaluate((id) => { window.__stopGaps = true; const g = window.__gaps.slice(1).sort((a, b) => a - b); const n = window.__frontier.view.neighbours.get(id); return { frames: g.length, worstFrameMs: Math.round(g[g.length - 1]), p95FrameMs: Math.round(g[Math.floor(g.length * 0.95)]), buildMs: Math.round(n.buildMs), stepMs: n.stepMs }; }, FRONTIER);
  report.stream = stream; console.log('streamed', JSON.stringify(stream));
  // The Frontier is drawn across the border, at its atlas delta.
  await place(seam.gate[0] + 8, seam.gate[1]);
  await page.evaluate(() => { window.__frontier.view.zoom = 1.6; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '01-azure-looking-west.png' });
  const placed = await page.evaluate((id) => window.__frontier.view.neighbours.get(id).region.root.position.toArray(), FRONTIER);
  const [ax, az] = data.maps[AZURE].atlas.offset, [fx, fz] = data.maps[FRONTIER].atlas.offset;
  assert.deepEqual(placed, [fx - ax, 0, fz - az]); console.log('placed ok');
  // Walk across: same document, same session, now on the Frontier.
  await place(seam.gate[0] + 1.2, seam.gate[1]);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction((id) => window.__frontier.world.data.id === id, FRONTIER, { timeout: 240000 });
  await page.keyboard.up('ArrowLeft');
  const across = await page.evaluate(() => ({ same: window.__sameDocument, world: window.__frontier.world.data.id, game: window.__frontier.game.data.world.id, x: window.__frontier.game.player.x, z: window.__frontier.game.player.z, monsters: window.__frontier.game.monsters.length }));
  assert.equal(across.same, true, 'no reload');
  assert.equal(across.game, FRONTIER);
  assert.ok(Math.abs(across.z - (seam.gate[1] - fz)) < 3, 'continued on the border road');
  assert.ok(across.monsters > 0);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + '02-frontier-after-crossing.png' });
  // Azure is still loaded behind, now the neighbour.
  assert.equal(await page.evaluate((id) => window.__frontier.view.neighbourReady(id), AZURE), true);
  const wreckShift = await page.evaluate(id => {
    const v = __frontier.view, azure = v.neighbours.get(id).region, wreck = window.__oldWreck;
    wreck.updateWorldMatrix(true, false);
    return { owned: wreck.parent === azure.root, x: wreck.matrixWorld.elements[12], z: wreck.matrixWorld.elements[14], active: !!v.wreck };
  }, AZURE);
  assert.ok(wreckShift.owned && !wreckShift.active);
  assert.equal(wreckShift.x, data.maps[AZURE].wreck.at[0] + ax - fx);
  assert.equal(wreckShift.z, data.maps[AZURE].wreck.at[1] + az - fz);
  // Evict Azure before returning: its owned wreck buffers must be released, then rebuilt once.
  await place(data.maps[FRONTIER].bounds.minX + 30, seam.gate[1] - fz);
  await page.waitForFunction(id => !__frontier.view.neighbours.has(id), AZURE, { timeout: 240000 });
  report.wreckDisposed = await page.evaluate(() => window.__wreckDisposals);
  assert.equal(report.wreckDisposed, report.wreckBefore.geometries, 'all owned wreck/weapon geometries are disposed');
  // And back.
  await place(data.maps[FRONTIER].bounds.maxX - 1.2, seam.gate[1] - fz);
  await page.waitForFunction(id => __frontier.view.neighbourReady(id), AZURE, { timeout: 420000 });
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction((id) => window.__frontier.world.data.id === id, AZURE, { timeout: 240000 });
  await page.keyboard.up('ArrowRight');
  assert.equal(await page.evaluate(() => window.__sameDocument), true, 'no reload on the way back');
  report.wreckAfter = await page.evaluate(() => {
    const v = __frontier.view, geometries = new Set();
    for (const o of [v.wreck, ...Object.values(v.weaponProps)]) o.traverse(child => {
      if (child.geometry && !child.geometry.userData.shared) geometries.add(child.geometry);
    });
    return { owned: v.wreck.parent === v.region.root, geometries: geometries.size, replaced: v.wreck !== window.__oldWreck, propsHidden: Object.values(v.weaponProps).every(o => !o.visible) };
  });
  assert.ok(report.wreckAfter.owned && report.wreckAfter.replaced && report.wreckAfter.propsHidden);
  assert.equal(report.wreckAfter.geometries, report.wreckBefore.geometries, 'owned geometry count is stable after rebuilding Azure');
  // Far from the seam the neighbour is dropped again.
  await place(60, 20);
  await page.waitForFunction((id) => !window.__frontier.view.neighbours.has(id), FRONTIER, { timeout: 240000 });
  report.errors = errors;
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  console.log('PASS open world', engine.name(), JSON.stringify(report.stream));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
