// Shared setup for focused cases against the exact downloaded/built root game.
import { completeOpeningUi } from './opening-helper.mjs';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { enterFullscreenGate } from './fullscreen-entry.mjs';
import { freezeScene } from './freeze-scene.mjs';

export const AFFECTED_VIEWPORTS = [
  ['desktop', 1600, 900, false], ['ipad', 1180, 820, true],
  ['phone-landscape', 844, 390, true], ['phone-portrait', 390, 844, true],
];

export async function withAffectedRuntime(suite, inspect, { saved = false, reduced = false } = {}) {
  assert.ok(!process.env.QUICK && !process.env.SKIP_CAPTURES, 'Focused cases retain every viewport and capture');
  const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
  const port = suite === 'icons' ? 4241 : 4242, base = `http://localhost:${port}/`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'],
    { stdio: 'ignore', detached: true });
  let browser;
  const out = `tests/browser/out/affected-${suite}-${engine.name()}/`;
  mkdirSync(out, { recursive: true });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      if (i > 60) throw Error('Affected runtime preview startup');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await engine.launch({ executablePath: engine === chromium ? process.env.CHROMIUM_EXECUTABLE : undefined,
      args: engine === chromium ? ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
    const cases = reduced ? [...AFFECTED_VIEWPORTS, ['phone-reduced', 390, 844, true, true]] : AFFECTED_VIEWPORTS;
    for (const [name, width, height, touch, reduce] of cases) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
        reducedMotion: reduce ? 'reduce' : 'no-preference' });
      try {
        const page = await context.newPage(), errors = [];
        page.setDefaultTimeout(90000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
        });
        const activate = selector => touch ? page.locator(selector).first().tap() : page.locator(selector).first().click();
        const ready = () => page.waitForFunction(() => window.__frontier?.modelsReady && __frontier.game?.time > .3);
        await page.goto(`${base}?${saved ? '' : 'fresh=1&'}quality=low&seed=7&stream=0`);
        if (saved) {
          await enterFullscreenGate(page);
          await activate('[data-act="new"]');
          await page.locator('#heroName').fill('Affected quest check');
          await activate('[data-act="start"]');
        }
        await ready();
        if (saved) await completeOpeningUi(page, activate, { kit: 'bow' });
        await page.evaluate(() => { __frontier.paused = true; __frontier.input.reset(); });
        // Hold the completed backdrop while testing paused UI. RAF, input and
        // preview rendering stay live; the separate boot gate proves real draws.
        await freezeScene(page);
        console.log(`START affected ${suite} ${engine.name()} ${name}`);
        const shot = label => page.screenshot({ path: `${out}${name}-${label}.png` });
        await inspect({ page, context, name, width, height, touch, activate, ready, shot });
        assert.deepEqual(errors, [], `${engine.name()}/${name} page errors`);
        console.log(`PASS affected ${suite} ${engine.name()} ${name}`);
      } finally { await context.close(); }
    }
  } finally {
    await browser?.close();
    try { process.kill(-server.pid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
