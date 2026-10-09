// Outfit base: the hero in every armour (with a matching pair of boots), front and back, from a
// close review camera in the actual game. Stills in tests/browser/out/outfits-<engine>/.
// Usage after a build: node tests/browser/outfits.mjs   (BROWSER=webkit for iPad)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/outfits-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4221, base = `http://localhost:${port}/`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
// every armour, boots, gloves and helm item appears at least once, in sets matching their icons
export const LOOKS = [
  ['travel_tunic', 'travel_boots', 'hide_gloves', 'leather_cap'], ['hide_vest', 'wisp_slippers', null, null],
  ['sporeweave_vest', 'moonleaf_slippers', 'sporeweave_gloves', 'spore_hood'], ['shell_guard', 'tide_boots', 'shell_mitts', 'crabshell_helm'],
  ['wolfpelt_coat', 'wolf_boots', 'wolf_grips', 'beetle_helm'], ['ranger_coat', 'trail_boots', 'brigand_gloves', 'ranger_hood'],
  ['storm_mantle', 'gale_boots', 'wisp_wraps', 'feather_circlet'], ['wardenstalker_coat', 'travel_boots', 'wardenstalker_gloves', 'wardenstalker_hood'],
  ['crag_plate', 'crag_greaves', 'crag_gauntlets', 'horned_helm'],
];
const report = { engine: engine.name(), looks: [], errors: [] };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true, isMobile: true })).newPage();
  page.setDefaultTimeout(150000);
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) report.errors.push(m.text()); });
  await page.goto(base + '?fresh=1&kit=sword&quality=low&stream=0');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier.view.hero?.hairsample && document.getElementById('loading').classList.contains('done'));
  await page.evaluate(() => {
    const f = window.__frontier, v = f.view, g = f.game;
    document.querySelector('.banner')?.remove();
    f.paused = true; f.input.disabled = true; g.monsters = [];
    g.player.x = -48; g.player.z = 45; v.heroY = v.world.groundY(-48, 45);
    const draw = v.render.bind(v); v.render = () => {}; // the loop stops drawing; each look is drawn once
    f.show = (gear, yaw) => {
      g.gearLook = () => gear; // the view rebuilds the hero from the game's gear look
      g.player.facing = yaw;
      for (let i = 0; i < 40; i++) draw(0.05, g.time, {}); // the hero turns to its facing over a few frames
      const r = v.hero;
      v.zoom = 0.16; v.camTarget.set(g.player.x, v.heroY + 0.9, g.player.z); v.snapCamera(); v.camTarget.set(g.player.x, v.heroY + 0.9, g.player.z);
      draw(0, g.time, {}); v.renderer.render(v.scene, v.camera);
      let garments = 0; r.wardrobe?.traverse((o) => { if (o.isMesh) garments++; });
      return { garments, parts: r.outfit?.parts || [] };
    };
  });
  for (const [armor, boots, gloves, helm] of LOOKS) {
    for (const [side, yaw] of [['front', 0.35], ['back', Math.PI + 0.35]]) {
      const r = await page.evaluate(([armor, boots, gloves, helm, yaw]) => window.__frontier.show({ weapon: 'sword', armor: 'tunic', helm: helm ? 'cap' : null, bases: { armor, boots, gloves, helm, weapon: 'iron_sword' } }, yaw), [armor, boots, gloves, helm, yaw]);
      if (side === 'front') report.looks.push({ armor, boots, ...r });
      await page.screenshot({ path: `${out}${armor}-${side}.png` });
    }
  }
  // walking: the skirt of each base category follows the legs
  for (const armor of ['ranger_coat', 'storm_mantle', 'crag_plate']) {
    await page.evaluate(([armor]) => {
      const f = window.__frontier, v = f.view, g = f.game;
      f.show({ weapon: 'sword', armor: 'tunic', bases: { armor, boots: 'trail_boots', gloves: 'hide_gloves', weapon: 'iron_sword' } }, Math.PI / 2);
      for (let i = 0; i < 12; i++) v.heroAnim.update(0.05, { speed: 5, moving: true, facing: Math.PI / 2, dead: false, time: g.time + i * 0.05 });
      v.hero.syncSkin?.(); v.renderer.render(v.scene, v.camera);
    }, [armor]);
    await page.screenshot({ path: `${out}${armor}-walk.png` });
  }
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  assert.deepEqual(report.errors, []);
  for (const l of report.looks) assert.ok(l.garments >= 6, `${l.armor}: top, trousers and shoes (and a skirt, boot shafts, gloves) with their outlines`);
  console.log('PASS outfits', engine.name(), report.looks.length);
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
