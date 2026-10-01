// Shared actual-input regression for category views, Job gates and touch gestures.
import assert from 'node:assert/strict';
import {loadData} from '../../src/core/data-node.js';
import {jobNodeState} from '../../src/core/character.js';
const data=loadData();

export async function verifyPassiveGestures(page, {context, engineName, capture = async () => {}}) {
  await page.evaluate(() => {
    const f = window.__frontier;
    f.panels.close();
    f.game.ch.jobNodes = ['origin'];
    f.game.ch.jobLevel = 20;
    f.game.ch.jobPoints = 19;
    f.game.ch.gold = 1000;
    f.panels.jobCameras = {};
    Object.assign(f.panels.sel, {node: null, constellation: null, nodeSearch: '', jobBranch: 'vanguard'});
    f.panels.open('job');
  });
  const tap = async selector => {
    const target = page.locator(selector).first();
    if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await target.tap();
    else await target.click();
    // Learning a Job can queue a questDone event. Let the live game drain it
    // before typing into the next search; the offline harness has no frame loop.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const jump = async id => {
    const name = await page.evaluate(id => window.__frontier.game.data.jobtree.nodes[id].nameTh, id);
    await page.locator('#node-search').fill(name);
    await tap('.seeker-node-search [type="submit"]');
    await tap(`.seeker-search-result[data-id="${id}"]`);
    assert.equal(await page.locator('.seeker-node-detail [data-act="take-node"]').getAttribute('data-id'), id);
  };
  const camera = () => page.evaluate(() => {
    const ui = window.__frontier.panels;
    return {...ui.jobCameras[ui.sel.constellation + ':' + (ui.sel.jobBranch || '')]};
  });
  assert.equal(await page.locator('.seeker-constellation').count(), 10);
  assert.equal(await page.locator('.seeker-node').count(), 0, 'overview is not the whole giant graph');
  await jump('v1');
  assert.equal(await page.evaluate(() => window.__frontier.game.ch.jobNodes.length), 1, 'inspection does not spend');
  await tap('[data-act="take-node"]');
  assert.equal(await page.evaluate(() => window.__frontier.game.ch.jobPoints), 18);
  await jump('v2');
  await tap('[data-act="take-node"]');
  await jump('m_atk');
  await tap('[data-act="take-node"]');
  await jump('vj');
  await tap('[data-act="take-node"]');
  assert.ok(await page.evaluate(() => window.__frontier.game.ch.jobNodes.includes('vj')));
  await jump('aj');
  assert.ok(await page.locator('[data-act="take-node"]').isDisabled(), 'second Job stays blocked across categories');
  await jump('v9');
  assert.ok(await page.locator('[data-act="take-node"]').isDisabled(), 'stage IV stays locked before enough earlier-tier investment');
  assert.match(await page.locator('.journal-tier-status').innerText(), /4\/17/, 'major group counts total investment');
  const candidates=Object.entries(data.jobtree.nodes).filter(([,n])=>n.category==='melee'||(n.category==='specialist'&&(n.requiresJob||n.branch)==='vanguard'));
  while(true){
    const ch=await page.evaluate(()=>window.__frontier.game.ch);
    if(ch.jobNodes.length-1>=17)break;
    const id=jobNodeState(ch,data,'v7').can?'v7':candidates.find(([id])=>id!=='v9'&&jobNodeState(ch,data,id).can)?.[0];
    assert.ok(id,'a connected investment exists before section IV');
    await jump(id);await tap('[data-act="take-node"]');
  }
  await jump('v9');
  assert.ok(await page.locator('[data-act="take-node"]').isEnabled(), 'major section and connected path are both ready');
  assert.equal(await page.evaluate(()=>window.__frontier.game.ch.jobPoints),2,'17 real allocations spend 17 points');

  const before = await page.evaluate(() => JSON.stringify(window.__frontier.game.ch.jobNodes));
  const selected = await page.evaluate(() => window.__frontier.panels.sel.node);
  await page.locator('.seeker-graph').evaluate(el => {
    el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerId: 91, pointerType: 'touch', clientX: 100, clientY: 150}));
    el.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true, pointerId: 91}));
  });
  await tap('[data-zoom="-1"]');
  await tap('[data-zoom="1"]');
  await page.locator('.seeker-graph').scrollIntoViewIfNeeded();
  // Use the visible intersection, including short landscape screens.
  const box = await page.locator('.seeker-graph').evaluate(el => {
    const r = el.getBoundingClientRect(), p = el.closest('.pbody').getBoundingClientRect();
    const left = Math.max(r.left, p.left, 0), right = Math.min(r.right, p.right, innerWidth);
    const top = Math.max(r.top, p.top, 0), bottom = Math.min(r.bottom, p.bottom, innerHeight);
    return {x: (left + right) / 2, y: top + (bottom - top) * .2};
  });
  const prev = await camera();
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 15, {steps: 6});
  await page.mouse.up();
  assert.ok(Math.abs((await camera()).x - prev.x) > 20, 'drag pans the active category');
  if (engineName === 'chromium' && page.viewportSize().width === 1180) {
    const cdp = await context.newCDPSession(page), zoomBefore = (await camera()).zoom;
    try {
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: box.x - 35, y: box.y, id: 1}, {x: box.x + 35, y: box.y, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: box.x - 62, y: box.y, id: 1}, {x: box.x + 62, y: box.y, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      assert.ok((await camera()).zoom > zoomBefore, 'native two-finger pinch zooms');
    } finally { await cdp.detach(); }
  }
  assert.equal(await page.evaluate(() => JSON.stringify(window.__frontier.game.ch.jobNodes)), before, 'gestures never spend');
  assert.equal(await page.evaluate(() => window.__frontier.panels.sel.node), selected, 'gestures never select a node');
  await capture('job-detail');
  await tap('[data-fit]');
  await capture('job-overview');
  await tap('.journal-back');
  await tap('[data-act="close-journal"]');
  assert.equal(await page.evaluate(() => window.__frontier.panels.isOpen), false);
}

