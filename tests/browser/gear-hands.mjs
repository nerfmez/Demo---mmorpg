// Two hands, gloves, shields and arrows in the real game (touch): the hero model holds what
// the save says, the equipment screen shows seven slots and a hand choice, arrows count down
// on the skill button and are crafted from the bag outside town. Screenshots for review.
// Usage after a build: node tests/browser/gear-hands.mjs   (BROWSER=webkit for the iPad engine)
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = new URL(`./out/gear-hands-${engine.name()}/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 4211, url = `http://localhost:${port}/?fresh=1&quality=low&seed=5&stream=0`;
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  if (i > 60) throw Error('gear-hands server startup');
  await new Promise((r) => setTimeout(r, 250));
}
const browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined, args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true })).newPage();
const errors = [];
page.setDefaultTimeout(90000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: out + name + '.png' });
// Give items, equip through the core and let the view rebuild the hero.
const dress = (list) => page.evaluate((list) => {
  const { game: g } = window.__frontier, ch = g.ch;
  for (const s of Object.keys(ch.stats)) ch.stats[s] = 60;
  for (const [base, slot] of list) {
    const item = { uid: ch.nextUid++, base, itemLevel: g.data.items.gearBases[base].itemLevel, grade: 'B', upgrade: 0, options: [] };
    ch.gear.push(item);
    const r = window.__frontier.equip(ch, g.data, item.uid, slot);
    if (!r.ok) throw Error(base + ' ' + r.reason);
  }
  g.refresh();
  g.monsters = [];
  return window.__frontier.game.gearLook();
}, list);
const closeUp = async (name, angle = 0) => {
  await page.evaluate((a) => { const f = window.__frontier; f.game.player.facing = a; f.view.zoom = 0.3; f.view.snapCamera(); }, angle);
  await page.waitForTimeout(900);
  await page.screenshot({ path: out + name + '.png', clip: { x: 390, y: 210, width: 400, height: 400 } });
};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.__frontier?.game?.time > 0.3 && document.getElementById('loading').classList.contains('done'));
  await page.evaluate(() => document.querySelector('.banner')?.remove());
  assert.ok(await page.evaluate(() => typeof window.__frontier.equip === 'function'), 'equip is exposed for the test');

  // Shield + heavy one-hand weapon + gloves.
  let look = await dress([['beetle_maul', 'weapon'], ['crag_tower_shield', 'offhand'], ['crag_gauntlets', 'gloves']]);
  assert.deepEqual([look.weapon, look.offhand, look.gloves], ['mace', 'shield', 'plate']);
  await page.waitForFunction(() => window.__frontier.view.hero?.offhandKind === 'shield');
  await closeUp('01-mace-shield-gloves', 0.6);
  // Dual wielding two light weapons.
  look = await dress([['tusk_blade', 'weapon'], ['fang_dagger', 'offhand']]);
  assert.deepEqual([look.weapon, look.offhand], ['sword', 'dagger']);
  await page.waitForFunction(() => window.__frontier.view.hero?.offhandKind === 'dagger');
  await closeUp('02-dual-wield', 0.6);
  // Bow: arrows in the left hand, counted on the skill button and spent per shot.
  look = await dress([['hunter_bow', 'weapon']]);
  assert.equal(look.offhand, 'quiver');
  await page.waitForFunction(() => window.__frontier.view.hero?.offhandKind === 'quiver');
  await closeUp('03-bow-quiver', 2.6);
  const before = await page.evaluate(() => {
    const f = window.__frontier, g = f.game;
    g.ch.slots[0] = { skill: 'hunter_shot', mods: [] };
    g.refresh();
    return Object.values(g.ch.arrows.stock).reduce((a, n) => a + n, 0);
  });
  await page.waitForFunction((n) => window.__frontier.input.buttons[0].querySelector('.skill-cost').textContent.includes('➶' + n), before);
  await page.locator('.sbtn').first().tap();
  await page.waitForFunction((n) => window.__frontier.input.buttons[0].querySelector('.skill-cost').textContent.includes('➶' + (n - 1)), before);

  // Equipment screen: seven slots, the arrows in the left hand, the power score.
  await page.evaluate(() => window.__frontier.panels.open('bag'));
  await page.waitForSelector('#atelier .wear-offhand');
  assert.equal(await page.locator('#atelier .wear-slot').count(), 7);
  assert.match(await page.locator('#atelier .wear-offhand .ammo-count').innerText(), /^\d+$/);
  assert.match(await page.locator('#atelier .character-stats .power b').innerText(), /^[\d,]+$/);
  // A light weapon offers both hands; selling/salvaging is for town only.
  const sword = await page.evaluate(() => window.__frontier.game.ch.gear.find((i) => i.base === 'tusk_blade').uid);
  await page.locator(`#atelier [data-action="item"][data-id="${sword}"]`).tap();
  assert.equal(await page.locator('#atelier .hand-choice [data-action="equip"]').count(), 2);
  const inTown = await page.evaluate(() => window.__frontier.game.nearby().inTown);
  assert.equal(await page.locator('#atelier [data-action="sell-gear"]').isDisabled(), !inTown, 'sell/salvage only in town');
  await page.waitForTimeout(400);
  await shot('04-equipment-seven-slots');
  // Short landscape (phone): four slots per column must not overlap.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  const boxes = await page.locator('#atelier .wear-slot').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1], 'slots overlap ' + JSON.stringify([a, b]));
  await shot('04b-equipment-phone');
  await page.setViewportSize({ width: 1180, height: 820 });
  // The left-hand arrows open a chooser: pick which stocked arrows to shoot, or craft more.
  await page.evaluate(() => { window.__frontier.game.ch.arrows.stock.tusk_arrow = 30; window.__frontier.panels.loadout.render(); });
  await page.locator('#atelier .wear-offhand').tap();
  await page.locator('.atelier-dialog [data-action="use-arrow"][data-id="tusk_arrow"]').tap();
  assert.equal(await page.evaluate(() => window.__frontier.game.ch.arrows.use), 'tusk_arrow');
  await page.locator('#atelier .wear-offhand').tap();
  await page.locator('.atelier-dialog [data-action="arrow-craft"]').tap();
  await page.waitForSelector('[data-act="craft-open"][data-id="arrows_feather"]');
  await page.evaluate(() => { const ch = window.__frontier.game.ch; ch.materials.shore_feather = 10; ch.gold += 100; });
  await page.locator('.recipe-pick[data-act="craft-open"][data-id="arrows_feather"]').tap();
  const stock = await page.evaluate(() => Object.values(window.__frontier.game.ch.arrows.stock).reduce((a, n) => a + n, 0));
  await page.locator('[data-act="craft-arrows"][data-id="arrows_feather"]').tap();
  await page.waitForFunction((n) => Object.values(window.__frontier.game.ch.arrows.stock).reduce((a, k) => a + k, 0) > n, stock);
  await shot('05-arrows-crafted');
  // A gear drop on the ground glows in its grade colour and is picked up into the bag.
  await page.locator('.panel-close').first().tap().catch(() => {});
  await page.evaluate(() => { const f = window.__frontier; f.panels.close?.(); });
  const dropped = await page.evaluate(() => {
    const f = window.__frontier, g = f.game, p = g.player;
    g.monsters = [];
    g.drops.push({ id: g.newId(), item: 'gear', gear: { base: 'kite_shield', itemLevel: 11, grade: 'S', upgrade: 0, options: [] }, qty: 1, x: p.x + 2.2, z: p.z + 0.6, t: -999 });
    f.view.zoom = 0.4; f.view.snapCamera();
    return g.ch.gear.length;
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '06-gear-drop.png' });
  await page.evaluate(() => { const g = window.__frontier.game, d = g.drops.find((x) => x.item === 'gear'); d.t = 1; g.player.x = d.x; g.player.z = d.z; });
  await page.waitForFunction((n) => window.__frontier.game.ch.gear.length === n + 1, dropped);
  assert.equal(await page.evaluate(() => window.__frontier.game.ch.gear.at(-1).base), 'kite_shield');
  assert.deepEqual(errors, []);
  console.log('PASS gear hands', engine.name());
} finally {
  await browser.close();
  process.kill(-server.pid);
}
