// Ordinary title creation grants only the weapon normal attack.
export async function completeOpeningUi(page, activate, { kit = 'bow' } = {}) {
  await page.waitForSelector('[data-act="wake"]', { timeout: 60000 });
  await activate('[data-act="wake"]');
  await page.waitForSelector(`[data-act="kit"][data-kit="${kit}"]`, { timeout: 15000 });
  await activate(`[data-act="kit"][data-kit="${kit}"]`);
  await activate('[data-act="finish"]');
  await page.waitForFunction(() => window.__frontier.game.ch.opening.stage === 'done', null, { timeout: 15000 });
}
