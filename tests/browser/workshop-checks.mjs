// Focused production Game/Panels controls; called by the existing upgrade-materials suite.
// Fixtures supply resources. Never replace real payment/RNG, extend timeouts or skip failed checks.
import assert from 'node:assert/strict';
export async function verifyWorkshop(page,{activate,touch,capture=async()=>{}}) {
  const baseline=await page.evaluate(()=>{const f=__frontier;return JSON.parse(JSON.stringify({ch:f.game.ch,sel:f.panels.sel,pos:[f.game.player.x,f.game.player.z]}));});
  const settled=()=>page.waitForFunction(()=>!__frontier.panels.workshop.busy);
  const values=()=>page.evaluate(()=>{const g=__frontier.game,p=__frontier.panels;return {gear:JSON.parse(JSON.stringify(g.ch.gear.find(it=>it.uid===p.sel.forgeUid))),gold:g.ch.gold,stones:g.ch.materials.enhancement_stone};});
  const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'workshop horizontal overflow');
  try {
    const initial=await page.evaluate(()=>{
      const g=__frontier.game,p=__frontier.panels;p.close();
      [g.player.x,g.player.z]=g.data.world.town.workbench;g.ch.gold=100000;g.ch.level=30;
      for(const id in g.ch.stats)g.ch.stats[id]=100;
      for(const id in g.data.items.materials)g.ch.materials[id]=500;
      const item=g.ch.gear[0];item.upgrade=0;item.grade='C';item.options=item.options.slice(0,2);
      p.sel.forgeUid=item.uid;p.sel.forgeMode='upgrade';p.sel.forgeSlot='all';p.sel.forgeSearch='';g.refresh();p.open('forge');
      return {uid:item.uid,cost:g.data.items.upgrade.cost[0]};
    });
    const before=await values();await overflow();await capture('upgrade-before');
    await activate('[data-act="gear-up"]');
    // A retained control from a rapid tap may dispatch again; the live controller still guards it.
    await page.evaluate(()=>__frontier.panels.onClick({target:document.querySelector('[data-act="gear-up"]')}));
    const paid=await values();assert.equal(paid.gear.upgrade,1);assert.equal(paid.gold,before.gold-initial.cost.gold);
    assert.equal(paid.stones,before.stones-initial.cost.enhancement_stone);assert.deepEqual(paid.gear.options,before.gear.options);
    assert.equal(paid.gear.grade,before.gear.grade);await capture('upgrade-feedback');
    await page.evaluate(()=>{const p=__frontier.panels;p.close();p.open('forge');});
    assert.deepEqual(await values(),paid,'closing mid-feedback never reverts/pays again');
    await settled();assert.deepEqual(await values(),paid,'stale animation completion cannot spend');
    await capture('upgrade-result');
    await activate('[data-act="workshop-page"][data-id="grade"]');
    const prior=await values();await activate('[data-act="gear-grade"]');await settled();
    const promoted=await values();assert.equal(promoted.gear.grade,'B');assert.equal(promoted.gear.upgrade,prior.gear.upgrade);
    assert.deepEqual(promoted.gear.options.slice(0,prior.gear.options.length),prior.gear.options);assert.equal(promoted.gear.options.length,3);
    await capture('grade-result');
    // Missing, max and stale live service gate; no UI-only disabled-button assumptions.
    await page.evaluate(()=>{const g=__frontier.game,p=__frontier.panels;p.sel.forgeMode='upgrade';g.ch.materials.enhancement_stone=0;p.render();});
    assert.ok(await page.locator('[data-act="gear-up"]').isDisabled());assert.match(await page.locator('[data-material="enhancement_stone"]').innerText(),/ขาดอีก/);await capture('missing');
    await page.evaluate(()=>{const g=__frontier.game,p=__frontier.panels;g.ch.gear.find(it=>it.uid===p.sel.forgeUid).upgrade=g.data.items.upgrade.max;p.render();});
    assert.ok(await page.locator('[data-act="gear-up"]').isDisabled());assert.match(await page.locator('[data-forge-status]').innerText(),/สูงสุด/);
    await page.evaluate(()=>{const g=__frontier.game,p=__frontier.panels;g.ch.materials.enhancement_stone=500;g.ch.gear.find(it=>it.uid===p.sel.forgeUid).upgrade=0;p.render();});
    const noSpend=await values();
    await page.evaluate(()=>{const g=__frontier.game;[g.player.x,g.player.z]=g.data.world.playerSpawn;});
    await activate('[data-act="gear-up"]');assert.deepEqual(await values(),noSpend,'stale enabled button checks live location');
    assert.match(await page.locator('[role="alert"]').innerText(),/โต๊ะคราฟต์/);
    await page.evaluate(()=>{const g=__frontier.game,p=__frontier.panels;[g.player.x,g.player.z]=g.data.world.town.workbench;p.sel.craft='armor';p.sel.craftRecipe=null;p.sel.craftReady=false;p.sel.craftSearch='';p.workshop.clear();p.open('craft');});
    const levels=await page.locator('[data-recipe-id]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.equipmentLevel)));
    assert.deepEqual(levels,[...levels].sort((a,b)=>a-b));
    const names=await page.locator('[data-recipe-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recipeId));
    await page.locator('[data-craft-search]').fill('sporeweave');
    const found=await page.locator('[data-recipe-id]:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.dataset.recipeId));
    assert.ok(found.includes('sporeweave_vest'));assert.deepEqual(found,names.filter(id=>found.includes(id)));
    await page.locator('[data-craft-search]').fill('');
    const funds=await page.evaluate(()=>JSON.stringify(__frontier.game.ch));
    await activate('[data-act="craft-open"][data-id="sporeweave_vest"]');
    assert.equal(await page.evaluate(()=>JSON.stringify(__frontier.game.ch)),funds,'opening recipe only inspects');
    await capture('craft-before');
    const start=await page.evaluate(()=>({uids:__frontier.game.ch.gear.map(it=>it.uid),cost:__frontier.game.data.recipes.recipes.sporeweave_vest.cost,gold:__frontier.game.ch.gold}));
    await activate('[data-act="craft"]');await settled();
    const result=await page.evaluate(()=>({uids:__frontier.game.ch.gear.map(it=>it.uid),gold:__frontier.game.ch.gold}));
    assert.equal(result.uids.length,start.uids.length+1);assert.equal(new Set(result.uids).size,result.uids.length);assert.equal(result.gold,start.gold-start.cost.gold);
    assert.ok(await page.locator('[data-crafted-uid]').count());await overflow();await capture('craft-result');
    const created=result.uids.find(id=>!start.uids.includes(id));
    await activate(`[data-act="forge-open"][data-uid="${created}"]`);
    assert.equal(await page.evaluate(()=>__frontier.panels.sel.forgeUid),created,'new craft opens its exact uid in forge');
    assert.equal(await page.evaluate(()=>__frontier.game.ch.gold),result.gold);await overflow();
    return {ok:true,touch,checks:['live core payments','rapid duplicate guard','close mid-feedback','grade preserves rolls/+N','missing/max/location','ordered search','inspect no-spend','crafted uid handoff','no horizontal overflow']};
  } finally {
    await page.evaluate(b=>{const g=__frontier.game,p=__frontier.panels;p.close();p.workshop.clear();for(const k of Object.keys(g.ch))delete g.ch[k];Object.assign(g.ch,b.ch);p.sel=b.sel;[g.player.x,g.player.z]=b.pos;g.refresh();},baseline);
  }
}
