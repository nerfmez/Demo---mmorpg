// Walks a new character through the opening (wake, weapon, starter skill, movement skill) with taps/clicks.
export async function completeOpeningUi(page, activate, { kit = 'bow', movement = 'roll', skill = null } = {}) {
  await page.waitForSelector('[data-act="wake"]', { timeout: 60000 });
  await activate('[data-act="wake"]');
  await page.waitForSelector(`[data-act="kit"][data-kit="${kit}"]`, { timeout: 15000 });
  await activate(`[data-act="kit"][data-kit="${kit}"]`);
  await activate('[data-act="to-skills"]');
  await activate(skill ? `[data-act="skill"][data-id="${skill}"]` : '[data-act="skill"] >> nth=0');
  await activate(`[data-act="move"][data-id="${movement}"]`);
  await activate('[data-act="finish"]');
  await page.waitForFunction(() => window.__frontier.game.ch.opening.stage === 'done', null, { timeout: 15000 });
}
