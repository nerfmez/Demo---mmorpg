// The quest portion of UX plus real saved tracking/HUD/reload integration.
// Full ux.mjs is unchanged and still runs in every full regression.
import assert from 'node:assert/strict';
import { withAffectedRuntime } from './affected-runtime.mjs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';

await withAffectedRuntime('quests', async ({ page, name, activate, ready, shot }) => {
  const snapshot = () => page.evaluate(() => __frontier.game.snapshot());
  await activate('.menu-toggle');
  await activate('.hub-tile[data-go="journal"]');
  assert.equal(await page.locator('#panel-title').textContent(), 'ภารกิจ');
  const before = await snapshot();
  assert.equal(await page.locator('.qj-card[data-quest-id="h_slimes"][data-quest-status="active"] [data-art="monster/salt_slime"]').count(), 1);
  await shot('story');
  await activate('[data-act="quest-mode"][data-id="optional"]');
  await activate('.quest-journey details:has([data-quest-id="m_boars"]) > summary');
  assert.equal(await page.locator('.qj-card[data-quest-id="m_boars"] [data-art="monster/tusk_boar"]').count(), 1);
  assert.equal(await page.locator('.qj-card[data-quest-id="m_boars"]').getAttribute('data-quest-status'), 'locked');
  await shot('optional');
  await activate('[data-act="quest-mode"][data-id="history"]');
  await shot('history');
  await activate('[data-act="quest-mode"][data-id="story"]');
  for (const id of await page.locator('[data-act="quest-chapter"]').evaluateAll(es => es.map(el => el.dataset.id)))
    await activate(`[data-act="quest-chapter"][data-id="${id}"]`);
  assert.deepEqual(await snapshot(), before, 'reading modes/chapters never spends, moves or pays progress');
  await page.evaluate(() => { __frontier.panels.sel.questChapter = null; __frontier.panels.render(); });
  await activate('[data-act="quest-track"][data-id="h_slimes"]');
  const tracked = await snapshot();
  assert.equal(tracked.progress.questJournal.trackedId, 'h_slimes');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('frontier.slot.1')).character);
  assert.equal(saved.progress.questJournal.trackedId, 'h_slimes', 'real panel callback persists tracking');
  for (const key of ['gold', 'gear', 'mods', 'materials', 'stats', 'skills', 'jobNodes', 'jobPoints'])
    assert.deepEqual(tracked[key], before[key], `${key} retained while tracking`);
  const bounds = await page.locator('.quest-journey').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(bounds.scroll <= bounds.width + 1, `${name}: quest journal fits horizontally`);
  await activate('.panel-close');
  assert.equal(await page.evaluate(() => __frontier.panels.isOpen), false);
  assert.equal(await page.locator('.field-quest-row.tracked').count(), 1);
  await shot('tracked-hud');
  await page.reload();
  await enterFullscreenGate(page);
  await activate('[data-act="continue"]');
  await ready();
  await page.evaluate(() => { __frontier.paused = true; });
  assert.equal((await snapshot()).progress.questJournal.trackedId, 'h_slimes');
  await page.evaluate(() => __frontier.panels.open('journal'));
  assert.equal(await page.locator('[data-act="quest-track"][data-id="h_slimes"]').getAttribute('aria-pressed'), 'true');
  await activate('[data-act="quest-auto"]');
  assert.equal((await snapshot()).progress.questJournal.trackedId, null);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('frontier.slot.1')).character.progress.questJournal.trackedId), null);
  await shot('reloaded-auto');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __frontier.panels.isOpen), false);
}, { saved: true, reduced: true });
