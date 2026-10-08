// Normal mode only; seed exact ingredients to exercise the real workbench UI.
import assert from 'node:assert/strict';
import {withAffectedRuntime} from './affected-runtime.mjs';
await withAffectedRuntime('frontier-acquisition',async({page,activate,shot})=>{
 assert.deepEqual(await page.evaluate(()=>Object.keys(__frontier.game.ch.skills)),['slash']);
 assert.equal(await page.evaluate(()=>__frontier.game.ch.mods.length),0);
 assert.equal(await page.locator('.skill-sandbox').count(),0);
 for(const id of ['learn_charged_shot','learn_crystal_wall','mod_short_stride']){
  await page.evaluate(id=>{
   const f=__frontier,g=f.game,r=g.data.recipes.recipes[id],w=g.data.world.town.workbench;
   g.player.x=w[0];g.player.z=w[1];g.monsters=[];g.ch.gold=0;g.ch.materials={};
   for(const[k,n]of Object.entries(r.cost))if(k==='gold')g.ch.gold=n;else g.ch.materials[k]=n;
   f.panels.lastResult=null;f.panels.sel.craft=r.type;f.panels.sel.craftRecipe=id;f.panels.open('craft');
  },id);
  const before=await page.evaluate(()=>({gold:__frontier.game.ch.gold,nextUid:__frontier.game.ch.nextUid}));
  assert(await page.locator('[data-act="craft"]').isEnabled(),id+' workbench available');
  await shot(id+'-ready');await activate('[data-act="craft"]');
  const after=await page.evaluate(id=>{const g=__frontier.game,r=g.data.recipes.recipes[id];return {gold:g.ch.gold,materials:g.ch.materials,learned:g.ch.skills[r.result]||0,mods:g.ch.mods.filter(m=>m.id===r.result),nextUid:g.ch.nextUid};},id);
  assert.equal(after.gold,0);assert(Object.values(after.materials).every(n=>n===0));
  if(id.startsWith('learn_')){assert.equal(after.learned,1);assert.equal(after.nextUid,before.nextUid);}else {assert.equal(after.mods.length,1);assert.equal(after.mods[0].uid,before.nextUid);}
  assert(await page.locator('[data-act="craft"]').isDisabled());await shot(id+'-crafted');
 }
});
