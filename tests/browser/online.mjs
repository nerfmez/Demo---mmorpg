// Local-only focused online gate + real protocol peer + production actor/asset review.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'vite';
import { createServer } from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createPresenceServer } from '../../server/presence.mjs';
import { loadData } from '../../src/core/data-node.js';
import { WORLD_ID } from '../../src/network/protocol.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const origin = 'http://127.0.0.1:4173', root = new URL('../../', import.meta.url).pathname;
const culling = !!process.env.ONLINE_CULLING;
const out = resolve(root, culling ? 'tests/browser/out/online-culling' : process.env.ONLINE_SEAMS_ONLY ? 'tests/browser/out/online-seams' : 'tests/browser/out/online'); mkdirSync(out, { recursive: true });
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
const runtimeFiles=['src/network/protocol.js','src/network/presence.js','src/ui/presence.js','src/ui/online-gate.js','src/player.js','src/render/remote-players.js','src/render/remote-effects.js','src/render/spatial-region.js','src/render/terrain-domain.js','src/main.js','server/presence.mjs','tests/browser/online-harness.js','tests/browser/online.mjs'];
let app, peer, browser; const report = { sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), residentRendererOmitted:true, runtimeHashes:Object.fromEntries(runtimeFiles.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')])), checks: [], screenshots: [], errors: [], external: [] };
const ok = (name, evidence) => { report.checks.push({ name, evidence }); console.log('PASS', name, JSON.stringify(evidence ?? '')); };
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true }); const page = await context.newPage();
  page.on('pageerror', e => { report.errors.push(String(e)); console.error('pageerror',String(e)); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console',m.text()); if (m.type() === 'error' && /THREE|shader|WebGL/.test(m.text())) report.errors.push(m.text()); });
  await page.route('**/*', route => { const u = new URL(route.request().url()); if (['http:','https:'].includes(u.protocol) && u.origin !== origin) { report.external.push(u.origin); return route.abort(); } return route.continue(); });
  await page.goto(origin + '/online-review.html'); await page.addStyleTag({ content: css });
  await page.evaluate(({port,culling}) => { window.__onlineEndpoint = `ws://127.0.0.1:${port}/presence`; window.__onlineCulling=culling; }, {port,culling});
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
  if (!process.env.ONLINE_SEAMS_ONLY) {
  peer = new WebSocket(`ws://127.0.0.1:${port}/presence`, { origin }); const messages = []; peer.on('message', b => messages.push(JSON.parse(b))); await once(peer, 'open');
  const take = async type => { for (let i = 0; i < 300; i++) { const n = messages.findIndex(m => m.type === type); if (n >= 0) return messages.splice(n, 1)[0]; await new Promise(r => setTimeout(r, 10)); } throw Error('missing ' + type); };
  const look = { hairStyle: 'swept', hair: '#3b2a20', skin: '#f6d2b5', eyes: '#3a6ad0', scarf: '#cf3a30', tunic: '#f1e3cc' };
  let gear = { weapon: 'rusty_sword', offhand: null, armor: 'ranger_coat', helm: 'ranger_hood', gloves: 'brigand_gloves', boots: 'trail_boots' };
  const [ox, oz] = data.maps['moonroot-grove-v1'].atlas.offset;
  const pose = { x: x + ox + 1, z: z + oz, region: 'moonroot-grove-v1', facing: .3, moving: false };
  peer.send(JSON.stringify({ type: 'join', map: WORLD_ID, room: 'lobby', pose, look, gear })); const welcome = await take('welcome');
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
  // Sample actual runtime key transitions using small simulation steps, not a single large jump.
  await page.evaluate(() => { __online.sampleAction(1.6); });
  peer.send(JSON.stringify({ type: 'action', action: { seq: ++seq, skill: 'firebolt', phase: 'cast', angle: -.5, duration: .22, step: 0 } }));
  await page.waitForFunction(() => [...__online.presence.actors.actors.values()][0].pending?.action.skill === 'firebolt');
  for (const [name, seconds] of [['start', .05], ['hit', .2], ['release', .15]]) {
    await page.evaluate(seconds => { for (let t = 0; t < seconds; t += 1/60) __online.sampleAction(Math.min(1/60, seconds-t)); }, seconds);
    await capture('remote-fire-' + name);
  }
  peer.send(JSON.stringify({ type: 'action', action: { seq: ++seq, skill: 'firebolt', phase: 'cancel', angle: -.5, duration: 0, step: 0 } }));
  await page.waitForFunction(() => ![...__online.presence.actors.actors.values()][0].animator.action);
  assert.equal(await page.evaluate(() => __online.presence.actors.effects.active.length), 0);
  ok('Cancel clears pending animation and live cosmetic effects');
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
  }
  await page.setViewportSize({width:760,height:430});
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  assert.equal(await page.evaluate(() => __online.player.client.enabled),false);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(() => __online.player.client.status==='online');
  assert.equal(await page.evaluate(() => __online.worldBuilds),1);
  ok('BFCache lifecycle handlers stop the socket and resume without rebuilding');
  // Two real browser clients, different fixed origins, same tiny review scene and real core movement.
  // This omits resident-map construction and measures transport/input, not full-world performance.
  await page.evaluate(() => { __online.freeze = false; });
  const secondContext = await browser.newContext({ viewport: { width: 760, height: 430 }, hasTouch: true });
  const b = await secondContext.newPage();
  b.on('pageerror', e => report.errors.push(String(e)));
  await b.route('**/*', route => { const u = new URL(route.request().url()); if (['http:','https:'].includes(u.protocol) && u.origin !== origin) { report.external.push(u.origin); return route.abort(); } return route.continue(); });
  await b.goto(origin + '/online-review.html'); await b.addStyleTag({ content: css });
  await b.evaluate(({port,culling}) => { window.__onlineEndpoint = `ws://127.0.0.1:${port}/presence`; window.__onlineInitial = 'azure-harbor-v1'; window.__onlineCulling=culling; }, {port,culling});
  await b.addScriptTag({ content: code }); await b.evaluate(() => __online.seedSave());
  await b.waitForFunction(() => __online.ready && __online.player.client.status === 'online');
  await page.waitForFunction(() => __online.presence.actors.actors.size === 1);
  await page.evaluate(() => __online.place(13, -121.2)); await b.evaluate(() => __online.place(14, -118.8));
  if(culling) {
    await page.waitForFunction(()=>{const a=[...__online.presence.actors.actors.values()][0];return a.rig.importedWeapon&&Math.hypot(a.target.x-__online.game.player.x,a.target.z-__online.game.player.z)<5;});
    await page.evaluate(()=>{__online.freeze=true;});await capture('static-culling-peer-idle');
    await b.bringToFront();await b.keyboard.press('1');
    await page.waitForFunction(()=>[...__online.presence.actors.actors.values()][0].pending?.action.skill==='hunter_shot');
    await page.evaluate(()=>{const a=[...__online.presence.actors.actors.values()][0],seconds=a.pending.action.duration+.025;for(let t=0;t<seconds;t+=1/60)__online.sampleAction(Math.min(1/60,seconds-t));});
    const probe=await page.evaluate(()=>__online.cullingProbe());
    assert.equal(probe.staticObjects,2);assert.equal(probe.staticOverrides,true);assert.ok(probe.attached>0);assert.equal(probe.detached,0);assert.equal(probe.restored,probe.attached);
    assert.equal(probe.actorCaptured,false);assert.equal(probe.actorOnScene,true);assert.equal(probe.scarfOnScene,true);assert.equal(probe.effectOnScene,true);assert.equal(probe.effectCaptured,false);
    await capture('static-culling-peer-shot');ok('Static camera/shadow cells detach and restore while peer rig/scarf and bounded arrow remain dynamic scene owners',probe);
    await page.evaluate(()=>{__online.sampleAction(1.6);__online.freeze=false;});
  }
  const beforeSeam = await page.evaluate(() => ({ id: __online.player.client.id, peer: [...__online.presence.actors.actors.keys()][0], rig: [...__online.presence.actors.actors.values()][0].rig.root.uuid }));
  const beforeB = await b.evaluate(() => ({ id: __online.player.client.id, rig: [...__online.presence.actors.actors.values()][0].rig.root.uuid }));
  await page.bringToFront(); await page.keyboard.down('s');
  try { await page.waitForFunction(() => __online.game.data.world.id === 'azure-harbor-v1', null, { timeout: 5000 }); } catch(e) {console.error('KEYBOARD DIAGNOSTIC',await page.evaluate(()=>({status:__online.player.client.status,blocked:__online.player.gate.blocked,keys:[...__online.input.keys],input:__online.game.input,player:{x:__online.game.player.x,z:__online.game.player.z},region:__online.game.data.world.id,freeze:__online.freeze,time:__online.game.time,active:document.activeElement?.tagName,unified:__online.game.world.unified,r:__online.game.player.r,ground:__online.game.world.groundY(__online.game.player.x,__online.game.player.z),free:__online.game.world.isFree(__online.game.player.x,__online.game.player.z+.04,__online.game.player.r),step:__online.game.world.move(__online.game.player.x,__online.game.player.z,__online.game.player.r,0,.04),bounds:__online.game.world.bounds,water:__online.game.world.blocksWater(__online.game.player.x,__online.game.player.z+.04,.14)})));await capture('seam-keyboard-failure');throw e;} finally { await page.keyboard.up('s'); }
  await b.waitForFunction(() => [...__online.player.client.players.values()][0].pose.region === 'azure-harbor-v1');
  const shared = async (receiver, sender) => {
    const sent = await sender.evaluate(() => __online.player.client.state().pose);
    await receiver.waitForFunction(p => { const a = [...__online.presence.actors.actors.values()][0]; const [ox,oz] = __online.game.coordinateOrigin; return Math.hypot(a.target.x+ox-p.x,a.target.z+oz-p.z)<.01; }, sent);
    return receiver.evaluate(() => { const a = [...__online.presence.actors.actors.values()][0], [ox,oz] = __online.game.coordinateOrigin; return { wire: [...__online.player.client.players.values()][0].pose, target: {x:a.target.x,z:a.target.z}, origin:[ox,oz], global: [a.target.x+ox,a.target.z+oz] }; });
  };
  const keyboardShared = await shared(b,page);
  await page.evaluate(() => __online.place(13, -119));
  await b.evaluate(() => __online.place(13, -118.8));
  await b.bringToFront();
  const joy = await b.locator('.joyzone').boundingBox(), cd = await secondContext.newCDPSession(b), jx=joy.x+joy.width/2, jy=joy.y+joy.height/2;
  await cd.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:jx,y:jy}]});
  await cd.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:jx,y:jy-45}]});
  try { await b.waitForFunction(() => __online.game.data.world.id === 'moonroot-grove-v1', null, {timeout:5000}); } finally { await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cd.detach(); }
  const touchShared = await shared(page,b);
  assert.equal(await page.evaluate(() => __online.player.client.id),beforeSeam.id);
  assert.equal(await b.evaluate(() => __online.player.client.id),beforeB.id);
  assert.equal(await page.evaluate(() => [...__online.presence.actors.actors.values()][0].rig.root.uuid),beforeSeam.rig);
  assert.equal(await b.evaluate(() => [...__online.presence.actors.actors.values()][0].rig.root.uuid),beforeB.rig);
  await capture('seam-two-client-moonroot');
  // A second authored seam: keyboard crosses Azure -> Frontier and returns without changing membership.
  await page.evaluate(() => __online.place(-158.8,-92)); await b.evaluate(() => __online.place(-162,-92));
  await page.bringToFront(); await page.keyboard.down('a');
  try { await page.waitForFunction(() => __online.game.data.world.id === 'frontier-wilds-v1',null,{timeout:5000}); } finally { await page.keyboard.up('a'); }
  const frontierShared=await shared(b,page);
  assert.equal(await page.evaluate(() => __online.player.client.id),beforeSeam.id);
  ok('Two browser origins agree across Moonroot touch and Frontier keyboard seams without replacing identity/rig', {keyboardShared,touchShared,frontierShared});
  await page.evaluate(() => __online.place(13,-119)); await b.evaluate(() => __online.place(13,-121));
  await page.locator('.presence-panel summary').tap(); await page.locator('input[aria-label="Room"]').fill('private'); await page.locator('[data-join]').tap();
  await page.waitForFunction(() => __online.player.client.status==='online' && __online.player.client.room==='private');
  await b.waitForFunction(() => __online.presence.actors.actors.size===0); await page.locator('.presence-panel summary').tap();
  assert.equal(await page.evaluate(() => __online.presence.actors.actors.size),0);
  await page.locator('.presence-panel summary').tap(); await page.locator('input[aria-label="Room"]').fill('lobby'); await page.locator('[data-join]').tap();
  await page.waitForFunction(() => __online.player.client.status==='online' && __online.presence.actors.actors.size===1); await page.locator('.presence-panel summary').tap();
  ok('Real room controls isolate peers and rejoin the shared atlas');
  await page.locator('.ammo-hud').tap(); assert.equal(await page.evaluate(() => __online.panels.sel.craft),'arrow'); await page.locator('.panel-close').tap();
  await page.locator('.auto-potions-hud').tap(); assert.equal(await page.evaluate(() => __online.panels.tab),'shop');
  const close = await page.locator('.panel-close').boundingBox(); assert.ok(close.x>=0 && close.y>=0 && close.x+close.width<=760 && close.y+close.height<=430);
  await capture('supplies-close-landscape'); await page.locator('.panel-close').tap();
  // F is main's exposed runtime object; Supplies remains attached there after the merge.
  assert.match(readFileSync(resolve(root,'src/main.js'),'utf8'),/Object\.assign\(F, \{[^\n]*supplies/);
  await page.locator('.presence-panel summary').tap(); await page.locator('input[aria-label="Room"]').fill('lobby'); await page.keyboard.press('f');
  assert.equal(await page.evaluate(() => __online.panels.isOpen),false); await page.locator('.presence-panel summary').tap();
  ok('Supplies HUD actions and Close stay reachable; room text does not trigger F',close);
  await b.evaluate(() => __online.dispose()); await page.waitForFunction(() => __online.presence.actors.actors.size===0);
  assert.equal(await b.evaluate(() => __online.player.client.enabled),false); await secondContext.close();
  assert.equal(await page.evaluate(() => __online.readSave().character.gold),1234);
  assert.equal(await page.evaluate(() => localStorage.getItem('frontier.slot.1')===__online.savedBefore),true);
  ok('Connection failures, movement, room changes and teardown never modify the existing offline save');
  assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []);
  writeFileSync(resolve(out,'results.json'), JSON.stringify(report,null,2));
} finally { await browser?.close(); await app?.close(); await new Promise(r=>web.close(r)); if (rejected.listening) await new Promise(r => rejected.close(r)); }
