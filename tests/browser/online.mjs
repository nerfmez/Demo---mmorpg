// Local-only focused online gate + real protocol peer + production actor/asset review.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'vite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createPresenceServer } from '../../server/presence.mjs';
import { loadData } from '../../src/core/data-node.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const origin = 'http://127.0.0.1:4173', root = new URL('../../', import.meta.url).pathname;
const out = resolve(root, 'tests/browser/out/online'); mkdirSync(out, { recursive: true });
const data = loadData(), [x, z] = data.maps['moonroot-grove-v1'].playerSpawn;
const compiled = await build({ configFile: false, logLevel: 'error', define: { 'import.meta.env.VITE_PLAYER_HARNESS': 'true', 'import.meta.env.VITE_PRESENCE_URL': '""' }, build: { write: false, minify: false, lib: { entry: resolve(root, 'tests/browser/online-harness.js'), name: 'OnlineReview', formats: ['iife'] } } });
const files = compiled[0].output, code = files.find(o => o.type === 'chunk').code;
let css = [...readFileSync(resolve(root, 'index.html'), 'utf8').matchAll(/href="(\/src\/ui\/[^\"]+\.css)"/g)].map(m => readFileSync(resolve(root, m[1].slice(1)), 'utf8')).join('\n');
css += files.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => o.source).join('\n');
const html = '<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><body><canvas id="game"></canvas><div id="hud"></div><div id="loading"><div class="load-sub"></div></div></body></html>';
// Begin with a local rejecting service to exercise Failed without contacting any hosting service.
const rejected = createServer(); rejected.on('upgrade', (_, s) => setTimeout(() => s.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'), 600));
rejected.listen(0, '127.0.0.1'); await once(rejected, 'listening'); const port = rejected.address().port;
const web = createServer((req,res) => {
  if (req.url === '/online-review.html') { res.writeHead(200,{'Content-Type':'text/html'}); return res.end(html); }
  const file = resolve(root, 'public', '.' + new URL(req.url, origin).pathname);
  if (!file.startsWith(resolve(root,'public')+'/')) { res.writeHead(404); return res.end(); }
  try { const body=readFileSync(file); res.writeHead(200,{'Content-Type':({'.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary'})[extname(file)]||'application/octet-stream'}); res.end(body); } catch { res.writeHead(404); res.end(); }
});
web.listen(4173,'127.0.0.1'); await once(web,'listening');
let app, peer, browser; const report = { sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], screenshots: [], errors: [], external: [] };
const ok = (name, evidence) => { report.checks.push({ name, evidence }); console.log('PASS', name, JSON.stringify(evidence ?? '')); };
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true }); const page = await context.newPage();
  page.on('pageerror', e => { report.errors.push(String(e)); console.error('pageerror',String(e)); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console',m.text()); if (m.type() === 'error' && /THREE|shader|WebGL/.test(m.text())) report.errors.push(m.text()); });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (['http:','https:'].includes(u.protocol) && u.origin !== origin) { report.external.push(u.origin); return route.abort(); } return route.continue(); });
  await page.goto(origin + '/online-review.html'); await page.addStyleTag({ content: css });
  await page.evaluate(port => { window.__onlineEndpoint = `ws://127.0.0.1:${port}/presence`; }, port);
  await page.addScriptTag({ content: code });
  async function capture(name) { const file = resolve(out, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push({ file: name + '.png', sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }); }
  await page.evaluate(() => __online.seedSave());
  assert.equal(await page.evaluate(() => __online.worldBuilds), 0); await capture('connecting-tablet'); ok('Connecting precedes world construction');
  await page.waitForFunction(() => __online.player.client.status === 'failed');
  assert.equal(await page.evaluate(() => __online.readSave().character.gold), 1234);
  assert.equal(await page.evaluate(() => __online.worldBuilds), 0); assert.equal(await page.locator('[data-retry]').isVisible(), true);
  await capture('failed-tablet'); ok('Failed/Retry keep world unconstructed and offline entry explicit');
  await new Promise(r => rejected.close(r)); app = createPresenceServer({ origins: [origin] }); app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  await page.locator('[data-retry]').tap();
  try { await page.waitForFunction(() => __online.ready, null, { timeout: 20000 }); } catch(e) { console.error('DIAGNOSTIC',await page.evaluate(()=>({status:__online.player.client.status, connected:__online.player.client.connected, builds:__online.worldBuilds, transitions:__online.transitions, body:document.body.innerText}))); await capture('fixture-failure'); throw e; }
  await page.waitForFunction(() => __online.player.client.status === 'online');
  assert.equal(await page.evaluate(() => __online.worldBuilds), 1); ok('Retry handshake admits player before constructing one fixture world');
  peer = new WebSocket(`ws://127.0.0.1:${port}/presence`, { origin }); const messages = []; peer.on('message', b => messages.push(JSON.parse(b))); await once(peer, 'open');
  const take = async type => { for (let i = 0; i < 300; i++) { const n = messages.findIndex(m => m.type === type); if (n >= 0) return messages.splice(n, 1)[0]; await new Promise(r => setTimeout(r, 10)); } throw Error('missing ' + type); };
  const look = { hairStyle: 'swept', hair: '#3b2a20', skin: '#f6d2b5', eyes: '#3a6ad0', scarf: '#cf3a30', tunic: '#f1e3cc' };
  let gear = { weapon: 'rusty_sword', offhand: null, armor: 'ranger_coat', helm: 'ranger_hood', gloves: 'brigand_gloves', boots: 'trail_boots' };
  const pose = { x: x + 1, z, facing: .3, moving: false };
  peer.send(JSON.stringify({ type: 'join', map: 'moonroot-grove-v1', room: 'lobby', pose, look, gear })); const welcome = await take('welcome');
  await page.waitForFunction(() => __online.presence.actors.actors.size === 1);
  await page.waitForFunction(() => { const a = [...__online.presence.actors.actors.values()][0]; return a.rig.hairsample && a.rig.importedWeapon; }, null, { timeout: 10000 });
  await capture('remote-ranger-sword'); ok('Real relay peer renders current main outfit and imported sword');
  let seq = 0;
  const action = async (skill, duration, phase = 'cast') => {
    await page.evaluate(() => { __online.freeze = true; });
    peer.send(JSON.stringify({ type: 'action', action: { seq: ++seq, skill, phase, angle: .3, duration, step: 0 } }));
    await page.waitForFunction(skill => [...__online.presence.actors.actors.values()][0].animator.action && [...__online.presence.actors.actors.values()][0].pending?.action.skill === skill, skill);
    await page.evaluate(seconds => __online.sampleAction(seconds), duration + .025);
  };
  await action('slash', .18); await capture('remote-slash-hit');
  const slash = await page.evaluate(() => { const a = [...__online.presence.actors.actors.values()][0]; return { pose: a.animator.action.name, effects: __online.presence.actors.effects.active.length }; }); assert.equal(slash.effects, 1); ok('Matching melee pose and authored cut at the bounded cast hit time', slash);
  peer.send(JSON.stringify({ type: 'action', action: { seq, skill: 'slash', phase: 'cast', angle: .3, duration: .18, step: 0 } }));
  await page.waitForTimeout(120); assert.equal(await page.evaluate(() => __online.presence.actors.effects.active.length), 1); ok('Duplicate action creates no second effect');
  await page.evaluate(() => { __online.freeze = false; }); await page.waitForTimeout(650);
  gear = { ...gear, weapon: 'wisp_staff', armor: 'sporeweave_vest', boots: 'moonleaf_slippers', gloves: 'sporeweave_gloves', helm: 'spore_hood' };
  peer.send(JSON.stringify({ type: 'appearance', look, gear }));
  await page.waitForFunction(() => { const a = [...__online.presence.actors.actors.values()][0]; return a.gear.bases.weapon === 'wisp_staff' && a.rig.importedWeapon; });
  await action('firebolt', .22); await capture('remote-firebolt');
  await page.evaluate(() => { __online.freeze = false; }); await page.waitForTimeout(650);
  await action('frost_nova', .25); await page.evaluate(() => __online.sampleAction(.18)); await capture('remote-frost');
  ok('Appearance replacement and staff fire/frost use current known assets and authored poses');
  await page.evaluate(() => { __online.freeze = false; }); await page.waitForTimeout(800);
  // Focused resource samples after warmup: same actor/effect replacement cycle, no long world run.
  const samples = [];
  for (let round = 0; round < 3; round++) {
    await action('firebolt', .22); await page.evaluate(() => __online.sampleAction(1.6));
    samples.push(await page.evaluate(() => ({ geometry: __online.view.renderer.info.memory.geometries, textures: __online.view.renderer.info.memory.textures, effects: __online.presence.actors.effects.active.length })));
    await page.waitForTimeout(200);
  }
  assert.equal(samples[2].geometry, samples[1].geometry); assert.equal(samples[2].textures, samples[1].textures); assert.ok(samples.every(s => s.effects === 0)); ok('Focused resource ownership stabilises after effects expire', samples);
  // Existing responsive placement in production UI, now with required online controls.
  const bounds = [];
  for (const [width, height] of [[1024,768],[760,430]]) {
    await page.setViewportSize({width,height}); await page.locator('.presence-panel summary').tap();
    const r = await page.evaluate(() => Object.fromEntries(['.presence-panel','.pframe','[data-join]','[data-leave]','.ammo-hud','.auto-potions-hud'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return [s,{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}]; })));
    assert.ok(r['.presence-panel'].x >= r['.pframe'].right); assert.ok(r['.presence-panel'].bottom <= height);
    for (const s of ['[data-join]','[data-leave]']) assert.ok(r[s].h >= 44 && r[s].bottom <= height);
    await capture(width === 1024 ? 'online-controls-tablet' : 'online-controls-landscape'); bounds.push({width,height,bounds:r}); await page.locator('.presence-panel summary').tap();
  }
  ok('Responsive presence controls retain HUD clearance and reachability', bounds);
  // Disconnect clears peer actors/effects and stops fixture input without building again.
  const own = await page.evaluate(() => __online.player.client.id);
  for (const c of app.clients.values()) if (c.id === own) c.ws.terminate();
  await page.waitForFunction(() => __online.player.client.status === 'reconnecting');
  assert.equal(await page.evaluate(() => __online.presence.actors.actors.size), 0); await capture('reconnecting-landscape');
  await page.waitForFunction(id => __online.player.client.status === 'online' && __online.player.client.id !== id, own);
  await page.waitForFunction(() => __online.presence.actors.actors.size === 1);
  assert.equal(await page.evaluate(() => __online.worldBuilds), 1); ok('Reconnecting clears peers and resynchronises current outfit without rebuilding world');
  peer.close(); await once(peer, 'close'); await page.waitForFunction(() => __online.presence.actors.actors.size === 0);
  assert.equal(await page.evaluate(() => __online.presence.actors.effects.active.length), 0); ok('Leave disposes actor and pending/live effects');
  assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []);
  writeFileSync(resolve(out,'results.json'), JSON.stringify(report,null,2));
} finally { await browser?.close(); await app?.close(); await new Promise(r=>web.close(r)); if (rejected.listening) await new Promise(r => rejected.close(r)); }
