import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,CHARACTER_VERSION} from '../../src/core/character.js';
import {buyConsumable,buyState,assignQuickItem,restoreAmount} from '../../src/core/consumables.js';
import {Game} from '../../src/core/game.js';

const C=data.items.consumables;
const game=(ch)=>new Game(data,{seed:3,character:ch||createCharacter(data)});
const atShop=(g)=>{const s=data.world.town.shop;Object.assign(g.player,{x:s[0],z:s[1]});};

test('potion data: three sizes per kind, rising price and restore, every shop item is a known potion',()=>{
 for(const group of ['hp','mp']){
  const list=Object.entries(C.types).filter(([,t])=>t.group===group).sort((a,b)=>a[1].price-b[1].price);
  assert.deepEqual(list.map(([,t])=>t.size),['s','m','l'],group);
  for(let i=1;i<list.length;i++){
   const a=restoreAmount(data,list[i-1][0],500,200),b=restoreAmount(data,list[i][0],500,200);
   assert.ok(b[group]>a[group],group+' larger restores more');
  }
 }
 for(const id of data.items.shop.stock)assert.ok(C.types[id],id);
 assert.equal(C.quickSlots,4);
 for(const g of Object.values(C.types))assert.ok(C.groupCooldown[g.group]>0,'every group has a cooldown');
});

test('a new hero starts with potions in the quick slots; v6 saves get them once and keep everything else',()=>{
 const ch=createCharacter(data);
 assert.equal(ch.version,CHARACTER_VERSION);assert.equal(ch.quickItems.length,C.quickSlots);
 assert.deepEqual(ch.consumables,C.start);assert.equal(ch.quickItems[0],'hp_potion_s');
 const old=structuredClone(ch);old.version=6;delete old.consumables;delete old.quickItems;
 const keep={gold:old.gold,gear:structuredClone(old.gear),skills:structuredClone(old.skills),materials:structuredClone(old.materials)};
 const m=migrateCharacter(old,data);
 assert.equal(m.version,CHARACTER_VERSION);assert.deepEqual(m.consumables,C.start);assert.equal(m.quickItems.length,C.quickSlots);
 for(const k in keep)assert.deepEqual(m[k],keep[k],k+' preserved');
 // a v7 save keeps its own potions (no second gift) and drops unknown ids
 m.consumables={hp_potion_l:2,removed_potion:4};m.quickItems=['hp_potion_l','removed_potion'];
 const again=migrateCharacter(structuredClone(m),data);
 assert.deepEqual(again.consumables,{hp_potion_l:2});assert.deepEqual(again.quickItems,['hp_potion_l',null,null,null]);
});

test('buying spends gold atomically, respects the stack limit and fills an empty quick slot',()=>{
 const ch=createCharacter(data);ch.gold=1000;ch.quickItems=['hp_potion_s',null,null,null];
 const price=C.types.hp_potion_m.price;
 assert.ok(buyConsumable(ch,data,'hp_potion_m',5).ok);
 assert.equal(ch.gold,1000-price*5);assert.equal(ch.consumables.hp_potion_m,5);assert.equal(ch.quickItems[1],'hp_potion_m');
 ch.gold=price-1;let before=JSON.stringify(ch);
 assert.equal(buyConsumable(ch,data,'hp_potion_m',1).reason,'gold');assert.equal(JSON.stringify(ch),before);
 ch.gold=1e9;ch.consumables.hp_potion_m=C.stackMax;before=JSON.stringify(ch);
 assert.equal(buyConsumable(ch,data,'hp_potion_m',1).reason,'full');assert.equal(JSON.stringify(ch),before);
 assert.equal(buyState(ch,data,'not_a_potion',1).reason,'unknown');assert.equal(buyState(ch,data,'hp_potion_s',0).reason,'unknown');
});

test('quick slots: assigning moves a potion instead of duplicating it',()=>{
 const ch=createCharacter(data);ch.quickItems=['hp_potion_s','mp_potion_s',null,null];
 assert.ok(assignQuickItem(ch,data,3,'hp_potion_s').ok);assert.deepEqual(ch.quickItems,[null,'mp_potion_s',null,'hp_potion_s']);
 assert.ok(assignQuickItem(ch,data,1,'hp_potion_s').ok);assert.deepEqual(ch.quickItems,[null,'hp_potion_s',null,'mp_potion_s']);
 assert.ok(assignQuickItem(ch,data,1,null).ok);assert.equal(ch.quickItems[1],null);
 assert.equal(assignQuickItem(ch,data,9,'hp_potion_s').reason,'slot');
});

test('the shop sells only to a hero standing at the shopkeeper',()=>{
 const g=game();g.ch.gold=100;
 assert.equal(g.buyItem('hp_potion_s',1).reason,'far');assert.equal(g.ch.gold,100);
 atShop(g);assert.ok(g.nearby().shop);
 assert.ok(g.buyItem('hp_potion_s',2).ok);assert.equal(g.ch.gold,100-2*C.types.hp_potion_s.price);
 assert.ok(g.drainEvents().some(e=>e.type==='bought'));
});

test('drinking restores up to the maximum, spends one potion and starts only its own group cooldown',()=>{
 const g=game(),p=g.player;g.ch.consumables={hp_potion_l:2,mp_potion_s:1};g.ch.quickItems=['hp_potion_l','mp_potion_s',null,null];
 assert.equal(g.useQuickItem(0).reason,'full','a full hero does not waste a potion');assert.equal(g.ch.consumables.hp_potion_l,2);
 p.hp=1;p.mp=0;
 const r=g.useQuickItem(0);assert.ok(r.ok);
 assert.equal(p.hp,Math.min(p.maxHp,1+restoreAmount(data,'hp_potion_l',p.maxHp,p.maxMp).hp));assert.ok(p.hp<=p.maxHp);
 assert.equal(g.ch.consumables.hp_potion_l,1);
 p.hp=1;assert.equal(g.useQuickItem(0).reason,'cooldown');assert.equal(g.ch.consumables.hp_potion_l,1);
 assert.ok(g.useQuickItem(1).ok,'mana has its own cooldown');assert.equal(g.ch.consumables.mp_potion_s,undefined,'an empty stack is removed');
 assert.equal(g.ch.quickItems[1],'mp_potion_s','the slot remembers the potion to buy again');
 assert.equal(g.useQuickItem(1).reason,'none');assert.equal(g.useQuickItem(2).reason,'empty');
 for(let i=0;i<Math.ceil(C.groupCooldown.hp*30)+2;i++)g.update(1/30);
 p.hp=1;assert.ok(g.useQuickItem(0).ok,'usable again after the cooldown');
 p.dead=true;g.ch.consumables.hp_potion_l=1;assert.equal(g.useQuickItem(0).reason,'dead');
});

test('the shopkeeper stands on reachable, walkable ground in every town',()=>{
 for(const map of Object.values(data.maps||{[data.world.id]:data.world})){
  const s=map.town.shop;assert.ok(s,map.id+' has a shop');
  const g=new Game({...data,world:map},{seed:1,character:createCharacter({...data,world:map})});
  const spot=g.freeSpotNear(s[0],s[1]);assert.ok(Math.hypot(spot.x-s[0],spot.z-s[1])<1.5,map.id+' shop spot is free');
  Object.assign(g.player,spot);assert.ok(g.nearby().shop,map.id);assert.ok(g.isSafe(s[0],s[1]),map.id+' shop is inside the safe town');
 }
});
