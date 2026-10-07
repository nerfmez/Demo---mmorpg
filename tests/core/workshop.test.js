import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../src/core/data-node.js';
import { createCharacter, gearStats } from '../../src/core/character.js';
import { createRng } from '../../src/core/rng.js';
import { craft, craftBatch, upgradeGear, promoteGear } from '../../src/core/crafting.js';
import { forgePreview, forgeItems, executeWorkshop, workshopCostRows } from '../../src/ui/workshop-model.js';
import { createWorkshopController } from '../../src/ui/workshop-controller.js';
import { MENU_PAGES, MENU_GROUPS } from '../../src/ui/menu-map.js';

const data = loadData(), clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const ch = createCharacter(data);
  ch.gold = 100000; for (const id in data.items.materials) ch.materials[id] = 500;
  const game = { ch, data, rng: createRng(771), near: true, combat: false, events: [],
    nearby() { return { workbench: this.near }; }, inCombat() { return this.combat; },
    notify(event) { this.events.push(event); },
    craftArrows(id) { if (this.combat) return { ok:false,reason:'combat' }; const result=craft(ch,data,id,this.rng); if(result.ok)this.notify({type:'craft'}); return result; },
  };
  return game;
}
function controlled(game, reduced = false) {
  const callbacks = new Map(), cancelled = [], waits = []; let next = 0;
  const ui = { game, tab:'forge', sel:{}, saves:[], rendered:0, render(){ this.rendered++; },
    changed(){ this.saves.push(clone(game.ch)); this.render(); }, recordCraft(){},
    open(tab){ this.workshop.close(); this.tab=tab; this.render(); }, body:{ addEventListener(){},querySelector(){return null;} },
  };
  ui.workshop = createWorkshopController(ui, { reducedMotion:()=>reduced,
    schedule(fn, ms){const id=++next;callbacks.set(id,fn);waits.push(ms);return id;},
    cancel(id){cancelled.push(id);callbacks.delete(id);},
  });
  return {ui,callbacks,cancelled,waits,finish(){for(const fn of [...callbacks.values()])fn();callbacks.clear();}};
}

test('the workshop is discoverable without entering the bag', () => {
  assert.ok(MENU_PAGES.forge);assert.ok(MENU_GROUPS.some(g=>g.pages.includes('forge')));
  assert.ok(MENU_GROUPS.some(g=>g.pages.includes('craft')));
});
test('preview, cost rows and filtering never spend or advance seeded RNG', () => {
  const a=fixture(),b=fixture(),saved=JSON.stringify(a.ch);
  for(const mode of ['upgrade','grade']){
    const p=forgePreview(a,a.ch.gear[0].uid,mode);assert.ok(p.next);workshopCostRows(a,p.state.cost);
  }
  forgeItems(a);forgeItems(a,'weapon');assert.equal(JSON.stringify(a.ch),saved);assert.equal(a.rng.next(),b.rng.next());
});
test('upgrade matches the old core transaction and preview exactly', () => {
  const a=fixture(),b=fixture(),uid=a.ch.gear[0].uid,p=forgePreview(a,uid);
  const expected=upgradeGear(b.ch,data,uid),result=executeWorkshop(a,'gear-up',{uid});
  assert.ok(result.ok&&expected.ok);assert.deepEqual(a.ch,b.ch);assert.deepEqual(gearStats(result.item,data),p.after);
  assert.deepEqual(result.spent,p.state.cost);assert.equal(result.items[0].uid,uid);assert.equal(result.before.upgrade,0);
  assert.deepEqual(result.item.options,result.before.options);assert.equal(a.events.length,0);
});
test('promotion preserves old rolls and enhancement and matches original RNG', () => {
  const a=fixture(),b=fixture(),uid=a.ch.gear[0].uid;
  a.ch.gear[0].upgrade=b.ch.gear[0].upgrade=2;
  const before=clone(a.ch.gear[0]),result=executeWorkshop(a,'gear-grade',{uid});
  const expected=promoteGear(b.ch,data,uid,b.rng);
  assert.ok(result.ok&&expected.ok);assert.deepEqual(a.ch,b.ch);assert.equal(a.rng.next(),b.rng.next());
  assert.equal(result.item.upgrade,2);assert.deepEqual(result.item.options.slice(0,before.options.length),before.options);
  assert.equal(result.item.options.length,data.items.grades.optionCount[result.item.grade]);
});
test('unaffordable, far, capped, invalid and deleted-item requests cannot pay', () => {
  for(const setup of [g=>{g.ch.gold=0;},g=>{g.near=false;},g=>{g.ch.gear[0].upgrade=data.items.upgrade.max;},g=>{g.ch.gear=[];}]){
    const g=fixture(),uid=g.ch.gear[0].uid;setup(g);const before=JSON.stringify(g.ch);
    assert.equal(executeWorkshop(g,'gear-up',{uid}).ok,false);assert.equal(JSON.stringify(g.ch),before);assert.equal(g.events.length,0);
  }
  const g=fixture(),before=JSON.stringify(g.ch);
  for(const uid of [undefined,NaN,Infinity,-1,'abc'])assert.equal(executeWorkshop(g,'gear-up',{uid}).ok,false);
  assert.equal(executeWorkshop(g,'other',{id:'tusk_blade'}).ok,false);assert.equal(JSON.stringify(g.ch),before);
});
test('grade cap or exhausted option pool does not charge', () => {
  const g=fixture();g.ch.gear[0].grade=data.items.grades.order.at(-1);const before=JSON.stringify(g.ch);
  assert.equal(executeWorkshop(g,'gear-grade',{uid:g.ch.gear[0].uid}).ok,false);assert.equal(JSON.stringify(g.ch),before);
});
test('a craft pays once, allocates exactly one uid, and emits one craft event', () => {
  const a=fixture(),b=fixture(),oldUid=a.ch.nextUid,oldLength=a.ch.gear.length;
  const result=executeWorkshop(a,'craft',{id:'tusk_blade'});craft(b.ch,data,'tusk_blade',b.rng);
  assert.ok(result.ok);assert.deepEqual(a.ch,b.ch);assert.equal(a.ch.nextUid,oldUid+1);assert.equal(a.ch.gear.length,oldLength+1);
  assert.equal(a.events.filter(e=>e.type==='craft').length,1);assert.equal(result.items[0].uid,oldUid);
});
test('batch uses the old stop conditions and retains every actual result', () => {
  const a=fixture(),b=fixture(),goal={attempts:5,grade:'A',option:null,quality:0};
  const expected=craftBatch(b.ch,data,'tusk_blade',b.rng,goal),result=executeWorkshop(a,'craft-batch',{id:'tusk_blade',goal});
  assert.ok(result.ok);assert.deepEqual(a.ch,b.ch);assert.deepEqual(result.spent,expected.spent);
  assert.equal(result.items.length,expected.items.length);assert.equal(result.reason,expected.reason);assert.equal(a.events.length,result.items.length);
});
test('arrows retain combat/capacity rules and notify only once', () => {
  const g=fixture(),[id,recipe]=Object.entries(data.recipes.recipes).find(([,r])=>r.type==='arrow');
  g.ch.arrows.stock={[recipe.result]:data.items.arrows.capacity-1};
  assert.equal(executeWorkshop(g,'craft-arrows',{id}).qty,1);assert.equal(g.events.length,1);
  const before=JSON.stringify(g.ch);assert.equal(executeWorkshop(g,'craft-arrows',{id}).ok,false);assert.equal(JSON.stringify(g.ch),before);
  g.ch.arrows.stock={};g.combat=true;assert.equal(executeWorkshop(g,'craft-arrows',{id}).reason,'combat');
});
test('skills, movement and mods still use their original crafting commands', () => {
  for(const type of ['skill','movement','mod']){
    const a=fixture(),b=fixture(),[id,r]=Object.entries(data.recipes.recipes).find(([,r])=>r.type===type);
    if(type==='skill'){delete a.ch.skills[r.result];delete b.ch.skills[r.result];}
    if(type==='movement'){a.ch.movementSkills=a.ch.movementSkills.filter(x=>x!==r.result);b.ch.movementSkills=b.ch.movementSkills.filter(x=>x!==r.result);}
    assert.ok(executeWorkshop(a,'craft',{id}).ok);assert.ok(craft(b.ch,data,id,b.rng).ok);assert.deepEqual(a.ch,b.ch);assert.equal(a.events.length,1);
  }
});
test('rapid repeated actions cannot pay a second time during feedback', () => {
  const g=fixture(),t=controlled(g),uid=g.ch.gear[0].uid;
  assert.ok(t.ui.workshop.run('gear-up',{uid}).ok);const paid=JSON.stringify(g.ch);
  assert.equal(t.ui.workshop.run('gear-up',{uid}).reason,'busy');assert.equal(JSON.stringify(g.ch),paid);assert.equal(t.ui.saves.length,1);
  assert.equal(t.ui.saves[0].gear[0].upgrade,1);t.finish();assert.equal(t.ui.workshop.busy,false);
  assert.ok(t.ui.workshop.run('gear-up',{uid}).ok);assert.equal(g.ch.gear[0].upgrade,2);
});
test('closing, replaying stale callbacks and reopening cannot roll, refund or spend', () => {
  const g=fixture(),t=controlled(g);t.ui.workshop.run('craft',{id:'tusk_blade'});
  const late=[...t.callbacks.values()][0],paid=JSON.stringify(g.ch),version=g.ch.version;
  t.ui.workshop.close();late();t.ui.open('craft');
  assert.equal(JSON.stringify(g.ch),paid);assert.equal(t.ui.saves.length,1);assert.equal(t.callbacks.size,0);assert.equal(t.ui.workshop.busy,false);
  assert.equal(t.ui.workshop.receipt.items[0].uid,g.ch.nextUid-1);assert.equal(g.ch.version,version);
  assert.equal('workshop' in g.ch,false);assert.deepEqual(JSON.parse(JSON.stringify(g.ch)),t.ui.saves[0]);
});
test('reduced motion shortens only cosmetic feedback, not rules or RNG', () => {
  const a=fixture(),b=fixture(),fast=controlled(a,true),normal=controlled(b,false);
  fast.ui.workshop.run('craft',{id:'tusk_blade'});normal.ui.workshop.run('craft',{id:'tusk_blade'});
  assert.deepEqual(a.ch,b.ch);assert.deepEqual(fast.waits,[300]);assert.deepEqual(normal.waits,[900]);
  fast.finish();normal.finish();assert.deepEqual(a.ch,b.ch);
});
for (const reduced of [false, true]) test(`cancel/skip and stale timers preserve one roll and the next busy guard (reduced=${reduced})`, () => {
  const g=fixture(),expected=fixture(),t=controlled(g,reduced);
  const first=t.ui.workshop.run('craft',{id:'tusk_blade'});
  executeWorkshop(expected,'craft',{id:'tusk_blade'});
  const late=[...t.callbacks.values()][0],paid=JSON.stringify(g.ch);
  assert.equal(t.ui.workshop.run('craft',{id:'tusk_blade'}).reason,'busy');
  t.ui.workshop.finish();late();t.ui.open('craft');
  assert.equal(JSON.stringify(g.ch),paid);assert.equal(t.ui.workshop.receipt,first);
  assert.equal(t.ui.saves.length,1);assert.deepEqual(g.events,expected.events);
  const second=t.ui.workshop.run('craft',{id:'tusk_blade'});
  executeWorkshop(expected,'craft',{id:'tusk_blade'});late();
  assert.equal(t.ui.workshop.busy,true,'old completion cannot unlock a new operation');
  assert.equal(t.ui.workshop.run('craft',{id:'tusk_blade'}).reason,'busy');
  t.ui.workshop.close();t.ui.open('craft');t.finish();
  assert.equal(t.ui.workshop.receipt,second);assert.equal(t.ui.saves.length,2);
  assert.deepEqual(g.ch,expected.ch);assert.deepEqual(g.events,expected.events);
  assert.equal(g.rng.next(),expected.rng.next(),'cosmetic callbacks never consume RNG');
});
test('a failed request shows no success animation or save', () => {
  const g=fixture(),t=controlled(g);g.near=false;
  assert.equal(t.ui.workshop.run('gear-up',{uid:g.ch.gear[0].uid}).ok,false);
  assert.equal(t.ui.workshop.busy,false);assert.equal(t.ui.workshop.receipt,null);assert.equal(t.callbacks.size,0);assert.equal(t.ui.saves.length,0);
});
test('bag shortcuts open the selected uid in the workshop, without spending', () => {
  const g=fixture(),t=controlled(g),uid=g.ch.gear[0].uid,before=JSON.stringify(g.ch);t.ui.tab='bag';
  assert.ok(t.ui.workshop.handle({dataset:{act:'forge-open',uid:String(uid),mode:'grade'}}));
  assert.equal(t.ui.tab,'forge');assert.equal(t.ui.sel.forgeUid,uid);assert.equal(t.ui.sel.forgeMode,'grade');assert.equal(JSON.stringify(g.ch),before);
});
test('same-base duplicate items are not confused and currency does not reorder choices', () => {
  const g=fixture();const r=executeWorkshop(g,'craft',{id:'tusk_blade'}),other=executeWorkshop(g,'craft',{id:'tusk_blade'});
  const id=r.items[0].uid,otherId=other.items[0].uid,order=forgeItems(g).map(i=>i.uid);
  executeWorkshop(g,'gear-up',{uid:otherId});assert.equal(g.ch.gear.find(i=>i.uid===id).upgrade,0);assert.equal(g.ch.gear.find(i=>i.uid===otherId).upgrade,1);
  g.ch.gold=0;g.ch.materials={};assert.deepEqual(forgeItems(g).map(i=>i.uid),order);
});
test('missing materials are calculated per ingredient from the same actual cost', () => {
  const g=fixture();g.ch.materials.enhancement_stone=2;g.ch.gold=3;
  assert.deepEqual(workshopCostRows(g,{enhancement_stone:4,gold:35}).map(r=>[r.id,r.have,r.need,r.missing]),[['enhancement_stone',2,4,2],['gold',3,35,32]]);
});
