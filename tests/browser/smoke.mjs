// Browser smoke test: builds nothing, serves dist/ with `vite preview`, loads the game in
// Chromium (desktop + iPad-sized touch), checks for errors, plays a little through the
// game's own API and saves screenshots to tests/browser/out/.
// Screenshot waits allow slow software-GL shader compilation on CI; all gameplay assertions stay unchanged.
// Usage: npm run build && npm run test:browser  (BROWSER=webkit to use WebKit if installed)
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4178;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
};
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 60) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 300));
}

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ channel: engine === chromium ? 'chromium' : undefined, executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures++;
};

async function run(name, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  // Character start compiles the live scene synchronously on software GL.
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  // ---- title screen -> new character -> game, then continue from the save ----
  await page.goto(`http://localhost:${PORT}/?quality=low`);
  await page.waitForSelector('.menu-layer.on .title-card', { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ timeout: 90000, path: `${OUT}${name}-0-title.png` });
  await page.click('[data-act="new"]');
  await page.waitForSelector('.create-panel');
  await page.fill('#heroName', 'Aki');
  await page.click('[data-act="kit"][data-kit="bow"]');
  await page.click('[data-act="look"][data-key="hairStyle"][data-val="ponytail"]');
  await page.waitForTimeout(500);
  await page.screenshot({ timeout: 90000, path: `${OUT}${name}-0-create.png` });
  console.log(`${name}: creator ready; starting character`);
  await page.click('[data-act="start"]', { noWaitAfter: true });
  await page.waitForFunction(() => window.__frontier.game && window.__frontier.game.time > 0.3, null, { timeout: 30000 });
  const started = await page.evaluate(() => {
    const g = window.__frontier.game;
    return { name: g.ch.name, weapon: g.derived.weaponType, hair: g.ch.appearance?.hairStyle, saved: !!localStorage.getItem('frontier.slot.1') };
  });
  check(started.name === 'Aki' && started.weapon === 'bow' && started.hair === 'ponytail', `${name}: character creation applies name, kit and look (${JSON.stringify(started)})`);
  check(started.saved, `${name}: new character is saved to slot 1`);
  await page.evaluate(() => {
    const g = window.__frontier.game;
    g.ch.gold = 777;
    window.__frontier.save();
  });
  await page.reload();
  await page.waitForSelector('[data-act="continue"]', { timeout: 30000 });
  await page.click('[data-act="continue"]');
  await page.waitForFunction(() => window.__frontier.game && window.__frontier.game.time > 0.2, null, { timeout: 30000 });
  const cont = await page.evaluate(() => ({ name: window.__frontier.game.ch.name, gold: window.__frontier.game.ch.gold }));
  check(cont.name === 'Aki' && cont.gold === 777, `${name}: continue loads the saved character (${JSON.stringify(cont)})`);
  check(errors.length === 0, `${name}: menu flow has no page errors ${errors.slice(0, 3).join(' | ')}`);

  // ---- a fresh, unsaved game for the rest ----
  await page.goto(`http://localhost:${PORT}/?fresh=1&seed=5&quality=low`);
  await page.waitForFunction(() => window.__frontier && window.__frontier.game && window.__frontier.game.time > 0.5, null, { timeout: 30000 });
  check(errors.length === 0, `${name}: no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.waitForTimeout(800);
  await page.screenshot({ timeout: 90000, path: `${OUT}${name}-1-beach.png` });

  if (contextOpts.hasTouch) {
    // the visible joystick must be touchable: a touch on it reaches the joystick zone and walks
    const joy = await page.evaluate(async () => {
      const f = window.__frontier;
      const el = document.querySelector('.joy');
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const opts = (x, y) => ({ pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true });
      hit.dispatchEvent(new PointerEvent('pointerdown', opts(cx, cy)));
      hit.dispatchEvent(new PointerEvent('pointermove', opts(cx + 60, cy)));
      await new Promise((res) => setTimeout(res, 50));
      f.input.update();
      const moveX = f.game.input.moveX;
      hit.dispatchEvent(new PointerEvent('pointerup', opts(cx + 60, cy)));
      f.input.update();
      return { hit: hit.className, moveX, released: f.game.input.moveX };
    });
    check(joy.hit === 'joyzone', `${name}: touching the drawn joystick hits the joystick zone (${joy.hit})`);
    check(joy.moveX > 0.5 && joy.released === 0, `${name}: joystick drag walks right, release stops (${joy.moveX.toFixed(2)})`);
    const ta = await page.evaluate(() => getComputedStyle(document.querySelector('.sbtn.attack')).touchAction);
    check(ta === 'none', `${name}: buttons block double-tap zoom (touch-action ${ta})`);
  }

  // ---- fight in the meadow through the game API ----
  const res = await page.evaluate(async () => {
    const { game, input } = window.__frontier;
    input.disabled = true;
    const p = game.player;
    p.x = -70;
    p.z = 10;
    const t0 = game.time;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let casts = 0;
    for (let i = 0; i < 100; i++) {
      const near = game.monsters.filter((m) => !m.dead && !m.boss && m.zone === 'meadow').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (near) {
        if (Math.hypot(near.x - p.x, near.z - p.z) > 9) {
          // test harness: hop next to the next monster instead of walking
          const s = game.freeSpotNear(near.x - 4, near.z);
          p.x = s.x;
          p.z = s.z;
        }
        game.setMove(0, 0);
        game.setAimPoint(near.x, near.z);
        if (game.castSlot(1)) casts++;
        if (game.castSlot(0)) casts++;
        if (p.hp < p.maxHp * 0.4) p.hp = p.maxHp;
      }
      // software GL renders slowly here, so step the simulation directly (1/10 s per loop)
      for (let k = 0; k < 6; k++) game.update(1 / 60);
      await wait(30);
    }
    return { gameTime: game.time - t0, kills: game.stats.kills, dealt: game.stats.damageDealt, casts, level: game.ch.level, quest: game.ch.progress.quests.m_boars };
  });
  console.log(`     gameTime=${res.gameTime.toFixed(1)}s casts=${res.casts} dealt=${res.dealt} kills=${res.kills} lv=${res.level} quest=${JSON.stringify(res.quest)}`);
  check(res.dealt > 0, `${name}: skills hit monsters`);
  check(res.kills > 0, `${name}: monsters die and drop loot`);
  check(res.quest && res.quest.progress > 0, `${name}: kills advance the boar side quest`);
  await page.screenshot({ timeout: 90000, path: `${OUT}${name}-2-meadow.png` });
  // monsters outside the camera are not drawn (view.js culls them); every one on screen must be
  const cull = await page.evaluate(() => {
    const v = window.__frontier.view;
    const P = v.camera.position.clone();
    let hidden = 0, missed = 0;
    for (const mv of v.monsterViews.values()) {
      P.copy(mv.rig.root.position).project(v.camera);
      if (!mv.rig.root.visible) hidden++;
      if (Math.abs(P.x) < 1 && Math.abs(P.y) < 1 && P.z < 1 && !mv.rig.root.visible) missed++;
    }
    return { total: v.monsterViews.size, hidden, missed };
  });
  check(cull.missed === 0, `${name}: every monster on screen is drawn (${JSON.stringify(cull)})`);

  // ---- every panel opens without errors (craft needs the workbench) ----
  await page.evaluate(() => {
    const { game, world } = window.__frontier;
    const [x, z] = world.data.town.workbench;
    const s = game.freeSpotNear(x + 2, z);
    game.player.x = s.x;
    game.player.z = s.z;
  });
  for (const t of ['char', 'skills', 'job', 'bag', 'craft', 'journal', 'map', 'settings']) {
    await page.evaluate((tab) => window.__frontier.panels.open(tab), t);
    await page.waitForTimeout(150);
    const shown = await page.evaluate(() => window.__frontier.panels.tab);
    check(shown === t, `${name}: panel ${t} opens`);
    if (['skills', 'bag', 'craft', 'journal', 'map'].includes(t)) await page.screenshot({ timeout: 90000, path: `${OUT}${name}-3-${t}.png` });
  }
  await page.evaluate(() => window.__frontier.panels.close());

  // ---- waypoints: touching one unlocks it, the map teleports there ----
  const tp = await page.evaluate(() => {
    const { game, world } = window.__frontier;
    const wp = world.waypoints.find((w) => w.id === 'meadow');
    const s = game.freeSpotNear(wp.x + 1.5, wp.z);
    game.player.x = s.x;
    game.player.z = s.z;
    for (let k = 0; k < 20; k++) game.update(1 / 60);
    const unlocked = game.isWaypointUnlocked('meadow');
    [game.player.x, game.player.z] = game.data.world.playerSpawn;
    for (const m of game.monsters) m.aggro = false;
    const r = game.teleportTo('meadow');
    return { unlocked, ok: r.ok, d: Math.hypot(game.player.x - wp.x, game.player.z - wp.z) };
  });
  check(tp.unlocked && tp.ok && tp.d < 6, `${name}: waypoint unlocks and fast travel works (${JSON.stringify(tp)})`);

  // ---- terrain: the hero stands on the ground on high and low places ----
  const terrainSpots=await page.evaluate(()=>{
    const w=window.__frontier.world;
    const wp=w.waypoints.find(p=>p.id==='forest');
    const deck=w.docks.find(d=>!d.rampFromTerrain && (!d.kind || d.kind==='pier'));
    return [
      ['headland',...w.data.harbor.lighthouse],
      ['highlands',...w.zoneById('highlands').label],
      ['forest',wp.x,wp.z],
      ['coast',...w.zoneById('coast').label],
      ['pier',deck.x,deck.z],
    ];
  });
  for (const [label, x, z] of terrainSpots) {
    await page.evaluate(
      ([x, z]) => {
        const { game, view } = window.__frontier;
        const s = game.freeSpotNear(x, z);
        game.player.x = s.x;
        game.player.z = s.z;
        game.player.hp = game.player.maxHp;
        view.snapCamera();
      },
      [x, z]
    );
    // Entering a new tile can compile shaders before the next software-GL frame.
    await page.waitForFunction(() => {
      const {game,view,world}=window.__frontier;
      return Math.abs(view.hero.root.position.y-world.groundY(game.player.x,game.player.z))<.3;
    }, null, {timeout:60000});
    const hy = await page.evaluate(() => {
      const { game, view, world } = window.__frontier;
      return { hero: view.hero.root.position.y, ground: world.groundY(game.player.x, game.player.z) };
    });
    check(Math.abs(hy.hero - hy.ground) < 0.3, `${name}: hero stands on the terrain at ${label} (${hy.hero.toFixed(2)} vs ${hy.ground.toFixed(2)})`);
    await page.screenshot({ timeout: 90000, path: `${OUT}${name}-5-${label}.png` });
  }
  const fps = await page.evaluate(() => window.__frontier.fps);
  console.log(`     fps(software GL, not a device measure)=${fps}`);
  check(errors.length === 0, `${name}: still no page errors ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

// the opt-in VRM hero (?hero=vrm) loads, is driven by the animator and renders
async function vrmHero() {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(`http://localhost:${PORT}/?fresh=1&seed=5&quality=medium&hero=vrm`);
  await page.waitForFunction(() => window.__frontier && window.__frontier.game && window.__frontier.game.time > 0.5, null, { timeout: 60000 });
  const info = await page.evaluate(async () => {
    const { game, view } = window.__frontier;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    game.setMove(1, 0);
    for (let k = 0; k < 40; k++) game.update(1 / 30);
    await wait(500);
    const body = view.hero.skin?.body;
    let skinned = 0, tris = 0;
    body?.traverse((o) => {
      if (o.isSkinnedMesh) {
        skinned++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      }
    });
    const head = body?.getObjectByName('J_Bip_C_Head');
    const hips = body?.getObjectByName('J_Bip_C_Hips');
    const h = head && hips ? head.getWorldPosition(head.position.clone()).y - hips.getWorldPosition(hips.position.clone()).y : 0;
    return { skinned, tris, h, face: typeof view.hero.setFace };
  });
  check(info.skinned >= 6 && info.tris > 10000, `vrm hero: skinned meshes load (${JSON.stringify(info)})`);
  check(info.h > 0.4, `vrm hero: head stays above the hips while running (${info.h.toFixed(2)} m)`);
  check(info.face === 'function', 'vrm hero: has an expression switch');
  check(errors.length === 0, `vrm hero: no page errors ${errors.slice(0, 3).join(' | ')}`);
  await page.screenshot({ path: `${OUT}vrm-hero.png` });
  await ctx.close();
}

try {
  await run('desktop', { viewport: { width: 1600, height: 900 } });
  await run('ipad', { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await vrmHero();
} finally {
  await browser.close();
  stopServer();
}
console.log(failures ? `${failures} FAILED` : 'ALL OK');
process.exit(failures ? 1 : 0);

