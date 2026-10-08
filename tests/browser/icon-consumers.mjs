// Registered item PNG bytes: actual inventory/craft/skills/atlas/quest/HUD/loot
// consumers, across desktop/iPad/phone layouts. No combat/world journey needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RASTER_ICONS } from '../../src/ui/raster-icons.js';
import { ART } from '../../src/ui/art.js';
import { withAffectedRuntime } from './affected-runtime.mjs';

const expected = Object.keys(RASTER_ICONS).filter(key => /^(gear|material|arrow|skill)\//.test(key));
const dimensions = Object.fromEntries(JSON.parse(readFileSync(new URL('../../docs/icon-assets-manifest.json', import.meta.url)))
  .verified_assets.map(asset => [asset.key, asset.dimensions]));

await withAffectedRuntime('icons', async ({ page, name, height, width, activate, shot }) => {
  const seen = new Set();
  await page.evaluate(() => {
    const { game: g } = __frontier;
    for (const stat in g.ch.stats) g.ch.stats[stat] = 30;
    for (const base of Object.keys(g.data.items.gearBases))
      if (!g.ch.gear.some(item => item.base === base)) g.ch.gear.push({ uid: g.ch.nextUid++, base, grade: 'C', upgrade: 0, options: [] });
    for (const id of Object.keys(g.data.items.materials)) g.ch.materials[id] = 30;
    for (const id of Object.keys(g.data.skills.combat)) g.ch.skills[id] = 1;
    g.ch.movementSkills = Object.keys(g.data.skills.movement);
    g.refresh();
  });
  const decode = async label => {
    const images = await page.locator('.art > img').evaluateAll(async es => {
      await Promise.all(es.map(el => el.decode()));
      return es.map(el => ({ key: el.parentElement.dataset.art, width: el.naturalWidth, height: el.naturalHeight }));
    });
    for (const image of images) {
      assert.ok(image.width > 0 && image.height > 0, `${name}/${label}/${image.key} decodes`);
      if (expected.includes(image.key)) {
        assert.ok(dimensions[image.key], `routable item ${image.key} has declared native dimensions`);
        assert.deepEqual([image.width, image.height], dimensions[image.key], `${name}/${label}/${image.key} decodes at native dimensions`);
      }
      seen.add(image.key);
    }
  };
  const workspacePages = async label => {
    for (let n = 0; ; n++) {
      assert.ok(n < 20, 'pagination must terminate');
      await decode(`${label}-${n}`);
      await shot(`${label}-${n}`);
      const next = page.locator('#atelier [data-action="next"]');
      if (await next.isDisabled()) break;
      // Portrait has the authored rotation prompt. Exercise its hidden library
      // decoding through the real handler; do not claim portrait hit coverage.
      if (height > width) await next.evaluate(el => el.click());
      else await activate('#atelier [data-action="next"]');
    }
  };
  await page.evaluate(() => __frontier.panels.open('bag'));
  if (height > width) assert.equal(await page.locator('#atelier .rotate-message').isVisible(), true);
  await workspacePages('bag-gear');
  const category = page.locator('#atelier [data-action="bag-category"][data-id="material"]');
  if (height > width) await category.evaluate(el => el.click());
  else await activate('#atelier [data-action="bag-category"][data-id="material"]');
  await workspacePages('bag-material');
  for (const view of ['skills', 'movement']) {
    await page.evaluate(view => __frontier.panels.open(view), view);
    await workspacePages(view);
  }
  for (const category of ['weapon', 'armor', 'charm', 'skill', 'movement', 'arrow']) {
    await page.evaluate(category => {
      __frontier.panels.sel.craft = category;
      __frontier.panels.sel.craftRecipe = null;
      __frontier.panels.open('craft');
    }, category);
    await decode(`craft-${category}`);
    await shot(`craft-${category}`);
  }
  for (const view of ['growth', 'journal', 'map']) {
    await page.evaluate(view => __frontier.panels.open(view), view);
    await decode(view); await shot(view);
  }
  const hud = await page.evaluate(async ({ raster, vector }) => {
    const f = __frontier, g = f.game, keys = [];
    f.panels.close();
    for (const [kind, defs] of [['combat', g.data.skills.combat], ['movement', g.data.skills.movement]]) {
      for (const id of Object.keys(defs)) {
        if (kind === 'combat') g.ch.slots[0] = { skill: id, mods: [] }; else g.ch.movement = id;
        g.refresh(); f.input.refreshButtons();
        const button = kind === 'combat' ? f.input.buttons[0] : f.input.moveBtn;
        const key = `skill/${id}`;
        const image = button.querySelector(raster.includes(key) ? '.art > img' : '.art > svg');
        if (!image || image.parentElement.dataset.art !== key) throw Error(`HUD missing icon ${id}`);
        if (raster.includes(key)) await image.decode();
        else if (!vector.includes(id) || image.getAttribute('viewBox') !== '0 0 128 128' || !image.querySelector('path,circle,ellipse'))
          throw Error(`HUD missing authored vector icon ${id}`);
        const r = image.getBoundingClientRect(), b = button.getBoundingClientRect();
        if (r.width < 16 || r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1)
          throw Error(`HUD clipped icon ${id}`);
        keys.push(image.parentElement.dataset.art);
      }
    }
    return keys;
  }, { raster: Object.keys(RASTER_ICONS), vector: Object.keys(ART.skill) });
  hud.forEach(key => seen.add(key)); await shot('hud');
  const loot = await page.evaluate(async registered => {
    const f = __frontier, g = f.game;
    const definitions = [
      ...Object.keys(g.data.items.materials).filter(item => registered.includes(`material/${item}`)).map(item => ({ item })),
      ...g.ch.gear.filter(gear => registered.includes(`gear/${gear.base}`)).map(gear => ({ item: gear.base, gear })),
    ];
    g.drops = definitions.map((drop, i) => ({ ...drop, id: 5000 + i, n: 1, x: g.player.x + i % 8, z: g.player.z + Math.floor(i / 8) }));
    f.view.syncDrops(0, g.time + 1);
    const sprites = [...f.view.dropViews.values()].map(view => view.children[0]);
    for (let i = 0; i < 200 && sprites.some(sprite => !sprite.material.map.image?.complete); i++)
      await new Promise(resolve => setTimeout(resolve, 25));
    if (sprites.some(sprite => !sprite.material.map.image?.complete)) throw Error('Ground loot textures did not finish loading');
    await Promise.all(sprites.map(sprite => sprite.material.map.image.decode()));
    const keys = sprites.map(sprite => {
      const image = sprite.material.map.image;
      if (!sprite.material.userData.shared || !image.naturalWidth || !image.src.includes('/assets/icons/')) throw Error('Missing shared loot PNG');
      return image.src.split('/assets/icons/')[1].replace(/\.png$/, '');
    });
    f.view.renderer.render(f.view.scene, f.view.camera);
    return keys;
  }, expected);
  loot.forEach(key => seen.add(key)); await shot('ground-loot');
  await page.evaluate(() => {
    const f = __frontier;
    f.game.drops = []; f.view.syncDrops(0, f.game.time + 2);
    if (f.view.dropViews.size) throw Error('Ground loot did not clear');
  });
  assert.deepEqual(expected.filter(key => !seen.has(key)), [], 'every routable PNG has an actual consumer');
});
