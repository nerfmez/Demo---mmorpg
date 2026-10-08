import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {Game} from '../../src/core/game.js';
import {createCharacter,migrateCharacter} from '../../src/core/character.js';
import {configureAutoPotion,automaticPotion,normalizeAutoPotions} from '../../src/core/consumables.js';
const game=()=>{const g=new Game(data,{seed:3});g.monsters=[];g.derived.hpRegen=g.derived.mpRegen=0;g.isSafe=()=>false;return g;};
const enable=(g,group,threshold=35,potion=null)=>configureAutoPotion(g.ch,data,group,{enabled:true,threshold,potion});
test('new and v11 saves default both automatic potions OFF without changing ownership; v12 reload keeps choices',()=>{
 const ch=createCharacter(data);assert.equal(ch.autoPotions.hp.enabled,false);assert.equal(ch.autoPotions.mp.enabled,false);
 ch.version=11;ch.autoPotions.hp.enabled=true;ch.gold=777;ch.skills.firebolt=3;ch.consumables.hp_potion_l=2;
 const keep=structuredClone(ch),m=migrateCharacter(ch,data);
 for(const key of ['gold','skills','consumables','quickItems','gear','arrows'])assert.deepEqual(m[key],keep[key]);
 assert.equal(m.autoPotions.hp.enabled,false);enable({ch:m},'hp',42,'hp_potion_l');enable({ch:m},'mp',18);
 const reloaded=migrateCharacter(JSON.parse(JSON.stringify(m)),data);assert.deepEqual(reloaded.autoPotions,m.autoPotions);
});
test('threshold comparison is inclusive; above, OFF and full resources spend nothing',()=>{
 const g=game(),p=g.player;enable(g,'hp',35);
 p.hp=p.maxHp*.35+.001;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,5);
 p.hp=p.maxHp*.35;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,4);
 const event=g.drainEvents().find(e=>e.type==='potion');assert.equal(event.automatic,true);
 g.player.itemCooldowns={};enable(g,'hp',100);p.hp=p.maxHp;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,4);
 g.ch.autoPotions.hp.enabled=false;p.hp=1;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,4);
});
test('HP and MP each spend one eligible potion per frame, respect group cooldown, and share manual cooldown',()=>{
 const g=game(),p=g.player;enable(g,'hp',90);enable(g,'mp',90);p.hp=1;p.mp=0;
 g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,4);assert.equal(g.ch.consumables.mp_potion_s,2);
 g.useAutomaticPotions();assert.equal(g.ch.consumables.hp_potion_s,4,'no second same-frame use');
 p.hp=1;p.mp=0;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,4);assert.equal(g.useQuickItem(0).reason,'cooldown');
 for(let i=0;i<101;i++)g.update(.05);
 assert.equal(g.ch.consumables.hp_potion_s,3);assert.equal(g.ch.consumables.mp_potion_s,1);
 g.ch.autoPotions.hp.enabled=false;p.itemCooldowns.hp=0;p.hp=1;assert.ok(g.useQuickItem(0).ok,'manual remains usable');
 g.ch.autoPotions.hp.enabled=true;p.hp=1;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,2,'automatic cannot duplicate a manual use');
});
test('quick-slot selection is left-to-right and stocked; explicit size does not silently substitute',()=>{
 const g=game();g.ch.consumables={hp_potion_m:2,hp_potion_l:3};g.ch.quickItems=['hp_potion_s','hp_potion_l','hp_potion_m',null];
 enable(g,'hp',90);assert.equal(automaticPotion(g.ch,data,'hp'),'hp_potion_l');g.player.hp=1;g.update(.01);assert.equal(g.ch.consumables.hp_potion_l,2);
 enable(g,'hp',90,'hp_potion_s');g.player.itemCooldowns.hp=0;g.player.hp=1;g.update(.01);assert.equal(g.ch.consumables.hp_potion_l,2);
 enable(g,'hp',90,'hp_potion_m');g.update(.01);assert.equal(g.ch.consumables.hp_potion_m,1,'explicit inventory potion need not occupy a quick slot');
});
test('no stock produces no failure spam; stocking it later works; pause, death, zero dt and prohibited frames consume nothing',()=>{
 const g=game(),p=g.player;enable(g,'hp',80);g.ch.consumables={};p.hp=1;g.drainEvents();
 for(let i=0;i<50;i++)g.update(.01);assert.equal(g.drainEvents().filter(e=>e.type==='fail'||e.type==='potion').length,0);
 g.ch.consumables.hp_potion_s=2;const before=g.time;g.update(.1,{paused:true});assert.equal(g.time,before);assert.equal(g.ch.consumables.hp_potion_s,2);
 g.update(0);g.update(.01,{allowAutoPotions:false});assert.equal(g.ch.consumables.hp_potion_s,2);
 p.dead=true;p.respawnT=10;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,2);
 p.dead=false;p.hp=1;g.update(.01);assert.equal(g.ch.consumables.hp_potion_s,1);
});
test('invalid settings are rejected or normalized without consuming inventory',()=>{
 const ch=createCharacter(data);assert.equal(configureAutoPotion(ch,data,'hp',{potion:'mp_potion_l'}).ok,false);
 assert.equal(configureAutoPotion(ch,data,'hp',{threshold:NaN}).ok,false);
 configureAutoPotion(ch,data,'hp',{threshold:0});assert.equal(ch.autoPotions.hp.threshold,1);
 configureAutoPotion(ch,data,'mp',{threshold:150});assert.equal(ch.autoPotions.mp.threshold,100);
 ch.autoPotions={hp:{enabled:'true',threshold:Infinity,potion:'removed'}};normalizeAutoPotions(ch,data);assert.equal(ch.autoPotions.hp.enabled,false);assert.equal(ch.autoPotions.hp.potion,null);assert.equal(ch.autoPotions.mp.enabled,false);
});
