// Shared focused regression used by the normal UX gate and isolated upgrade capture.
// Fixtures provide state; every purchase uses the actual click/tap controls.
import assert from 'node:assert/strict';

export async function verifyUpgradeServices(page, { activate, touch, capture = async () => {}, reload }) {
  const baseline = await page.evaluate(() => {
    const { game: g, panels: p } = __frontier;
    return { character: g.snapshot(), position: [g.player.x, g.player.z], selection: structuredClone(p.sel) };
  });
  const services = await page.evaluate(() => {
    const t = __frontier.game.data.world.town;
    return [['workbench', t.workbench], ['trainer', t.trainer], ...(t.skillUpgradeStations || []).map((pos, i) => ['workshop-' + i, pos])];
  });
  const fixture = async (pos, change = {}) => page.evaluate(({ pos, change }) => {
    const { game: g, panels: p } = __frontier;
    p.close();
    g.ch.gold = change.gold ?? 1213;
    g.ch.materials.skill_crystal = change.crystals ?? 3;
    Object.assign(g.ch.stats, { DEX: change.dex ?? 8, VIT: 5, STR: 5 });
    g.ch.skills.slash = 1;
    g.ch.mods = [{ uid: 9001, id: 'multistrike', level: change.level ?? 1 }, { uid: 9002, id: 'life_leech', level: 1 }];
    for (const slot of g.ch.slots) slot.mods = [];
    [g.player.x, g.player.z] = pos;
    g.refresh(); p.sel.growthKind = 'mod'; p.open('growth');
  }, { pos, change });
  const repeatSelector = '[data-act="mod-up"][data-uid="9001"]';
  const repeatCard = () => page.locator('.seeker-growth-grid > .card').filter({ has: page.locator(repeatSelector) });
  const values = () => page.evaluate(() => {
    const ch = __frontier.game.ch;
    return { mod: ch.mods.find(m => m.uid === 9001).level, skill: ch.skills.slash, gold: ch.gold, crystals: ch.materials.skill_crystal };
  });
  try {
    for (const [name, pos] of services) {
      await fixture(pos);
      const repeat = page.locator(repeatSelector);
      assert.equal(await repeat.isEnabled(), true, name + ': funded Repeat Slash button is enabled');
      assert.match(await repeatCard().locator('[data-growth-status]').innerText(), /พร้อมอัปเกรด/);
      const leech = page.locator('[data-act="mod-up"][data-uid="9002"]');
      assert.equal(await leech.isDisabled(), true);
      assert.match(await leech.locator('..').locator('[data-growth-status]').innerText(), /VIT 7/);
      await repeat.scrollIntoViewIfNeeded();
      await capture('upgrade-service-' + name);
      const bounds = await repeat.boundingBox();
      await activate(repeatSelector);
      assert.deepEqual(await values(), { mod: 2, skill: 1, gold: 1173, crystals: 1 });
      // A second real tap at the same location cannot charge for the next blocked rank.
      const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      assert.deepEqual(await values(), { mod: 2, skill: 1, gold: 1173, crystals: 1 });
      await activate('.panel-close');
      await page.evaluate(() => __frontier.panels.open('growth'));
      assert.equal(await page.locator(repeatSelector).isDisabled(), true);
      assert.match(await repeatCard().innerText(), /Lv\.2/);
      // The same service also accepts skills, using their existing data-driven cost.
      await activate('[data-act="growth-filter"][data-id="skill"]');
      const cost = await page.evaluate(() => {
        const step = __frontier.game.data.progression.skillUpgrade.steps[0];
        return { gold: step.gold, crystals: step.skill_crystal };
      });
      await activate('[data-act="skill-up"][data-skill="slash"]');
      assert.deepEqual(await values(), { mod: 2, skill: 2, gold: 1173 - cost.gold, crystals: 1 - cost.crystals });
    }
    if (reload) {
      const paid = await values();
      // Save the actual purchased result as an isolated browser fixture, then use native Continue.
      await page.evaluate(() => {
        localStorage.setItem('frontier.slot.3', JSON.stringify({ version: 2, savedAt: Date.now(), character: __frontier.game.snapshot() }));
        localStorage.setItem('frontier.lastSlot', '3');
      });
      await reload();
      assert.deepEqual(await values(), paid, 'purchased ranks and exact payments survive reload');
    }
    const away = await page.evaluate(() => __frontier.game.data.world.town.centre);
    await fixture(away);
    assert.equal(await page.locator(repeatSelector).isDisabled(), true);
    assert.match(await repeatCard().locator('[data-growth-status]').innerText(), /ต้องอยู่ใกล้จุดคราฟต์หรือครูฝึก/);
    assert.doesNotMatch(await repeatCard().innerText(), /พร้อมอัปเกรด/);
    const trainer = services.find(([name]) => name === 'trainer')[1];
    // A stale enabled control must still respect the handler's live service check.
    for (const kind of ['mod', 'skill']) {
      await fixture(trainer);
      if (kind === 'skill') await activate('[data-act="growth-filter"][data-id="skill"]');
      const selector = kind === 'mod' ? repeatSelector : '[data-act="skill-up"][data-skill="slash"]';
      assert.equal(await page.locator(selector).isEnabled(), true);
      const before = await values();
      await page.evaluate(pos => { [__frontier.game.player.x, __frontier.game.player.z] = pos; }, away);
      await activate(selector);
      assert.deepEqual(await values(), before, kind + ': handler refuses stale enabled button outside services');
      assert.match(await page.locator('.result-pop').innerText(), /กลับจุดคราฟต์หรือครูฝึก/);
    }
    for (const change of [{ dex: 7 }, { gold: 39 }, { crystals: 1 }]) {
      await fixture(trainer, change);
      assert.equal(await page.locator(repeatSelector).isDisabled(), true);
      assert.doesNotMatch(await repeatCard().innerText(), /พร้อมอัปเกรด/);
    }
    await fixture(trainer, { level: 3 });
    assert.equal(await page.locator(repeatSelector).count(), 0, 'maximum-rank mod has no purchase button');
  } finally {
    await page.evaluate(baseline => {
      const { game: g, panels: p } = __frontier;
      p.close(); g.ch = baseline.character; [g.player.x, g.player.z] = baseline.position;
      p.sel = baseline.selection; g.refresh();
    }, baseline);
  }
}
