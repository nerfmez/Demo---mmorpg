import {installLearnedLoadout} from './learned-loadout.mjs';
// Real menu actions and interrupted touch gestures, including narrow phone layouts.
// Run after building: npm run test:ux (BROWSER=webkit for Safari's engine).
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { verifyUpgradeServices } from './upgrade-service-checks.mjs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4182;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
    if (i > 60) throw new Error('Preview server did not start');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  for (const [name, width, height, touch] of [
    ['desktop', 1600, 900, false], ['ipad', 1180, 820, true],
    ['phone-landscape', 844, 390, true], ['phone-portrait', 390, 844, true],
  ]) {
    if(process.env.QUICK&&name!=='ipad')continue;
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000); // the title waits behind the loading screen while the resident world is prepared
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.addInitScript(() => localStorage.setItem('frontier-demo.questCollapsed', 'false'));
    await page.goto(`http://localhost:${PORT}/?fresh=1&quality=low&seed=7`);
    await page.waitForFunction(() => window.__frontier?.game?.time > 0.3, null, { timeout: 90000 });
    await installLearnedLoadout(page);
    await page.evaluate(() => {
      const f = window.__frontier;
      f.paused = true;
      f.hud.el.zone.style.opacity = 0;
      document.querySelector('.banner')?.remove();
    });
    const activate = async (selector) => {
      const tab=selector.match(/^\[data-tab="([^"\]]+)"\]$/)?.[1];
      // a page outside the open page's group is reached through the main menu (covered by menu-hub.mjs)
      if(tab&&(await page.locator('#atelier').isVisible()||!await page.locator(`[data-tab="${tab}"]`).count()))return page.evaluate(tab=>__frontier.panels.open(tab),tab);
      if(selector==='.panel-close'&&await page.locator('#atelier').isVisible())selector='#atelier [data-action="close"]';
      if(tab&&width<=700)return page.locator('[data-page-select]').selectOption(tab);
      return touch ? page.locator(selector).tap() : page.locator(selector).click();
    };
    const shot = (label) => page.screenshot({ path: `${OUT}ux-${name}-${label}.png` });
    const onscreen = async (selector) => page.locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return r.width >= 34 && r.height >= 34 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.contains(hit);
    });
    assert.equal(await page.locator('.quest-collapse').getAttribute('aria-expanded'), 'true', 'stored false must keep quest expanded');
    await activate('.quest-collapse');
    assert.equal(await page.evaluate(() => localStorage.getItem('frontier-demo.questCollapsed')), 'true');
    await activate('.quest-collapse');
    for (const sel of ['.pframe', '.minimap', '.quick-actions [aria-label="กระเป๋า"]', '.quick-actions [aria-label="สกิล"]', '.menu-toggle', '.sbtn.attack', '.sbtn.s1', '.sbtn.s2', '.sbtn.s3', '.sbtn.move']) {
      assert.ok(await onscreen(sel), `${name}: ${sel} must be visible and unobstructed`);
    }
    await shot('hud');

    await activate('.menu-toggle');
    assert.equal(await page.locator('#panel-title').textContent(), 'เมนูหลัก');
    assert.equal(await page.locator('.hub-tile[data-go]').count(), 12, 'every page has one tile in the main menu');
    await activate('.hub-tile[data-go="journal"]');
    assert.equal(await page.locator('#panel-title').textContent(), 'ภารกิจ');
    assert.equal(await page.locator('[data-tab]').count(), 2, 'the sidebar lists only the open page\'s group');
    assert.ok(await onscreen('.panel-back'), name + ': back to the main menu is reachable');
    if(width<=700)assert.ok(await onscreen('[data-page-select]'));else for(const tab of ['journal','map']) { assert.ok(await onscreen(`[data-tab="${tab}"]`),name+': navigation visible'); }
    const beforeJournalTabs = await page.evaluate(() => JSON.stringify(__frontier.game.snapshot()));
    assert.ok(await page.locator('.qj-card[data-quest-id="h_slimes"][data-quest-status="active"] [data-art="monster/salt_slime"]').count(), 'the current shore mission uses its authored artwork');
    await activate('[data-act="quest-mode"][data-id="optional"]');
    await activate('.quest-journey details:has([data-quest-id="m_boars"]) > summary');
    assert.ok(await page.locator('.qj-card[data-quest-id="m_boars"] [data-art="monster/tusk_boar"]').count(), 'the boar mission keeps its authored artwork in optional missions');
    assert.equal(await page.locator('.qj-card[data-quest-id="m_boars"]').getAttribute('data-quest-status'), 'locked', 'future optional work waits for the shared-road prerequisites');
    await activate('[data-act="quest-mode"][data-id="story"]');
    assert.equal(await page.evaluate(() => JSON.stringify(__frontier.game.snapshot())), beforeJournalTabs, 'browsing quest tabs never changes or pays character progress');
    await shot('journal');
    await page.locator('.pbody').evaluate((el) => el.scrollTop = el.scrollHeight);
    assert.ok(await onscreen('.panel-close'), 'close must remain reachable after scrolling');
    assert.ok(await onscreen('.panel-footer [data-close]'), 'return must remain reachable after scrolling');
    await activate('.panel-close');

    if(height>width){
      await activate('.quick-actions [aria-label="กระเป๋า"]');
      // Portrait shows one window at a time with a side switcher, not a rotate gate (as loadout-live.mjs).
      assert.equal(await page.locator('#atelier .rotate-message').isVisible(),false);
      assert.equal(await page.locator('#atelier .two-windows').isVisible(),true);
      assert.ok(await onscreen('#atelier [data-action="view-side"][data-id="right"]'),name+': portrait side switcher is reachable');
      await shot('portrait-bag');await page.keyboard.press('Escape');
      assert.deepEqual(errors,[]);await ctx.close();continue;
    }

    // Fixture supplies resources only; crafting, comparison and equipping use real controls.
    await page.evaluate(() => {
      const { game: g } = window.__frontier;
      const [x, z] = g.world.data.town.workbench;
      Object.assign(g.player, g.freeSpotNear(x + 1.5, z));
      g.ch.materials = { boar_hide: 16, boar_tusk: 8, glow_dust: 6, ruin_shard: 3 };
      g.ch.gold = 500;
      g.ch.stats.STR = 6;
      g.ch.stats.VIT = 12;
      g.refresh();
    });
    await activate('.quick-actions [aria-label="กระเป๋า"]');
    await activate('[data-action="bag-category"][data-id="material"]');
    if (!touch) assert.ok(await page.evaluate(() => !!document.activeElement.closest('#atelier')), 'category changes keep keyboard focus inside the menu');
    await activate('[data-action="material"][data-id="boar_hide"]');await activate('#atelier [data-action="details"]');
    assert.match(await page.locator('.atelier-dialog').innerText(), /ใช้คราฟต์/);
    await activate('[data-act="sell"][data-id="boar_hide"]');
    assert.equal(await page.evaluate(() => window.__frontier.game.ch.materials.boar_hide), 15);
    await activate('.atelier-dialog [data-action="cancel"]');await shot('materials');
    await activate('[data-tab="craft"]');
    await activate('[data-act="craft-filter"][data-id="armor"]');
    await activate('[data-act="craft-ready"]');
    assert.ok(await page.locator('.recipe-card').count() > 0);
    assert.equal(await page.locator('.recipe-card [data-act="craft-open"]:disabled').count(), 0);
    await activate('.recipe-pick[data-act="craft-open"][data-id="hide_vest"]');
    await activate('[data-act="craft"][data-id="hide_vest"]');
    const made = await page.evaluate(() => window.__frontier.game.ch.gear.at(-1).uid);
    await activate('[data-tab="bag"]');
    await activate('[data-action="bag-category"][data-id="gear"]');
    await activate(`[data-action="item"][data-id="${made}"]`);
    assert.ok(await page.locator('#atelier .comparison .good').count() > 0, 'new armour shows stat improvements');
    await shot('inventory');
    // The loot toast may offer the same item; test the inspected-item action.
    await activate('#atelier [data-action="equip"]');
    assert.equal(await page.evaluate(() => window.__frontier.game.ch.equipped.armor), made);
    await activate('[data-tab="craft"]');
    await activate('[data-act="craft-back"]');
    await activate('[data-act="craft-filter"][data-id="mod"]');
    await activate('.recipe-pick[data-act="craft-open"][data-id="mod_wide_arc"]');
    await activate('[data-act="craft"][data-id="mod_wide_arc"]');
    const mod = await page.evaluate(() => window.__frontier.game.ch.mods.at(-1).uid);
    await activate('[data-tab="skills"]');
    await activate('[data-action="slot"][data-id="0"]');
    await activate('.category-tabs [data-action="category"][data-id="mod"]');
    await activate(`[data-action="mod"][data-id="${mod}"]`);
    await activate('#atelier [data-action="apply"]');
    assert.ok(await page.evaluate((uid) => window.__frontier.game.ch.slots[0].mods.includes(uid), mod));
    assert.ok(await page.evaluate(() => {
      const g = window.__frontier.game;
      return g.skills[0].range > g.data.skills.combat.slash.range;
    }), 'socketed Wide Arc changes the actual compiled skill');
    await shot('skills');
    await activate('.panel-close');
    await activate('.sbtn.s3');
    assert.equal(await page.locator('#atelier .loadout-window h1').textContent(), 'ชุดสกิล');
    assert.equal(await page.locator('#atelier .skill-card.selected').getAttribute('data-target'), '3');
    const spell = await page.evaluate(() => window.__frontier.game.ch.slots[2].skill);
    await activate(`[data-action="skill"][data-id="${spell}"]`);await activate('#atelier [data-action="apply"]');await activate('.atelier-dialog [data-action="confirm"]');
    assert.equal(await page.evaluate(() => window.__frontier.game.ch.slots[3].skill), spell);
    await activate('.panel-close');

    if (!touch) {
      const charges = await page.evaluate(() => window.__frontier.game.player.movement.charges);
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(() => window.__frontier.panels.isOpen), false, 'Space after a mouse-closed menu must not reopen the focused HUD button');
      assert.equal(await page.evaluate(() => window.__frontier.game.player.movement.charges), charges - 1);
    }

    await activate('.minimap');
    const beforeTravel=await page.evaluate(()=>({x:window.__frontier.game.player.x,z:window.__frontier.game.player.z}));
    await activate('[data-act="select-zone"][data-id="azure-harbor-v1:meadow"]');
    assert.equal(await page.locator('.region-detail [data-art="monster/tusk_boar"]').count(),1);
    assert.ok(await page.locator('.region-detail [data-art="material/boar_hide"]').count());
    assert.equal(await page.locator('[data-act="teleport"][data-id="meadow"]').isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>({x:window.__frontier.game.player.x,z:window.__frontier.game.player.z})),beforeTravel,'selecting region must not travel');
    await page.evaluate(()=>{window.__frontier.game.ch.progress.waypoints.push('meadow');});
    await activate('[data-act="select-zone"][data-id="azure-harbor-v1:meadow"]');
    await shot('map');
    await activate('[data-act="teleport"][data-id="meadow"]');
    assert.equal(await page.evaluate(()=>window.__frontier.panels.isOpen),false);
    assert.ok(await page.evaluate(()=>{const g=window.__frontier.game,w=g.world.waypoints.find(p=>p.id==='meadow');return Math.hypot(g.player.x-w.x,g.player.z-w.z)<5;}));
    // Recipes may be browsed away from town, but actions remain unavailable.
    await page.evaluate(()=>window.__frontier.panels.open('craft'));
    assert.equal(await page.locator('[data-act="craft"]:not(:disabled)').count(),0);
    await activate('.panel-close');

    if (touch) {
      const gestures = await page.evaluate(() => {
        const f = window.__frontier;
        const b = f.input.buttons[3];
        const r = b.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const fire = (el, type, px = x, py = y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
        let casts = 0;
        const original = f.game.castSlot.bind(f.game);
        f.game.castSlot = (...args) => { casts++; return original(...args); };
        for (const end of ['pointercancel', 'lostpointercapture']) { fire(b, 'pointerdown'); fire(b, end); }
        fire(b, 'pointerdown'); fire(b, 'pointermove', x - 30, y - 30);
        const c = f.input.cancelEl.getBoundingClientRect();
        fire(b, 'pointermove', c.x + c.width / 2, c.y + c.height / 2);
        const cancelShown = !f.input.cancelEl.hidden && f.input.cancelEl.classList.contains('cancelled');
        fire(b, 'pointerup', c.x + c.width / 2, c.y + c.height / 2);
        const cancelledCasts = casts;
        fire(b, 'pointerdown'); fire(b, 'pointerup');
        const tappedCasts = casts;
        f.game.castSlot = original;
        const move = f.input.moveBtn;
        const charges = f.game.player.movement.charges;
        fire(move, 'pointerdown'); fire(move, 'pointercancel');
        const keptCharges = charges === f.game.player.movement.charges;
        const zone = f.input.joyZone;
        fire(zone, 'pointerdown', 70, innerHeight - 100);
        fire(zone, 'pointermove', 120, innerHeight - 100);
        f.input.update();
        const moving = f.game.input.moveX > 0;
        f.panels.open('bag');
        f.input.update();
        f.panels.close();
        return { cancelShown, cancelledCasts, tappedCasts, keptCharges, moving, stopped: f.game.input.moveX === 0 && f.input.joy.id === null };
      });
      assert.deepEqual(gestures, { cancelShown: true, cancelledCasts: 0, tappedCasts: 1, keptCharges: true, moving: true, stopped: true });
    } else {
      await page.keyboard.down('w');
      await page.keyboard.press('i');
      await page.keyboard.up('w');
      await page.locator('#atelier button:not(:disabled)').last().focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#atelier button:not(:disabled)')), true, 'Tab wraps inside the actual workspace');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__frontier.panels.isOpen), false);
      assert.equal(await page.evaluate(() => window.__frontier.game.input.moveZ), 0);
    }
    if(width<=700){
      await page.evaluate(()=>{
        const f=window.__frontier,g=f.game,[x,z]=g.world.data.town.workbench;
        Object.assign(g.player,g.freeSpotNear(x+1.5,z));
        g.ch.materials={boar_hide:1};
        f.panels.open('bag');
      });
      await activate('[data-action="bag-category"][data-id="material"]');
      await activate('[data-action="material"][data-id="boar_hide"]');await activate('#atelier [data-action="details"]');
      await activate('[data-act="sell"][data-id="boar_hide"]');
      assert.match(await page.locator('#atelier .empty-selection').innerText(),/ยังไม่มีวัตถุดิบ/);
      assert.ok(await page.locator('#atelier .inventory-grid').isVisible(),'selling the last stack returns to the empty bag');
      await activate('.panel-close');
    }
    await verifyUpgradeServices(page, { activate, touch, capture: shot, reload: async () => {
      const url = new URL(page.url()); url.searchParams.delete('fresh');
      await page.goto(url.href); await enterFullscreenGate(page);
      await activate('[data-act="continue"]');
      await page.waitForFunction(() => __frontier.game?.time > .3 && document.getElementById('loading').classList.contains('done'), null, { timeout: 90000 });
      await page.evaluate(() => { __frontier.paused = true; });
    } });
    assert.deepEqual(errors, [], `${name}: page errors`);
    console.log(`ok ${name}: HUD, persistent close, crafting, gear comparison/equip, sockets, empty skill slot, interrupted input`);
    await ctx.close();
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
