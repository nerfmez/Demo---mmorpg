// The UI reviews (journal, workspaces) inspect panels with the game paused. Under software GL the
// 3D scene is redrawn at 1-3 fps even then, and every Playwright action (tap, screenshot) waits on
// animation frames, so one tap cost ~3 s in Chromium and the job hit its 18 minute limit. Keep one
// finished frame behind the panels and stop redrawing the scene; the HUD and panels still update.
export async function freezeScene(page) {
  await page.evaluate(() => {
    const view = window.__frontier?.view;
    if (!view) return; // the offline harness has no renderer
    view.render(0, performance.now() / 1000, {});
    view.render = () => {};
  });
}
