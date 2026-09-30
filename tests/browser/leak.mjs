// Long-session probe: plays through the game API and samples resources that must stay flat
// (GPU geometries/textures/programs, scene objects, DOM nodes, JS heap). Growth = stutter over time.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 4183;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} if (i > 60) throw new Error('server'); await new Promise((r) => setTimeout(r, 300)); }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto(`http://localhost:${PORT}/?fresh=1&seed=3&quality=low`);
await page.waitForFunction(() => window.__frontier?.game?.time > 0.5, null, { timeout: 60000 });
const rounds = Number(process.env.ROUNDS || 8);
for (let r = 0; r < rounds; r++) {
  const s = await page.evaluate(async (r) => {
    const { game, view, input } = window.__frontier;
    input.disabled = true;
    const p = game.player;
    for (const id of Object.keys(game.data.skills.combat)) game.ch.skills[id] = 1;
    game.ch.stats.INT = 20; game.ch.stats.STR = 20;
    const kits = [['slash', 'firebolt', 'chain_spark', 'stone_burst'], ['whirl_blade', 'frost_nova', 'venom_mire', 'spirit_wolf'], ['hunter_shot', 'hex', 'war_cry', 'healing_spring']];
    kits[r % 3].forEach((id, i) => (game.ch.slots[i] = { skill: id, mods: [] }));
    game.refresh();
    const zones = [...new Set(game.data.world.spawns.map(s => s.zone))];
    const zone = zones[r % zones.length];
    const t0 = performance.now();
    for (let i = 0; i < 150; i++) {
      let near = game.monsters.filter((m) => !m.dead && !m.boss && m.zone === zone).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near && Math.hypot(near.x - p.x, near.z - p.z) > 8) { const s = game.freeSpotNear(near.x - 4, near.z); p.x = s.x; p.z = s.z; }
      if (near) { game.setAimPoint(near.x, near.z); p.mp = p.maxMp; for (let k = 0; k < 4; k++) { p.cooldowns[k] = 0; game.castSlot(k, { x: near.x, z: near.z }); } }
      p.hp = p.maxHp;
      await new Promise((res) => setTimeout(res, 40));
    }
    const info = view.renderer.info;
    let objs = 0; const live = new Set(); view.scene.traverse((o) => { objs++; if (o.geometry) live.add(o.geometry); });
    let pooled = 0; for (const pool of view.rigPool?.values() || []) for (const rig of pool) rig.root.traverse((o) => { if (o.geometry && !live.has(o.geometry)) { live.add(o.geometry); pooled++; } });
    return { zone, secs: ((performance.now() - t0) / 1000).toFixed(0), geo: info.memory.geometries, liveGeo: live.size, pooledGeo: pooled, tex: info.memory.textures, prog: info.programs.length, objs, dom: document.getElementsByTagName('*').length, heapMB: performance.memory ? (performance.memory.usedJSHeapSize / 1e6).toFixed(0) : '?', calls: info.render.calls, fps: window.__frontier.fps, kills: game.stats.kills, drops: game.drops.length, mviews: view.monsterViews.size, vfx: view.vfx.active?.length };
  }, r);
  console.log(JSON.stringify(s));
}
await browser.close();
process.kill(-server.pid);
