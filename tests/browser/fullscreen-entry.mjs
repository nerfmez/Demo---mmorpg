// Exercise the real entry gesture; unsupported/denied browsers use the visible
// product fallback rather than silently bypassing the gate in a test fixture.
export async function enterFullscreenGate(page) {
  const before = await page.evaluate(() => window.__frontier?.fullscreen?.snapshot());
  if (!before?.blocked) return before;
  await page.locator(before.supported ? '.fullscreen-enter' : '.fullscreen-fallback').click();
  await page.waitForFunction(() => !__frontier.fullscreen.snapshot().pending);
  if (await page.evaluate(() => __frontier.fullscreen.blocked)) {
    await page.locator('.fullscreen-fallback').click();
  }
  await page.waitForFunction(() => !__frontier.fullscreen.blocked);
  return page.evaluate(() => __frontier.fullscreen.snapshot());
}
