// Real-world coastal combat, with fixed simulation stepping for software GPUs.
// Captures the anticipation/contact/recovery poses without changing combat rules.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const out = `tests/browser/out/coastal-${engine.name()}/`;
mkdirSync(out, { recursive: true });
const port = 4186, base = `http://localhost:${port}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const report = { engine: engine.name(), cases: [], errors: [], passed: false };
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (i > 80) throw Error('preview server unavailable');
    await new Promise(r => setTimeout(r, 250));
  }
  browser = await engine.launch({ args: engine === chromium ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, hasTouch: true, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { if (!window.__coastalFreeze) cb(t); });
  });
  page.on('pageerror', e => report.errors.push(String(e)));
  // HTTP failures are recorded with their URL; an absent browser favicon is not
  // a game asset failure. Keep JS and shader console errors authoritative.
  page.on('response', r => { if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('console', m => { if (m.type() === 'error'&&!m.location().url?.endsWith('/favicon.ico')) report.errors.push(m.text()); });
  await page.goto(base + '?fresh=1&seed=9&quality=low');
  await page.waitForFunction(() => window.__frontier?.modelsReady && window.__frontier?.game?.time > .3, null, { timeout: 90000 });
  await page.evaluate(() => {
    const f = window.__frontier;
    f.paused = true; f.input.reset(); f.input.disabled = true;
    window.__coastalFreeze = true;
    f.coastalRoster = f.game.monsters.slice();
    f.coastalHits = 0;
    f.game.spawnPoints = [];
    f.coastalRender = f.view.render.bind(f.view);
    f.view.render = () => f.coastalRender(0, f.game.time, {});
    f.coastalStep = (seconds, present = true) => {
      for (let t = 0; t < seconds - 1e-8; t += 1 / 60) {
        f.game.update(1 / 60);
        for (const e of f.game.drainEvents()) { if(e.type==='playerHit')f.coastalHits++; f.view.handleEvent(e); }
        f.view.syncMonsters(1 / 60, f.game.time);
        f.view.vfx.update(1 / 60);
      }
      if (present) f.coastalRender(0, f.game.time, {});
    };
    f.coastalUntil = (state, max = 30) => {
      for (let t = 0; t < max && f.coastalMonster.state !== state; t += 1 / 60) f.coastalStep(1 / 60, false);
      if (f.coastalMonster.state !== state) throw Error('Did not reach ' + state + ': ' + f.coastalMonster.state);
      f.coastalRender(0, f.game.time, {});
    };
    f.coastalSnapshot = () => {
      const m = f.coastalMonster, p = f.game.player;
      return { state: m.state, position: [m.x, m.z], gap: Math.hypot(m.x-p.x, m.z-p.z), hp: p.hp, hits:f.coastalHits, shell: m.shell, charge: !!m.charge, melee: m.melee?.name, projectiles: f.game.projectiles.length, geometries: f.view.renderer.info.memory.geometries };
    };
  });
  const capture = async name => {
    await page.evaluate(() => { __frontier.hud.update(.6,__frontier.panels); __frontier.view.renderer.getContext().finish(); });
    await page.screenshot({ path: out + name + '.png', timeout: 90000 });
    console.log('COASTAL CAPTURE', engine.name(), name);
  };
  for (const type of ['salt_slime', 'shore_gull', 'reef_crab', 'hermit_crab']) {
    const start = await page.evaluate(type => {
      const f = window.__frontier, g = f.game, p = g.player;
      // Select a real spawn with enough clear floor for contact and normal retreat.
      let spot;
      for (const m of f.coastalRoster.filter(m => m.type === type)) {
        for (const angle of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
          const distance = m.r + p.r + .5;
          let clear = true;
          for (let d = -3.5; d <= distance + 4; d += .2) {
            const x = m.homeX + Math.sin(angle)*d, z = m.homeZ + Math.cos(angle)*d;
            if (!g.world.isFree(x,z,Math.max(m.r,p.r)) || g.isSafe(x,z)) { clear = false; break; }
          }
          if (clear) { spot = { m, angle, distance }; break; }
        }
        if (spot) break;
      }
      if (!spot) throw Error('No clear real-world combat spot for ' + type);
      const {m, angle, distance} = spot;
      Object.assign(m, {x:m.homeX,z:m.homeZ,facing:angle,aggro:true,state:'chase',stateT:0,windup:null,melee:null,charge:null,shell:false,staggerT:0,guardAttacks:0,retreatPending:false});
      for (const key in m.cd) m.cd[key] = 0;
      Object.assign(p,{x:m.x+Math.sin(angle)*distance,z:m.z+Math.cos(angle)*distance,hp:p.maxHp,dead:false,cast:null});
      g.setMove(0,0); g.projectiles=[]; g.areas=[]; g.allies=[]; g.monsters=[m];
      f.coastalMonster=m;
      f.coastalHits=0;
      f.view.zoom=.6; f.view.snapCamera();
      f.coastalStep(1/60);
      return { ...f.coastalSnapshot(), name:m.windup?.name, total:m.windup?.total, hitTime:m.def.attacks[m.def.primaryAttack].hitTime, duration:m.def.attacks[m.def.primaryAttack].duration };
    }, type);
    assert.equal(start.state, 'windup');
    await page.evaluate(seconds => __frontier.coastalStep(seconds), start.total * .7);
    await capture(type + '-01-windup');
    await page.evaluate(() => __frontier.coastalUntil('act'));
    const before = await page.evaluate(() => __frontier.coastalSnapshot());
    assert.equal(before.hits, 0, type + ': windup cannot damage');
    await page.evaluate(seconds => __frontier.coastalStep(seconds), start.hitTime + 1/60);
    await capture(type + '-02-contact');
    const contact = await page.evaluate(() => __frontier.coastalSnapshot());
    assert.ok(contact.hp < before.hp, type + ': actual contact damages player');
    assert.equal(contact.hits, 1, type + ': contact lands once');
    assert.deepEqual(contact.position, start.position, type + ': strike stays planted');
    assert.equal(contact.charge, false);
    await page.evaluate(() => __frontier.coastalUntil('recover'));
    const recovery = await page.evaluate(() => __frontier.coastalSnapshot());
    assert.equal(recovery.hits, contact.hits, type + ': one hit per strike');
    await capture(type + '-03-recovery');
    const row = { type, start, contact, recovery };
    if (type === 'salt_slime') {
      const shot = await page.evaluate(() => {
        const f=__frontier,m=f.coastalMonster,p=f.game.player,d=m.r+p.r+3;
        p.x=m.x+Math.sin(m.facing)*d;p.z=m.z+Math.cos(m.facing)*d;
        f.coastalUntil('windup');
        if(m.windup.name!=='salt_spit')throw Error('Expected salt spit');
        const hp=p.hp;
        f.coastalUntil('recover');f.coastalStep(.2);
        const pr=f.game.projectiles.find(pr=>pr.kind==='salt_spit');
        return {hp,element:pr?.element,poison:pr?.poison,position:[m.x,m.z]};
      });
      assert.equal(shot.element,'salt');assert.equal(shot.poison,null);
      await capture(type+'-04-salt-spit');
      const landed=await page.evaluate(hp=>{
        const f=__frontier;
        for(let t=0;t<3&&f.game.player.hp>=hp;t+=1/60)f.coastalStep(1/60,false);
        return {hp:f.game.player.hp,poison:!!f.game.player.statuses.poison};
      },shot.hp);
      assert.ok(landed.hp<shot.hp,'salt glob collides with the real player');
      assert.equal(landed.poison,false);row.shot={...shot,...landed};
    }
    if (type === 'shore_gull') {
      await page.evaluate(() => { __frontier.coastalUntil('retreat'); __frontier.coastalStep(.6); });
      row.retreat = await page.evaluate(() => __frontier.coastalSnapshot());
      assert.ok(row.retreat.gap > recovery.gap + 1, 'gull walks away after pecking');
      assert.equal(row.retreat.hits, recovery.hits, 'retreat causes no contact damage');
      await capture(type + '-04-retreat');
    }
    if (type === 'hermit_crab') {
      await page.evaluate(() => { __frontier.coastalUntil('shell'); __frontier.coastalStep(.5); });
      row.shell = await page.evaluate(() => __frontier.coastalSnapshot());
      assert.ok(row.shell.shell);
      await capture(type + '-04-shell');
      await page.evaluate(() => { __frontier.coastalUntil('emerge'); __frontier.coastalStep(.35); });
      row.emerge = await page.evaluate(() => __frontier.coastalSnapshot());
      assert.equal(row.emerge.shell, false);
      await capture(type + '-05-emerge');
    }
    // Render repeated real attack cycles after warming the rig. Warnings and
    // contact effects must release their GPU buffers rather than accumulate.
    row.resources = await page.evaluate(() => {
      const f=__frontier,m=f.coastalMonster,p=f.game.player,samples=[];
      if(m.type==='salt_slime') {
        const d=m.r+p.r+.5;
        p.x=m.x+Math.sin(m.facing)*d;p.z=m.z+Math.cos(m.facing)*d;
      }
      for(let i=0;i<12;i++) {
        p.hp=p.maxHp;
        f.coastalUntil('windup');
        f.coastalStep(m.windup.total*.7);
        f.coastalUntil('recover');
        f.coastalStep(.6);
        f.view.renderer.getContext().finish();
        samples.push(f.view.renderer.info.memory.geometries);
      }
      return samples;
    });
    const stable = row.resources.slice(4);
    assert.ok(Math.max(...stable)-Math.min(...stable)<=2,type+': attack GPU geometry stays bounded after warmup');
    console.log('COASTAL RESOURCES',type,JSON.stringify(row.resources));
    report.cases.push(row);
  }
  assert.deepEqual(report.errors, []);
  assert.equal(await page.evaluate(() => __frontier.view.renderer.getContext().getError()), 0);
  report.passed = true;
  console.log('COASTAL ATTACKS VERIFIED', JSON.stringify(report));
} catch (error) {
  report.error = error.stack;
  throw error;
} finally {
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2));
  await browser?.close();
  try { process.kill(-server.pid); } catch {}
}
