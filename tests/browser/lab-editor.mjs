// Exercises the shared inspector through its controls, then verifies actual Vfx objects.
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = new URL('./out/lab-editor/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4187', '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
try {
  for (let i = 0;; i++) {
    try { if ((await fetch('http://localhost:4187/lab.html')).ok) break; } catch {}
    if (i > 60) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  browser = await engine.launch(engine === chromium ? { executablePath:process.env.CHROMIUM_EXECUTABLE, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  const errors = []; page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`HTTP ${r.status()} ${r.url()}`)}); page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  await page.goto('http://localhost:4187/lab.html?skill=firebolt');
  await page.waitForFunction(() => window.__lab); await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.getElementById('info').textContent.includes('ลูกไฟ'));
  const shot = async (name) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: OUT + name });
  };
  const section = async (name) => {
    const details = page.locator('details').filter({ has: page.locator('summary', { hasText: name }) });
    if (await details.getAttribute('open') === null) await details.locator('summary').click();
  };
  const number = async (path, value) => {
    const input = page.locator('input[type=number][data-field="' + path + '"]');
    await input.fill(String(value)); await input.press('Tab');
  };
  await page.getByRole('button', { name: 'ปรับเอฟเฟกต์', exact: true }).click();
  await number('fx.projectile.flowSpeed', 26);
  await page.waitForTimeout(250);
  const flow = await page.evaluate(() => {
    const L = window.__lab; L.preview('projectile'); L.state.paused = true; for(let i=0;i<12;i++)L.step(1 / 60);
    return [...L.vfx.projectiles.values()][0].children[0].material.uniforms.uTail.value.z;
  });
  assert.equal(flow, 26, 'flow control must reach the real flame shader');
  await shot('editor-projectile.png');
  await page.locator('#panel').evaluate((node) => { node.scrollTop = 0; });
  await shot('editor-overview.png');
  await section('สี');
  await page.locator('input[type=color][data-field="fx.colors.rim"]').evaluate((node) => { node.value = '#ff3300'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(250);
  const color = await page.evaluate(() => {
    const L = window.__lab; L.preview('projectile'); L.state.paused = true; L.step(1 / 60);
    return { body: [...L.vfx.projectiles.values()][0].children[0].material.uniforms.uRim.value.getHexString(), particles: L.vfx.flames.mesh.material.uniforms.uRim.value.getHexString() };
  });
  assert.deepEqual(color, { body: 'ff3300', particles: 'ff3300' }, 'color control must update both body and particle palette');
  await section('จังหวะทดสอบ'); await number('replay.speed', 6);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('firebolt').def.speed), 6);
  await page.getByLabel('สกิลที่ปรับ', { exact: true }).selectOption('hunter_shot');
  assert.equal(await page.locator('input[data-field="fx.projectile.scale"]').count(), 2, 'fallback projectile gets controls automatically');
  await number('fx.projectile.scale', 1.8); await page.waitForTimeout(250);
  const arrow = await page.evaluate(() => { const L = window.__lab; L.preview('projectile'); L.state.paused = true; L.step(1 / 60); return [...L.vfx.projectiles.values()][0].scale.x; });
  assert.equal(arrow, 1.8, 'generic scale control must resize the real arrow');
  await shot('editor-arrow.png');
  await page.getByLabel('สกิลที่ปรับ', { exact: true }).selectOption('firebolt');
  assert.equal(await page.locator('input[type=number][data-field="fx.projectile.flowSpeed"]').inputValue(), '26');
  await page.reload(); await page.waitForFunction(() => window.__lab); await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.getElementById('info').textContent.includes('ลูกไฟ'));
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('firebolt').fx.projectile.flowSpeed), 26, 'reload restores this skill’s overrides');
  await page.getByRole('button', { name: 'ปรับเอฟเฟกต์', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกค่าปรับ', exact: true }).click();
  const file = await download; await file.saveAs(OUT + 'firebolt-settings.json');
  assert.equal(file.suggestedFilename(), 'skill-lab-firebolt.json');
  await page.locator('input[type=file]').setInputFiles({ name: 'tuning.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, skill: 'firebolt', patch: { fx: { impact: { embers: 16 } } } })) });
  await page.waitForFunction(() => window.__lab.tuning.get('firebolt').fx.impact.embers === 16);
  await page.waitForTimeout(250);
  const impact = await page.evaluate(() => { const L = window.__lab; L.preview('impact'); L.state.paused = true; for (let i = 0; i < 15; i++) L.step(1 / 60); return { projectiles: L.vfx.projectiles.size, particles: L.vfx.flames.count, active: L.vfx.active.length, v5Embers:L.vfx.active.find(a=>a.obj.userData.v5)?.obj.material.uniforms.uEmberCount.value }; });
  assert.equal(impact.projectiles, 0); assert.equal(impact.active, 1); assert.equal(impact.particles, 0); assert.equal(impact.v5Embers, 16, 'impact-only V5 preview applies the imported visible flake count');
  await shot('editor-impact.png');
  const projectile = page.locator('details').filter({ has: page.locator('summary', { hasText: 'พุ่งและหาง' }) });
  await projectile.getByRole('button', { name: 'คืนค่าช่วงนี้', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('firebolt').fx.projectile.flowSpeed), 18);
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('firebolt').fx.impact.embers), 16, 'section reset keeps other phases');
  await page.getByRole('button', { name: 'คืนค่าทั้งสกิล', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('firebolt').def.speed), 9);
  await page.getByLabel('สกิลที่ปรับ', { exact: true }).selectOption('hunter_shot');
  assert.equal(await page.evaluate(() => window.__lab.tuning.get('hunter_shot').fx.projectile.scale), 1.8, 'reset leaves the other skill’s values alone');
  await page.getByLabel('สกิลที่ปรับ', { exact: true }).selectOption('firebolt');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('#panel').evaluate((node) => { node.scrollTop = 0; });
  await page.evaluate(() => { const L = window.__lab; L.preview('projectile'); L.state.paused = true; for (let i=0;i<18;i++) L.step(1/60); });
  await shot('editor-portrait.png');
  const portraitBounds = await page.evaluate(() => { const v=window.__lab.view; return [v.hero, v.dummy].map(o=>o.position.clone().project(v.camera).x); });
  assert(portraitBounds.every(x=>Math.abs(x)<.9), 'portrait view keeps caster and target inside the stage');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'touch inspector must not overflow the viewport');
  await page.getByRole('button', { name: 'ปิดตัวปรับ', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__lab.state.reviewPhase), 'full');
  // Exercise the editor's explicit cleanup with rendered GPU resources.
  const cleanupProbe = async (cycles) => page.evaluate(async (cycles) => {
    const L=window.__lab, paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    for(let i=0;i<cycles;i++) for(const phase of ['cast','projectile','impact']) {
      L.preview(phase, false); L.state.paused=true; L.step(1/60); await paint(); L.clear(); await paint();
    }
    return L.stats().geometries;
  }, cycles);
  const warm=await cleanupProbe(1), repeated=await cleanupProbe(8);
  assert.equal(repeated, warm, 'repeated inspector previews must retain a stable geometry count');
  writeFileSync(OUT + 'report.json', JSON.stringify({ ok: !errors.length, browser: process.env.BROWSER || 'chromium', flow, color, arrow, impact, portraitBounds, cleanup:{warm,repeated}, errors }, null, 2));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('Lab editor passed: shader, colors, replay, per-skill persistence, export/import, resets, stage preview and portrait layout');
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
