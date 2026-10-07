// Focused renderer ownership regression. Run after build; medium retains shadows/post.
// The simulation and travel-event handling below match main.js, with a fixed clock
// for comparable captures. Software GL is not a physical iPad performance test.
import assert from 'node:assert/strict';
import {chromium, webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const base = process.env.RENDER_URL || 'http://localhost:4177/';
const out = process.env.RENDER_OUT || `tests/browser/out/render-material-lifetime-${engine.name()}/`;
mkdirSync(out, {recursive: true});
const report = {engine: engine.name(), quality: 'medium', cycles: [], errors: []};
let browser, server;
try {
  if (!process.env.RENDER_URL) server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', '4177', '--strictPort'], {stdio: 'ignore', detached: true});
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i > 60) throw Error('preview unavailable');
    await new Promise(r => setTimeout(r, 250));
  }
  browser = await engine.launch({executablePath: process.env.BROWSER_EXECUTABLE,
    args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []});
  const page = await (await browser.newContext({viewport: {width: 1180, height: 820}, hasTouch: true, isMobile: true})).newPage();
  page.on('pageerror', e => report.errors.push(e.stack));
  page.on('console', m => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text()); });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__ownershipFreeze) cb(t); });
  });
  await page.goto(base + '?fresh=1&seed=9&quality=medium&map=frontier-wilds-v1&streamBudget=100');
  await page.waitForFunction(() => window.__frontier?.modelsReady && __frontier.game.time > .3 && document.getElementById('loading').classList.contains('done'), null, {timeout: 120000});
  await page.evaluate(() => {
    const f = __frontier; window.__ownershipFreeze = true; f.paused = true; f.input.reset(); f.input.disabled = true;
    document.querySelector('.banner')?.remove();
    f.__draw = () => {
      for (const mv of f.view.monsterViews.values()) mv.spawnT = 1;
      f.view.render(0, 12, {}); f.hud.drawMinimap();
    };
    f.__place = (x, z) => { Object.assign(f.game.player, f.game.freeSpotNear(x, z)); f.view.snapCamera(); };
    f.__step = seconds => {
      const g = f.game;
      for (let i = 0; i < seconds * 60; i++) {
        g.player.hp = g.player.maxHp;
        g.update(1 / 60);
        for (const e of g.drainEvents()) {
          if (e.type === 'travel') { g.enterWorld(g.worlds[e.to]); if (!f.view.switchRegion(e.to)) throw Error('missing streamed region'); }
          else f.view.handleEvent(e);
        }
        f.view.syncMonsters(1 / 60, g.time); f.view.vfx.update(1 / 60);
      }
    };
  });
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate(async () => {
      const f = __frontier, v = f.view; f.__place(220, 1); f.__draw();
      v.buildQueue.budgetMs = 100;
      for (let i = 0; i < 5000 && !v.neighbourReady('azure-harbor-v1'); i++) { v.buildQueue.drain(); await new Promise(r => setTimeout(r, 0)); }
      if (!v.neighbourReady('azure-harbor-v1')) throw Error('Azure did not stream');
      // Wait for imports too; a region may become visible before its city arrives.
      for (let i = 0; i < 5000 && v.neighbours.get('azure-harbor-v1').region.importedState !== 'imported-ready'; i++) { v.buildQueue.drain(); await new Promise(r => setTimeout(r, 0)); }
      if (v.neighbours.get('azure-harbor-v1').region.importedState !== 'imported-ready') throw Error('city did not finish');
      const g = f.game; g.monsters = g.monsters.filter(m => Math.hypot(m.x - g.player.x, m.z - g.player.z) > 40);
      g.setMove(1, 0); f.__step(2); g.setMove(0, 0);
      if (v.world.data.id !== 'azure-harbor-v1') throw Error('did not cross into Azure');
      f.__draw();
      // Return over the authored gate, then watch the old region during eviction.
      f.__place(-158.8, -92); g.monsters = g.monsters.filter(m => Math.hypot(m.x - g.player.x, m.z - g.player.z) > 40);
      g.setMove(-1, 0); f.__step(2); g.setMove(0, 0);
      if (v.world.data.id !== 'frontier-wilds-v1') throw Error('did not return to Frontier');
      const region = v.neighbours.get('azure-harbor-v1').region, privateMaterials = new Set(), depths = new Set();
      region.root.traverse(o => {
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (!m.userData.shared) privateMaterials.add(m);
        if (o.customDepthMaterial) depths.add(o.customDepthMaterial);
      });
      f.__released = {materials: privateMaterials.size, depths: depths.size, disposedMaterials: 0, disposedDepths: 0};
      for (const m of privateMaterials) m.addEventListener('dispose', () => f.__released.disposedMaterials++);
      for (const d of depths) d.addEventListener('dispose', () => f.__released.disposedDepths++);
      f.__place(-100, -70); f.__draw();
      if (!region.disposed || v.neighbours.get('azure-harbor-v1')?.region === region) throw Error('old Azure region was not evicted');
      f.__place(99.2, -119.8); f.__step(30); f.__draw(); f.__draw();
    });
    await page.screenshot({path: out + `wolves-after-cycle-${cycle}.png`});
    const sample = await page.evaluate(() => {
      const f = __frontier, v = f.view, c = f.hud.mini, bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let geography = 0; for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] && !(bytes[i] === 36 && bytes[i + 1] === 58 && bytes[i + 2] === 40)) geography++;
      let grassRoots = 0, blackGrassRoots = 0;
      v.scene.traverse(o => {
        if (o.name !== 'ground-blended-grass') return;
        const data = o.geometry.attributes.aGrassBase.array;
        for (let i = 0; i < data.length; i += 3) { grassRoots++; if (data[i] + data[i + 1] + data[i + 2] === 0) blackGrassRoots++; }
      });
      return {...f.__released, geography, grassRoots, blackGrassRoots, gameTime: f.game.time, map: v.world.data.id, lost: v.renderer.getContext().isContextLost(), glError: v.renderer.getContext().getError(), target: !!v.renderer.getRenderTarget(), geometries: v.renderer.info.memory.geometries, textures: v.renderer.info.memory.textures, programs: v.renderer.info.programs.length};
    });
    report.cycles.push(sample); console.log('CYCLE', cycle, JSON.stringify(sample));
    assert.ok(sample.materials > 0 && sample.depths > 0);
    assert.equal(sample.disposedMaterials, sample.materials); assert.equal(sample.disposedDepths, sample.depths);
    assert.ok(sample.geography > 45000); assert.equal(sample.lost, false); assert.equal(sample.glError, 0); assert.equal(sample.target, false);
    assert.ok(sample.grassRoots > 1000); assert.equal(sample.blackGrassRoots, 0, 'every baked root retains its ground colour');
    assert.deepEqual(report.errors, []);
  }
  assert.ok(Math.abs(report.cycles[1].geometries - report.cycles[0].geometries) <= 3, 'geometry stabilises after returning to the same place');
  report.ok = true;
} finally {
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) try { process.kill(-server.pid); } catch {}
}
