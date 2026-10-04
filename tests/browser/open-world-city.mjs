// Open world from the Frontier side: Azure streams in beside it, and its imported city, harbour
// and town kit (loaded after the region is placed, then frozen) must sit where the region sits,
// not at Azure's own coordinates on top of the Frontier. Usage after a build:
// node tests/browser/open-world-city.mjs   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { loadData } from '../../src/core/data-node.js';

const data = loadData(), AZURE = 'azure-harbor-v1', FRONTIER = 'frontier-wilds-v1';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/open-world-city-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4214, url = `http://localhost:${port}/?fresh=1&quality=low&seed=4&map=${FRONTIER}&streamBudget=600`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  if (i > 60) throw Error('server startup');
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
const errors = [];
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(url);
  await page.waitForFunction((id) => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done') && window.__frontier.world.data.id === id, FRONTIER);
  const seam = data.maps[FRONTIER].atlas.seams.find((s) => s.to === AZURE), [fx, fz] = data.maps[FRONTIER].atlas.offset;
  // Near the border on the Frontier side, as the owner was when the shipyard appeared.
  await page.evaluate(([x, z]) => { const F = window.__frontier, g = F.game; Object.assign(g.player, g.freeSpotNear(x, z)); g.player.hp = 1e9; g.monsters = []; F.view.snapCamera(); }, [seam.gate[0] - 30, seam.gate[1]]);
  await page.waitForFunction((id) => window.__frontier.view.neighbourReady(id), AZURE, { timeout: 420000 });
  await page.evaluate((id) => window.__frontier.view.neighbours.get(id).region.ready, AZURE);
  await page.waitForTimeout(500);
  // Every frozen node's world matrix must equal its parent's world matrix times its own matrix.
  const check = await page.evaluate((id) => {
    const region = window.__frontier.view.neighbours.get(id).region, root = region.root;
    let worst = 0, where = null, frozen = 0;
    root.updateMatrixWorld(); // what three does each frame: frozen nodes are skipped
    root.traverse((o) => {
      if (o === root || o.matrixWorldAutoUpdate !== false) return;
      frozen++;
      const want = o.parent.matrixWorld.clone().multiply(o.matrix).elements, got = o.matrixWorld.elements;
      const d = Math.hypot(want[12] - got[12], want[13] - got[13], want[14] - got[14]);
      if (d > worst) { worst = d; where = o.name || o.parent?.name || o.type; }
    });
    return { worst, where, frozen, root: root.position.toArray(), city: !!region.cityRoot, kit: !!region.townKitRoot };
  }, AZURE);
  console.log(JSON.stringify(check));
  await page.evaluate(() => { window.__frontier.view.zoom = 1.6; });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '01-frontier-looking-east.png' });
  assert.ok(check.city, 'Azure city loaded in the neighbour');
  assert.ok(check.frozen > 0);
  assert.ok(check.worst < 0.01, `imported scenery sits ${check.worst.toFixed(1)} m away from its region (${check.where})`);
  assert.deepEqual(errors, []);
  console.log('PASS open world city', engine.name());
} finally {
  await browser.close();
  process.kill(-server.pid);
}
