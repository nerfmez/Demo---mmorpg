// The opening on a real new character: unconscious at the wreck, wake, weapon, starter skills, first quest rewards.
// Screenshots go to tests/browser/out/opening/ for visual review (game camera, iPad size, touch).
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const port = 4251, base = `http://localhost:${port}/`;
const out = `tests/browser/out/opening/${engine.name()}-${process.env.KIT || 'staff'}-`;
mkdirSync('tests/browser/out/opening', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 60) throw Error('server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
  const tap = (s) => page.locator(s).first().tap();
  const resume = async selector => {
    await page.reload();
    await enterFullscreenGate(page);
    await tap('[data-act="continue"]');
    await page.waitForFunction(() => window.__frontier?.modelsReady && __frontier.game?.time > 0.3);
    await page.waitForSelector(selector);
  };
  await page.goto(`${base}?quality=low&stream=0&seed=5`);
  await enterFullscreenGate(page);
  await tap('[data-act="new"]');
  await page.locator('#heroName').fill('Castaway');
  assert.equal(await page.locator('[data-act="kit"]').count(), 0, 'the creator no longer picks a weapon');
  await tap('[data-act="start"]');
  await page.waitForSelector('[data-act="wake"]');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier.game?.time > 0.3);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '1-unconscious.png' });
  const lying = await page.evaluate(() => { const f = window.__frontier; return { stage: f.game.ch.opening.stage, down: f.view.heroDown, rotX: f.view.hero.root.rotation.x, skills: Object.keys(f.game.ch.skills), weapon: f.game.derived.weaponType, wreck: !!f.view.wreck, props: Object.values(f.view.weaponProps).every((o) => o.visible), inputOff: f.input.disabled }; });
  assert.equal(lying.stage, 'wake'); assert.ok(lying.down > 0.95 && lying.rotX < -1.2, 'hero lies on the sand'); assert.deepEqual(lying.skills, []);
  assert.ok(lying.wreck && lying.props && lying.inputOff);
  await resume('[data-act="wake"]');
  assert.equal(await page.evaluate(() => __frontier.game.ch.opening.stage), 'wake', 'unconscious save resumes unconscious');
  await tap('[data-act="wake"]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + '2-waking.png' });
  await page.waitForSelector('[data-act="kit"]');
  const standing = await page.evaluate(() => window.__frontier.view.hero.root.rotation.x);
  assert.ok(standing > -1.2, 'rising');
  const KIT = process.env.KIT || 'staff';
  await tap(`[data-act="kit"][data-kit="${KIT}"]`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '3-weapons.png' });
  await resume(`[data-act="kit"][data-kit="${KIT}"].on`);
  await tap('[data-act="to-skills"]');
  const pool = await page.locator('[data-act="skill"]').evaluateAll((n) => n.map((x) => x.dataset.id));
  assert.ok(pool.length >= 2 && !pool.includes('firebolt') && !pool.includes('ward') && (KIT === 'sword' || !pool.includes('whirl_blade')), `${KIT} pool ${pool}`);
  assert.equal(await page.locator('[data-act="finish"]').isDisabled(), true);
  await tap('[data-act="skill"][data-id="frost_nova"]');
  await tap('[data-act="move"][data-id="roll"]');
  await resume('[data-act="skill"][data-id="frost_nova"].on');
  assert.equal(await page.locator('[data-act="move"][data-id="roll"].on').count(), 1, 'movement choice survives an interruption');
  assert.equal(await page.locator('[data-act="finish"]').isDisabled(), false);
  await page.screenshot({ path: out + '4-skills.png' });
  await tap('[data-act="finish"]');
  await page.waitForFunction(() => window.__frontier.game.ch.opening.stage === 'done');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '5-started.png' });
  const done = await page.evaluate(() => { const g = window.__frontier.game; return { skills: Object.keys(g.ch.skills).sort(), slots: g.ch.slots.map((s) => s.skill), mv: g.ch.movement, weapon: g.derived.weaponType, saved: JSON.parse(localStorage.getItem('frontier.slot.1')).character.opening.stage, inputOn: !window.__frontier.input.disabled, props: Object.values(window.__frontier.view.weaponProps).some((o) => o.visible) }; });
  const basic = { staff: 'arcane_bolt', sword: 'slash', bow: 'hunter_shot' }[KIT];
  assert.deepEqual(done.skills, [basic, 'frost_nova'].sort()); assert.deepEqual(done.slots.slice(0, 2), [basic, 'frost_nova']);
  assert.equal(done.mv, 'roll'); assert.equal(done.weapon, KIT); assert.equal(done.saved, 'done'); assert.ok(done.inputOn); assert.ok(!done.props);
  await page.waitForFunction(() => __frontier.weaponModelsReady());
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out + '6-later.png' });
  // the hero is rebuilt when the weapon model arrives; it must stand upright facing the same way
  const upright = await page.evaluate(() => { const v = window.__frontier.view, h = v.hero; h.root.updateMatrixWorld(true); return { headY: h.bones.head.matrixWorld.elements[13] - h.root.position.y, rz: h.root.rotation.z, rx: h.root.rotation.x }; });
  assert.ok(upright.headY > 1.4 && Math.abs(upright.rz) < 0.01 && Math.abs(upright.rx) < 0.01, `hero stands upright ${JSON.stringify(upright)}`);
  await resume('.menu-toggle');
  assert.deepEqual(await page.evaluate(() => Object.keys(__frontier.game.ch.skills).sort()), [basic, 'frost_nova'].sort(), 'Continue keeps the selected skill set');
  await page.waitForFunction(() => __frontier.weaponModelsReady());
  assert.deepEqual(errors, []);
  console.log(`PASS opening ${engine.name()} ${KIT}: wake/weapon/skills interruptions and completed Continue`);
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
