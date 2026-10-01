// Focused Firebolt VFX review: real cast -> projectile travel -> real monster impact.
// Uses fixed simulation stepping so Chromium/WebKit CI capture comparable phases.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = `tests/browser/out/firebolt-${engine.name()}/`;
mkdirSync(out, { recursive: true });
const port = 4189;
const base = `http://localhost:${port}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
let browser;
const errors = [];

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i > 80) throw Error('preview server unavailable');
    await new Promise(r => setTimeout(r, 250));
  }

  browser = await engine.launch({
    args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, hasTouch: true, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__fireboltFreeze) cb(t); });
  });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() === 'error' && !/favicon\.ico|fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('response', r => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(base + '?fresh=1&seed=9&quality=high');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > .3);

  await page.evaluate(() => {
    const f = window.__frontier, g = f.game;
    window.__fireboltFreeze = true;
    f.input.reset();
    f.input.disabled = true;
    f.paused = true;
    g.spawnPoints = [];

    const spot = g.freeSpotNear(-82, 0);
    const p = g.player;
    p.x = spot.x; p.z = spot.z; p.facing = 0;
    p.hp = p.maxHp; p.mp = 999;

    g.ch.skills.firebolt = Math.max(1, g.ch.skills.firebolt || 0);
    g.ch.stats.INT = Math.max(12, g.ch.stats.INT || 0);
    g.ch.slots[0] = { skill: 'firebolt', mods: [] };
    g.refresh();
    p.mp = 999;

    const target = g.monsters.find(m => !m.dead && m.type === 'tusk_boar') || g.monsters.find(m => !m.dead);
    if (!target) throw Error('no target monster');
    g.monsters = [target];
    target.x = p.x;
    target.z = p.z + 5.2;
    target.homeX = target.x;
    target.homeZ = target.z;
    target.dead = false;
    target.hp = target.maxHp;
    target.aggro = true;
    target.targetUnit = p;
    target.state = 'stunned';
    target.stateT = 0;
    target.stateDur = 999;
    target.facing = Math.PI;
    p.targetId = target.id;

    f.view.zoom = 0.62;
    f.view.snapCamera();
    f.fireboltEvents = [];
    f.fireboltRender = f.view.render.bind(f.view);
    f.fireboltStep = (seconds, stopOnImpact = false) => {
      for (let t = 0; t < seconds - 1e-8; t += 1 / 60) {
        g.update(1 / 60);
        const events = g.drainEvents();
        for (const e of events) {
          if (e.type === 'castStart' || e.type === 'projectile' || e.type === 'impact' || e.type === 'projectileEnd') {
            f.fireboltEvents.push({ type: e.type, kind: e.kind, t: g.time });
          }
          f.view.handleEvent(e);
        }
        f.fireboltRender(1 / 60, g.time, {});
        if (stopOnImpact && f.fireboltEvents.some(e => e.type === 'impact' && e.kind === 'firebolt')) break;
      }
    };
    f.fireboltSnapshot = () => {
      const pr = g.projectiles.find(q => q.kind === 'firebolt');
      const visual = pr && f.view.vfx.projectiles.get(pr.id);
      return {
        time: g.time,
        projectiles: g.projectiles.filter(q => q.kind === 'firebolt').length,
        decorated: !!visual?.userData?.firebolt,
        fxParticles: f.view.vfx.fx.count,
        dustParticles: f.view.vfx.dust.count,
        events: f.fireboltEvents.slice(),
        targetHp: target.hp,
        targetMaxHp: target.maxHp,
      };
    };
    f.paused = false;
    if (!g.castSlot(0)) throw Error('Firebolt castSlot(0) failed');
  });

  const capture = async name => {
    await page.evaluate(() => window.__frontier.view.renderer.getContext().finish());
    await page.screenshot({ path: out + name + '.png', timeout: 90000 });
    console.log('FIREBOLT CAPTURE', engine.name(), name);
  };

  await page.evaluate(() => __frontier.fireboltStep(0.10));
  const cast = await page.evaluate(() => __frontier.fireboltSnapshot());
  assert(cast.events.some(e => e.type === 'castStart' && e.kind === 'projectile'), 'castStart did not reach renderer');
  assert.equal(cast.projectiles, 0, 'Firebolt should still be charging at cast capture');
  await capture('01-cast');

  await page.evaluate(() => __frontier.fireboltStep(0.18));
  const travel = await page.evaluate(() => __frontier.fireboltSnapshot());
  assert.equal(travel.projectiles, 1, 'Firebolt projectile did not spawn');
  assert.equal(travel.decorated, true, 'Firebolt did not use the layered projectile visual');
  assert(travel.fxParticles > 0, 'Firebolt travel emitted no pooled trail particles');
  await capture('02-travel');

  await page.evaluate(() => __frontier.fireboltStep(0.6, true));
  const impact = await page.evaluate(() => __frontier.fireboltSnapshot());
  assert(impact.events.some(e => e.type === 'impact' && e.kind === 'firebolt'), 'real Firebolt hit did not emit impact');
  assert(impact.targetHp < impact.targetMaxHp, 'Firebolt impact did not damage the real target');
  await capture('03-impact');

  assert.deepEqual(errors, [], 'browser errors: ' + errors.join('\n'));
  console.log('FIREBOLT REVIEW OK', engine.name(), JSON.stringify({ cast, travel, impact }));
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
