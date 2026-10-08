// Focused real-game equipment contract: thresholds, both hands, stats, touch and save.
// Broader crafting and model inventories keep their existing independent owners.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { freezeScene } from './freeze-scene.mjs';
const engine = { chromium, webkit }[process.env.BROWSER || 'chromium'];
if (!engine) throw Error('BROWSER must be chromium or webkit');
const out = `tests/browser/out/equipment-focused-${engine.name()}`;
mkdirSync(out, { recursive: true });
const url = 'http://localhost:4246/?fresh=1&quality=low&stream=0';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4246', '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
const results = [];
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i > 60) throw Error('equipment focused server startup');
    await new Promise(r => setTimeout(r, 250));
  }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined,
    args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const [device, width, height, touch] of [['desktop', 1440, 900, false], ['ipad', 1180, 820, true], ['phone', 844, 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(90000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__frontier?.modelsReady && __frontier.game.time > .3 && document.getElementById('loading').classList.contains('done'));
    await freezeScene(page);
    const state = await page.evaluate(async () => {
      const core = await import('/src/core/character.js');
      const f = __frontier, g = f.game, ch = g.ch, data = g.data;
      const give = base => { const it = { uid: ch.nextUid++, base, itemLevel: data.items.gearBases[base].itemLevel, grade: 'C', upgrade: 0, options: [] }; ch.gear.push(it); return it; };
      for (const stat in ch.stats) ch.stats[stat] = 100;
      const vest = give('sporeweave_vest');
      ch.level = vest.itemLevel - 1;
      const before = JSON.stringify(ch), blocked = core.equip(ch, data, vest.uid);
      const atomic = before === JSON.stringify(ch);
      ch.level = vest.itemLevel;
      const threshold = core.equip(ch, data, vest.uid);
      const a = give('rusty_sword'), b = give('rusty_sword');
      const right = core.equip(ch, data, a.uid), left = core.equip(ch, data, b.uid, 'offhand');
      const combined = core.gearEquipState(ch, data, a, 'weapon').requires;
      const own = core.gearRequirements(a, data);
      for (const [stat, value] of Object.entries(own)) ch.stats[stat] = value;
      const deficient = core.gearEquipState(ch, data, a, 'weapon');
      g.refresh(); f.panels.open('bag');
      return { vest: vest.uid, a: a.uid, b: b.uid, blocked, atomic, threshold, right, left, own, combined, deficient, weaponType: g.derived.weaponType };
    });
    assert.equal(state.blocked.ok, false); assert.equal(state.blocked.reason, 'level'); assert.ok(state.atomic);
    for (const name of ['threshold', 'right', 'left']) assert.equal(state[name].ok, true, name);
    assert.ok(Object.entries(state.own).some(([stat, need]) => state.combined[stat] > need), 'two-hand requirements aggregate');
    assert.equal(state.deficient.ok, false); assert.ok(state.deficient.missing.length > 0);
    assert.equal(state.weaponType, 'none', 'invalid equipment contributes no weapon type');
    const select = page.locator(`.bag-grid .inventory-cell[data-id="${state.a}"]`);
    await (touch ? select.tap() : select.click());
    const detail = page.locator('.selection-shelf [data-action="details"]');
    await (touch ? detail.tap() : detail.click());
    assert.ok(await page.locator('.atelier-dialog .gear-requires').count() > 0, 'touch detail exposes wear requirements');
    await page.screenshot({ path: `${out}/${device}-requirements.png` });
    const recovered = await page.evaluate(async ids => {
      const core = await import('/src/core/character.js');
      const f = __frontier, g = f.game, ch = g.ch;
      f.panels.close(); for (const stat in ch.stats) ch.stats[stat] = 100;
      // Restore through the public equip contract for both legacy and retained-slot states.
      const a = core.equip(ch, g.data, ids.a), b = core.equip(ch, g.data, ids.b, 'offhand');
      g.refresh();
      return { a, b, snapshot: g.snapshot(), dualWield: g.derived.dualWield,
        look: g.gearLook() };
    }, state);
    assert.equal(recovered.a.ok, true); assert.equal(recovered.b.ok, true); assert.equal(recovered.dualWield, true);
    assert.equal(recovered.look.weapon, 'sword'); assert.equal(recovered.look.offhand, 'sword');
    // fresh=1 intentionally disables persistence; exercise migrate/serialize instead.
    const restored = await page.evaluate(async snapshot => {
      const { migrateCharacter } = await import('/src/core/character.js');
      const ch = JSON.parse(JSON.stringify(snapshot)); migrateCharacter(ch, __frontier.game.data); return ch;
    }, recovered.snapshot);
    for (const key of ['gear', 'equipped', 'stats', 'skills', 'slots', 'materials']) assert.deepEqual(restored[key], recovered.snapshot[key], `${key} ownership survives migration`);
    assert.deepEqual(errors, []);
    results.push({ browser: engine.name(), device, threshold: true, combinedHands: true, touchDetails: true, recovered: true, migration: true });
    writeFileSync(`${out}/report.json`, JSON.stringify(results, null, 2));
    console.log(`PASS equipment focused ${engine.name()} ${device}`);
    await context.close();
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
}
