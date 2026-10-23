// Focused standalone-scene review. Uses a local Three 0.170 package for offline
// browser captures, while the delivered page keeps the standard import map.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve, join, extname } from 'node:path';

const root = resolve('scenes');
const out = resolve(process.env.SCENE_OUT || 'scenes/ruins/review');
const vendor = process.env.THREE170_DIR || '/workspace/scene-vendor/package';
const sceneName = process.env.SCENE_NAME || 'ruins';
await mkdir(out, { recursive: true });
const srv = createServer(async (q, r) => {
  try {
    const p = resolve(root, '.' + new URL(q.url, 'http://localhost').pathname);
    if (!p.startsWith(root + '/')) throw new Error('path');
    const body = await readFile(p);
    r.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(p)] || 'application/octet-stream');
    r.end(body);
  } catch { r.writeHead(404); r.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [], report = { scene: sceneName, errors, views: [] };
try {
  const ctx = await browser.newContext({ viewport: process.env.SCENE_PROBE==='1'?{width:1100,height:760}:{ width: 1720, height: 1060 }, deviceScaleFactor: 1, hasTouch: true });
  if (process.env.SCENE_STILL==='1') {
    // Static inspection only. Do not make SwiftShader draw the same two-million
    // triangle scene continuously while the screenshot waits for composition.
    await ctx.addInitScript(() => { window.requestAnimationFrame=()=>0; window.__reviewTime=12; });
    report.method='Frozen-time stills; native touch input; production walker advanced at fixed 60 Hz. No device FPS or continuous playback claim.';
  }
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', async r => {
    const file = new URL(r.request().url()).pathname.replace('/npm/three@0.170.0/', '');
    await r.fulfill({ body: await readFile(join(vendor, file)), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.error(m.text()); } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/${sceneName}/index.html?wipe=100`);
  await page.waitForFunction(() => window.__scene?.ready && window.__scene?.HERO?.rig, null, { timeout: 90000 });
  console.log('Ready');
  await page.evaluate(() => { window.__scene.lockPR(1); window.__reviewTime=12; });
  await page.waitForTimeout(1000);
  const capture = async name => {
    if(process.env.SCENE_NAV_ONLY==='1') return;
    if(process.env.SCENE_STILL==='1') await page.evaluate(()=>{
      const s=window.__scene; s.updateHero(0,12);s.placeCamera();s.renderer.shadowMap.needsUpdate=true;s.renderer.render(s.scene,s.camera);
    });
    await page.locator('#stage').screenshot({ path: join(out, `${name}.png`), timeout: 60000 });
    console.log('Captured', name);
    report.views.push({ name, viewport: page.viewportSize(), time: await page.evaluate(() => window.__scene?.time?.()) });
  };
  await capture('scene');
  if(process.env.SCENE_PROBE==='1') {
    await page.evaluate(() => {
      const s=window.__scene, light=s.scene.children.find(o=>o.isDirectionalLight);
      light.shadow.bias=-.002; light.shadow.normalBias=.3;
      s.renderer.shadowMap.needsUpdate=true;
    });
    await capture('bias');
    await page.evaluate(() => {
      window.__scene.scene.traverse(o=>{if(o.isMesh)o.receiveShadow=false;});
    });
    await capture('no-receive');
  }
  if(process.env.SCENE_QUICK==='1') {
    await writeFile(join(out,'report.json'),JSON.stringify({errors},null,2));
    if(errors.length)throw new Error('Scene errors');
    process.exitCode=0; await ctx.close();
  } else {
  await page.locator('#half').click(); await capture('wipe');
  await page.locator('#only3d').click();
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(500); await capture('ipad');
  report.scene = await page.evaluate(() => {
    const s = window.__scene;
    return { camera: s.CAM, hero: { x: s.HERO.x, z: s.HERO.z }, render: s.renderer.info.render, memory: s.renderer.info.memory };
  });
  if (process.env.SCENE_WALK === '1') {
    report.walk = [];
    // Each click follows the actual curved approach rather than asking the
    // point-to-point scene walker to find a path through cliff geometry.
    for (const [u, v] of [[.60,.86],[.72,.78],[.81,.69],[.77,.61],[.70,.52],[.65,.445],[.68,.38],[.70,.30],[.605,.24]]) {
      const bb = await page.locator('#stage').boundingBox();
      await page.touchscreen.tap(bb.x + u*bb.width, bb.y + v*bb.height);
      const leg = await page.evaluate(() => {
        const s=window.__scene,h=s.HERO,target=[h.tx,h.tz],from=[h.x,h.z];
        // Advance the exact production scene walker at 60 fixed steps/second.
        // SwiftShader's wall time is not a device frame rate measurement.
        let n=0;
        while(h.tx!==null&&n<2400){s.updateHero(1/60,12+n/60);n++;}
        const y=s.height(h.x,h.z);
        return {from,target,x:h.x,z:h.z,y,blocked:s.blocked?.(h.x,h.z),distance:Math.hypot(h.x-target[0],h.z-target[1]),steps:n,
          stair:s.stairsAt(h.x,h.z),slopeX:(s.height(h.x+.3,h.z)-y)/.3,slopeZ:(s.height(h.x,h.z+.3)-y)/.3,
          near:s.colliders.filter(c=>Math.hypot(c.x-h.x,c.z-h.z)<8)};
      });
      report.walk.push(leg);
      console.log('Walk', JSON.stringify(leg));
      await writeFile(join(out,'walk.json'),JSON.stringify(report.walk,null,2));
      assert(leg.distance<.6,'Touch destination blocked or disconnected');
    }
    await capture('court-walk');
  }
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(500); await capture('ipad-portrait');
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report));
  if (errors.length) throw new Error(`Scene errors: ${errors.join('; ')}`);
  }
} finally { await browser.close(); await new Promise(r=>srv.close(r)); }
