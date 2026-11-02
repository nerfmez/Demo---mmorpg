// Focused capture for the defensive line and companion fetch (2026-11-02): the marsh wisp's fire orb, statuses
// on the hero (burn, shock, root, chill) and a companion carrying a drop back. node tests/browser/defense-line.mjs [outDir]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const S = process.argv[2] || 'tests/browser/out/defense-line', port = 4191, base = `http://localhost:${port}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: '/home/user/Demo---mmorpg', stdio: 'ignore', detached: true });
mkdirSync(S + '/shots', { recursive: true });
const errors = [];
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 80) throw Error('no server'); await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { const raf = requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { if (!window.__freeze) cb(t); }); });
  console.log('loading'); await page.goto(base + '?fresh=1&load=dev&quality=low&seed=4');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > 0.3, null, { timeout: 120000 });
  await page.evaluate(() => {
    const f = window.__frontier, g = f.game; window.__freeze = true; f.paused = true; f.input?.reset?.(); if (f.input) f.input.disabled = true;
    g.spawnPoints = []; g.monsters = []; g.isSafe = () => false;
    const p = g.player;
    // outside the safe settlement, on open ground (monsters never attack inside it)
    for (let r = 6; r < 200; r += 4) { let done = false; for (let a = 0; a < 6.28 && !done; a += 0.4) { const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; if (!g.world.isSafe(x, z) && [[0, 0], [7, 1], [-6, 4], [5, -6], [-7, -3], [0, 9]].every(([ox, oz]) => g.world.isFree(x + ox, z + oz, 2.5) && !g.world.isSafe(x + ox, z + oz))) { p.x = x; p.z = z; done = true; } } if (done) break; }
    p.hp = p.maxHp = 1e6;
    f.snap = () => { f.view.heroY = f.view.world.groundY(p.x, p.z); f.view.camTarget.set(p.x, f.view.heroY, p.z); };
    f.snap();
    f.step = (sec) => { for (let t = 0; t < sec - 1e-8; t += 1 / 60) { g.update(1 / 60); for (const e of g.drainEvents()) f.view.handleEvent(e); f.view.syncMonsters?.(1 / 60, g.time); f.view.vfx?.update?.(1 / 60); } f.view.render(Math.min(1, sec), g.time, {}); f.hud?.update(0, { interact() {} }); }; // the view turns and eases by the time stepped
    f.step(0.1);
  });
  console.log('ready');
  // 1) the marsh wisp's fire orb
  const orb = await page.evaluate(() => {
    const f = window.__frontier, g = f.game, p = g.player;
    const w = g.spawnMinion('marsh_wisp', 8, p.x + 6.5, p.z + 1); w.aggro = true; w.state = 'chase'; w.targetUnit = p; w.cd.orb = 0; w.cd.blink = 99; w.damage = 1;
    for (let i = 0; i < 400 && !g.projectiles.some((q) => q.owner === 'monster'); i++) f.step(1 / 60);
    f.step(0.12);
    const pr = g.projectiles.find((q) => q.owner === 'monster');
    return pr ? { element: pr.element, attack: pr.attack, state: w.state } : { none: true, state: w.state };
  });
  await page.screenshot({ path: `${S}/shots/1-wisp-fire-orb.png`, timeout: 120000 }); console.log('orb', JSON.stringify(orb));
  // 2) statuses on the hero: burn from the orb, shock from a rune sentinel beam, root from the mole
  const st = await page.evaluate(() => {
    const f = window.__frontier, g = f.game, p = g.player;
    g.rng = { ...g.rng, chance: () => true };
    const foe = (type) => ({ kind: 'monster', id: 99999, type, def: g.data.monsters.monsters[type], x: p.x + 3, z: p.z, statuses: {}, buffs: {}, dead: false });
    g.damagePlayer(300, foe('marsh_wisp'), { attack: 'orb' });
    g.damagePlayer(300, foe('rune_sentinel'), { attack: 'beam' });
    g.damagePlayer(300, foe('rootdigger_mole'), { attack: 'erupt' });
    g.damagePlayer(300, foe('salt_slime'), { attack: 'salt_spit' });
    f.step(0.2);
    return Object.keys(p.statuses);
  });
  await page.screenshot({ path: `${S}/shots/2-hero-statuses.png`, timeout: 120000 }); console.log('statuses', JSON.stringify(st));
  // 3) companion fetch: call the hound, drop gold away from the hero, watch it carry
  const carry = await page.evaluate(() => {
    const f = window.__frontier, g = f.game, p = g.player;
    g.monsters = []; p.statuses = {};
    const def = g.data.skills.combat.call_companion;
    g.ch.skills.call_companion = 1; g.ch.slots[1] = { skill: 'call_companion', mods: [] };
    g.derived.weaponType = 'bow'; g.refreshSkills();
    g.ch.jobNodes = [...g.ch.jobNodes, 'rj']; g.refresh(); g.derived.weaponType = 'bow'; g.refreshSkills();
    g.spawnAllies(g.skills[1], p.x + 1.5, p.z);
    const a = g.allies.find((q) => q.companion); if (a) a.arriveT = 0;
    // a drop on open ground the companion can run to: 7-10 m from the hero, free and outside the settlement
    let dx = 0, dz = 0;
    for (let a = 0; a < 6.28 && !dx; a += 0.3) for (const r of [8, 7, 9, 10]) { const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; let ok = !g.world.isSafe(x, z); for (let k = 1; k <= 8 && ok; k++) ok = g.world.isFree(p.x + (x - p.x) * k / 8, p.z + (z - p.z) * k / 8, 0.7); if (ok) { dx = x; dz = z; break; } }
    g.drops.push({ id: g.newId(), item: 'gold', qty: 25, x: dx || p.x + 7, z: dz || p.z, t: 5 });
    let carried = false, frames = 0;
    for (; frames < 600; frames++) { f.step(1 / 60); if (g.drops.some((d) => d.carrier != null)) { carried = true; break; } }
    f.step(0.5);
    return { companion: !!a, carried, frames, carrying: g.drops.some((d) => d.carrier != null) };
  });
  await page.screenshot({ path: `${S}/shots/3-companion-carry.png`, timeout: 120000 });
  console.log(JSON.stringify({ orb, st, carry, errors: errors.slice(0, 5) }));
} finally { await browser?.close(); try { process.kill(-server.pid); } catch {} }
