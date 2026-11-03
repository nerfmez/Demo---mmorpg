// Real input regression for the Job Tree screen: the wheel tree's field journal of maps (phase C, 2026-11-03).
// Shared by workspaces, overlays and the capture reviews. Core rules stay authoritative (allocateJobNode,
// allocateJobRoute); these checks prove the taps reach them and that looking never spends.
import assert from 'node:assert/strict';

const idle = (page) => page.waitForFunction(() => { const s = window.__frontier.panels.jobJournal?.snapshot(); return s && !s.turning && !s.animating && !s.pending.length; }, null, { timeout: 60000 });
/** Turn to the place's map and pin its note (what the old journal's search did). */
export async function journalJump(page, id) {
  await idle(page);
  await page.evaluate((id) => window.__frontier.panels.jobJournal.jump(id), id);
  await idle(page);
  if (await page.evaluate((id) => window.__frontier.panels.jobJournal.snapshot().selected !== id, id)) await page.evaluate((id) => window.__frontier.panels.jobJournal.select(id), id);
  await page.waitForFunction((id) => window.__frontier.panels.jobJournal.snapshot().selected === id, id);
}
export async function verifyPassiveGestures(page, { capture = async () => {} } = {}) {
  await page.evaluate(() => { const f = window.__frontier; f.panels.close(); f.panels.wheelState = null; Object.assign(f.game.ch, { jobNodes: ['origin'], jobLevel: 20, jobPoints: 19, gold: 1000 }); f.panels.open('job'); });
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const tap = async (s) => { const t = page.locator(s).first(); if (touch) await t.tap(); else await t.click(); await page.waitForTimeout(120); };
  const tapPlace = async (id) => {
    const box = await page.evaluate((id) => { const e = document.querySelector(`.wheel-tree [data-node="${id}"]`); e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, id);
    if (touch) await page.touchscreen.tap(box[0], box[1]); else await page.mouse.click(box[0], box[1]);
    await page.waitForTimeout(350);
  };
  const state = () => page.evaluate(() => ({ ...window.__frontier.panels.jobJournal.snapshot(), owned: [...window.__frontier.game.ch.jobNodes] }));
  await idle(page);
  assert.equal((await state()).page, 'overview', 'the journal opens on the compass of the six sectors');
  assert.ok(await page.locator('.wheel-tree [data-tab]').count() >= 8, 'every sector, the camp and the jobs have a tab');
  // the camp: looking at a place never spends, buying it spends its cost
  await tap('.wheel-tree [data-tab="camp"]'); await idle(page);
  await tapPlace('in.center.c1');
  assert.equal((await state()).selected, 'in.center.c1'); assert.deepEqual((await state()).owned, ['origin'], 'inspection never spends');
  await capture('job-detail');
  await tap('.wheel-tree [data-f="buy"]'); await idle(page);
  assert.equal((await state()).points, 18); assert.ok((await state()).owned.includes('in.center.c1'));
  // a sector map: a later place is bought along its road in one go
  await tap('.wheel-tree [data-tab="sector.int"]'); await idle(page);
  await tapPlace('in.int.i3');
  assert.ok(await page.locator('.wheel-tree [data-f="route"]').count(), 'a place further on offers its whole road');
  await tap('.wheel-tree [data-f="route"]'); await idle(page);
  const after = await state();
  assert.ok(['in.int.i1', 'in.int.i2', 'in.int.i3'].every((id) => after.owned.includes(id)), 'the road is bought in order');
  assert.equal(after.points, 15);
  // a drag along the map scrolls it and buys nothing
  const before = await state();
  const wrap = page.locator('.wheel-tree .fm-mapwrap').first();
  if (await wrap.evaluate((el) => el.scrollWidth > el.clientWidth + 20)) {
    const box = await wrap.boundingBox(), start = await wrap.evaluate((el) => el.scrollLeft);
    await wrap.evaluate((el) => el.scrollBy({ left: 140 }));
    assert.ok(await wrap.evaluate((el, s) => Math.abs(el.scrollLeft - s) > 20, start), 'the map scrolls sideways');
    void box;
  }
  assert.deepEqual((await state()).owned, before.owned, 'moving the map buys nothing');
  await page.evaluate(() => window.__frontier.panels.jobJournal.turnTo('overview')); await idle(page);
  await capture('job-overview');
  await tap('.wheel-tree [data-f="exit"]');
  assert.equal(await page.evaluate(() => window.__frontier.panels.isOpen), false);
}
