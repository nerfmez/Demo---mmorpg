// Remaining physical skills: actual arrow, earth marker/debris and summon rig.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = new URL('./out/physical-lab/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4189', '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
try {
  for (let i = 0;; i++) {
    try { if ((await fetch('http://localhost:4189/lab.html')).ok) break; } catch {}
    if (i > 60) throw Error('preview did not start'); await new Promise(r => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch(engine === chromium ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } }), errors = [];
  page.on('pageerror', e => errors.push(e.stack || String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4189/lab.html?skill=hunter_shot'); await page.waitForFunction(() => window.__lab); await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const L = window.__lab; L.state.paused = true; L.state.zoom = .4; window.__physical = { hits: [], bursts: [], bites: [] };
    for (const [method, key] of [['hitSpark', 'hits'], ['burst', 'bursts'], ['bite', 'bites']]) {
      const original = L.vfx[method].bind(L.vfx); L.vfx[method] = e => { window.__physical[key].push(e); return original(e); };
    }
  });
  const tick = n => page.evaluate(n => { for (let i = 0; i < n; i++) window.__lab.step(1 / 60); }, n);
  const shot = async name => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.screenshot({ path: OUT + name }); };
  const preview = phase => page.evaluate(phase => { const L = window.__lab; L.preview(phase); L.state.paused = true; }, phase);
  const select = async id => { await page.getByLabel('สกิลที่ปรับ', { exact: true }).selectOption(id); await page.evaluate(() => window.__lab.state.paused = true); };
  await preview('cast'); await tick(6);
  assert(await page.evaluate(() => window.__lab.vfx.castArrow?.mesh.visible));
  assert.equal(await page.evaluate(() => window.__lab.vfx.projectiles.size), 0); await shot('arrow-draw.png');
  await preview('projectile'); await tick(4);
  const arrow = await page.evaluate(() => {
    const v = [...window.__lab.vfx.projectiles.values()][0];
    return { weapon: window.__lab.state.weapon, sprites: v.children.filter(o => o.isSprite).length, streak: v.children[3].userData.arrowStreak, length: v.children[3].material.uniforms.uLength.value };
  });
  assert.equal(arrow.weapon, 'bow'); assert.equal(arrow.sprites, 0); assert(arrow.streak); assert(arrow.length > 1); await shot('arrow-flight.png');
  await preview('impact'); await tick(1);
  const arrowImpact = await page.evaluate(() => ({ contacts: window.__lab.vfx.contacts.count, dots: window.__lab.vfx.fx.count, active: window.__lab.vfx.active.length }));
  assert.equal(arrowImpact.contacts, 7); assert.equal(arrowImpact.dots, 0); assert.equal(arrowImpact.active, 0); await shot('arrow-impact.png');
  await page.getByRole('button', { name: 'ปรับเอฟเฟกต์', exact: true }).click();
  await select('stone_burst'); await preview('full');
  await tick(49);
  assert.equal(await page.evaluate(() => window.__physical.bursts.length), 0, 'earth waits for cast plus delay');
  assert.equal(await page.evaluate(() => window.__physical.hits.length), 0);
  const warning = await page.evaluate(() => window.__lab.vfx.areas.size); assert.equal(warning, 1); await shot('earth-warning.png');
  await tick(7);
  assert.equal(await page.evaluate(() => window.__physical.bursts.length), 1);
  assert.equal(await page.evaluate(() => window.__physical.hits.length), 1);
  const earth = await page.evaluate(() => ({ chips: window.__lab.vfx.chips.count, dust: window.__lab.vfx.dust.count, contacts: window.__lab.vfx.contacts.count, rocks: window.__lab.vfx.active.find(a => a.obj.children?.[0]?.userData.height)?.obj.children.length }));
  assert(earth.chips > 0); assert(earth.dust > 0); assert(earth.contacts > 0); assert.equal(earth.rocks, 7); await shot('earth-impact.png');
  const earthBounds = await page.evaluate(() => {
    const L = window.__lab, radius = L.tuning.get('stone_burst').def.radius;
    const left = L.view.dummy.position.clone(); left.x -= radius;
    const points = [left, L.view.hero.position.clone()];
    const right = document.getElementById('panel').getBoundingClientRect().left;
    return points.map(p => (p.project(L.view.camera).x + 1) * innerWidth / 2).every(x => x > 0 && x < right);
  });
  assert(earthBounds, 'the open inspector must leave the caster and full earth footprint in view');
  const height = page.locator('input[type=number][data-field="fx.burst.height"]'); await height.fill('1.7'); await height.press('Tab'); await page.waitForTimeout(250);
  await preview('burst'); await tick(8);
  const tuned = await page.evaluate(() => {
    const L = window.__lab, group = L.vfx.active.find(a => a.obj.children?.[0]?.userData.height).obj;
    return { height: group.children[0].userData.height, contacts: L.vfx.contacts.count, footprint: group.children.every(o => Math.hypot(o.position.x + L.state.distance, o.position.z) + Math.max(o.scale.x, o.scale.z) <= L.tuning.get('stone_burst').def.radius) };
  });
  assert(Math.abs(tuned.height - 1.87) < 1e-8); assert.equal(tuned.contacts, 0); assert(tuned.footprint); await shot('earth-tuned.png');
  await page.getByRole('button', { name: 'คืนค่าทั้งสกิล', exact: true }).click();
  await select('spirit_wolf'); const before = await page.evaluate(() => window.__physical.bites.length);
  await preview('full'); await tick(54); assert.equal(await page.evaluate(() => window.__physical.bites.length), before);
  await tick(6); assert.equal(await page.evaluate(() => window.__physical.bites.length), before + 1);
  assert(await page.evaluate(() => window.__lab.view.wolf.visible)); await shot('wolf-contact.png');
  await tick(90); assert.equal(await page.evaluate(() => window.__physical.bites.length), before + 1);
  assert.equal(await page.evaluate(() => window.__lab.view.wolf.visible), false, 'replay summon fades out');
  await preview('attack'); await tick(19); assert.equal(await page.evaluate(() => window.__lab.vfx.contacts.count), 0, 'isolated bite motion has no contact flash'); await shot('wolf-bite.png');
  await page.setViewportSize({ width: 768, height: 1024 }); await page.locator('#panel').evaluate(n => n.scrollTop = 0); await preview('impact'); await tick(1); await shot('portrait-wolf-impact.png');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1000, height: 750 });
  const cleanup = {};
  for (const id of ['hunter_shot', 'stone_burst', 'spirit_wolf']) {
    await select(id);
    const probe = cycles => page.evaluate(async cycles => {
      const L = window.__lab, paint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (let n = 0; n < cycles; n++) { L.preview('full', false); L.state.paused = true; for (let j = 0; j < 90; j++) L.step(1 / 60); await paint(); L.clear(); await paint(); }
      return { geometries: L.stats().geometries, contacts: L.vfx.contacts.count, chips: L.vfx.chips.count, areas: L.vfx.areas.size, wolf: L.view.wolf.visible };
    }, cycles);
    const warm = await probe(1), repeated = await probe(5); assert.deepEqual(repeated, warm); assert.equal(repeated.contacts, 0); assert.equal(repeated.chips, 0); assert.equal(repeated.areas, 0); assert.equal(repeated.wolf, false); cleanup[id] = { warm, repeated };
  }
  // Real rendered sequences, with the inspector closed for motion review.
  await page.getByRole('button', { name: 'ปิดตัวปรับ', exact: true }).click();
  for (const [id, frames, steps] of [['hunter_shot', 24, 3], ['stone_burst', 24, 5], ['spirit_wolf', 32, 5]]) {
    await page.evaluate(() => { const L = window.__lab; L.state.distance = 6; L.view.dummy.position.set(-6, 0, 0); });
    // Use the visible skill selector to rebuild the appropriate real weapon rig.
    await page.getByRole('button', { name: 'ปรับเอฟเฟกต์', exact: true }).click(); await select(id); await page.getByRole('button', { name: 'ปิดตัวปรับ', exact: true }).click();
    await preview('full');
    for (let i = 0; i < frames; i++) { await tick(steps); await shot(id + '-' + String(i).padStart(3, '0') + '.png'); }
  }
  const report = { ok: errors.length === 0, browser: process.env.BROWSER || 'chromium', arrow, arrowImpact, warning, earth, tuned, cleanup, errors };
  writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2)); assert.equal(errors.length, 0, errors.join('\n')); console.log(JSON.stringify(report));
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
