import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createCharacter, derive, migrateCharacter, equip, arrowsPerCast, arrowTotal } from '../../src/core/character.js';
import { computeSkill, modFits, socketMod } from '../../src/core/skills.js';
import { craft, upgradeSkill, skillUpgradeState } from '../../src/core/crafting.js';
import { updateMonster } from '../../src/core/ai.js';
const ids = ['heavy_draw', 'arrow_rain', 'pinning_arrow'];
function arena(id) {
  const g = new Game(data, { seed: 17 });
  for (const k in g.ch.stats) g.ch.stats[k] = 20;
  const bow = { uid:g.ch.nextUid++, base:'old_bow', grade:'C', upgrade:0, options:[], itemLevel:1 };
  g.ch.gear.push(bow); assert(equip(g.ch, data, bow.uid).ok);
  g.ch.skills[id] = 1; g.ch.slots[0] = { skill:id, mods:[] }; g.ch.arrows.stock = { feather_arrow:20 }; g.refresh(true);
  Object.assign(g.player, { x:0, z:0 });
  const m = g.spawnMinion('tusk_boar', 1, 3, 0);
  Object.assign(m, { hp:10000, maxHp:10000, defense:0, homeX:3, homeZ:0 }); g.monsters = [m];
  g.world = { surfaceY:()=>0, isFree:()=>true, move:(x,z,r,dx,dz)=>({x:x+dx,z:z+dz,blocked:false}), bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100} };
  g.isSafe = () => false; g.drainEvents();
  return { g, m, s:g.skills[0] };
}
function mod(g,id,level=1) { const inst={uid:g.ch.nextUid++,id,level};g.ch.mods.push(inst);assert(socketMod(g.ch,data,0,inst.uid).ok);g.refresh();return g.skills[0]; }
test('exactly three new learnable bow skills; Hunter Shot remains the starting bow basic',()=>{
  const ch=createCharacter(data);assert.equal(ch.skills.hunter_shot,1);
  for(const id of ids){assert.equal(ch.skills[id],undefined);assert.deepEqual(data.skills.combat[id].requiresWeapon,['bow']);assert.equal(data.recipes.recipes['learn_'+id].result,id);}
});
test('new skills preserve current crystal/gold/stat-only rank gates, and save/load preserves rank/mods',()=>{
  for(const id of ids){
    const ch=createCharacter(data);ch.level=1;ch.gold=10000;ch.stats.DEX=30;
    for(const [k,v] of Object.entries(data.recipes.recipes['learn_'+id].cost))if(k!=='gold')ch.materials[k]=v;
    assert(craft(ch,data,'learn_'+id).ok);ch.materials.skill_crystal=30;
    const cost=skillUpgradeState(ch,data,id).cost;assert(cost.skill_crystal>0&&cost.gold>0);
    ch.stats.DEX=1;assert.equal(upgradeSkill(ch,data,id).reason,'requires');ch.stats.DEX=30;
    while(ch.skills[id]<data.progression.skillUpgrade.maxLevel)assert(upgradeSkill(ch,data,id).ok);
    ch.slots[0]={skill:id,mods:[]};const loaded=migrateCharacter(JSON.parse(JSON.stringify(ch)),data);
    assert.equal(loaded.skills[id],ch.skills[id]);assert.deepEqual(loaded.slots[0],ch.slots[0]);
  }
});
test('rain accepts area mods and rejects trajectory mods; pin rejects knockback even on a loaded slot',()=>{
  for(const id of ['split','pierce','bounce'])assert.equal(modFits(data.skills.combat.arrow_rain,data.mods.mods[id]).ok,false);
  for(const id of ['echo','concentrated','burning_ground','frost_shift','knockback','life_leech'])assert(modFits(data.skills.combat.arrow_rain,data.mods.mods[id]).ok,id);
  for(const skill of ['heavy_draw','pinning_arrow'])for(const id of ['split','pierce','bounce','frost_shift','burning_ground'])assert(modFits(data.skills.combat[skill],data.mods.mods[id]).ok);
  const {g}=arena('pinning_arrow');const inst={uid:g.ch.nextUid++,id:'knockback',level:1};g.ch.mods.push(inst);assert.equal(socketMod(g.ch,data,0,inst.uid).reason,'root_no_knockback');
  g.ch.slots[0].mods=[inst.uid];assert.equal(computeSkill(g.ch,data,g.derived,0).knock,0);
});
test('fixed heavy wind-up survives action speed; tap auto-target and manual drag use existing input',()=>{
  const {g}=arena('heavy_draw');const d={...derive(g.ch,data),castSpeedPct:100};assert.equal(computeSkill(g.ch,data,d,0).castTime,.55);
  assert(g.castSlot(0));assert.equal(g.projectiles.length,0);assert.equal(g.player.cast.aim.angle,Math.PI/2);
  g.updatePlayer(.54);assert.equal(g.projectiles.length,0);g.updatePlayer(.02);assert.equal(g.projectiles.length,1);
  g.player.cast=null;g.player.cooldowns[0]=0;g.setAimAngle(-Math.PI/2,true);assert(g.castSlot(0));assert.equal(g.player.cast.aim.angle,-Math.PI/2);
});
test('heavy Split can hit each target only once; later casts can hit again',()=>{
  const {g,m}=arena('heavy_draw');const s=mod(g,'split');
  for(let cast=0;cast<2;cast++){
    g.executeSkill(s,{angle:Math.PI/2,x:0,z:0});assert.equal(g.projectiles.length,3);
    // Model all three arrows overlapping a close-range body at contact.
    for(const pr of g.projectiles){pr.x=m.x;pr.z=m.z;pr.vx=pr.vz=0;}
    g.updateProjectiles(.001);const ev=g.drainEvents();assert.equal(ev.filter(e=>e.type==='hit').length,1);g.projectiles=[];
  }
});
test('explicit rain ammo is per cast, legacy ammo unchanged and insufficient resources atomic',()=>{
  for(const id of ids){const {g}=arena(id);assert.equal(arrowsPerCast(data,g.skills[0]),id==='arrow_rain'?3:1);
    const need=arrowsPerCast(data,g.skills[0]);g.ch.arrows.stock={feather_arrow:need-1};const mp=g.player.mp;
    assert.equal(g.castSlot(0),false);assert.equal(g.player.mp,mp);assert.equal(g.player.cooldowns[0],0);assert.equal(g.player.cast,null);assert.equal(arrowTotal(g.ch),need-1);
    g.ch.arrows.stock={feather_arrow:20};g.player.mp=0;assert.equal(g.castSlot(0),false);assert.equal(arrowTotal(g.ch),20);
    g.player.mp=100;assert(g.castSlot(0));assert.equal(arrowTotal(g.ch),20-need);
  }
  const {g}=arena('heavy_draw');assert.equal(arrowsPerCast(data,mod(g,'split')),2);
  assert.equal(arrowsPerCast(data,{tags:new Set(['Spell','Projectile']),projectiles:3}),0);
  assert.equal(arrowsPerCast(data,{tags:new Set(['Attack','Projectile']),projectiles:3}),2);
});
test('rain makes three area contacts at one fixed point; leaving avoids remaining waves; echo and concentration work',()=>{
  const {g,m}=arena('arrow_rain');const s=mod(g,'echo');const c=mod(g,'concentrated');assert.equal(c.radius,s.radius*.7);
  g.executeSkill(c,{x:m.x,z:m.z,angle:0});assert.equal(g.projectiles.length,0);assert.equal(g.areas.length,6);
  assert(g.areas.every(a=>a.x===3&&a.z===0));g.updateAreas(c.delay-.01);assert.equal(m.hp,10000);g.updateAreas(.02);
  assert.equal(g.drainEvents().filter(e=>e.type==='hit').length,1);m.x=20;
  for(let i=0;i<20;i++)g.updateAreas(.1);assert.equal(g.drainEvents().filter(e=>e.type==='hit').length,0);assert.equal(g.areas.length,0);
  m.x=3;g.executeSkill(g.skills[0],{x:3,z:0,angle:0});for(let i=0;i<20;i++)g.updateAreas(.1);assert.equal(g.drainEvents().filter(e=>e.type==='hit').length,6);
});
test('root holds movement without cancelling attack wind-up, expires and cannot be extended through immunity',()=>{
  const {g,m,s}=arena('pinning_arrow');
  Object.assign(m,{state:'windup',stateT:.05,windup:{name:'bite',total:.1,angle:-Math.PI/2},aggro:true});
  g.hitMonster(m,1,g.hitOpts(s));assert.equal(m.statuses.root.t,.9);g.moveEntity(m,1,0);assert.equal(m.x,3);
  const first=m.statuses.root.t;g.hitMonster(m,1,g.hitOpts(s));assert.equal(m.statuses.root.t,first);
  updateMonster(g,m,.1);assert.equal(m.state,'recover','already started bite executes');
  g.tickStatuses(m,1);assert.equal(m.statuses.root,undefined);g.hitMonster(m,1,g.hitOpts(s));assert.equal(m.statuses.root,undefined);
  g.tickStatuses(m,3);g.hitMonster(m,1,g.hitOpts(s));assert(m.statuses.root);g.tickStatuses(m,1);g.moveEntity(m,1,0);assert.equal(m.x,4);
});
test('boss root and control passives stay capped; wrong weapon/stats do not consume resources',()=>{
  const {g,m}=arena('pinning_arrow');const s=computeSkill(g.ch,data,{...g.derived,controlDurationPct:500},0);
  assert.equal(s.root.duration,1.2);assert.equal(s.root.bossDuration,.35);m.boss=true;g.hitMonster(m,1,g.hitOpts(s));assert.equal(m.statuses.root.t,.35);
  for(const id of ids){const {g}=arena(id);const mp=g.player.mp, stock=arrowTotal(g.ch);
    g.ch.equipped.weapon=null;g.refresh();assert.equal(g.castSlot(0),false);assert.equal(g.player.mp,mp);assert.equal(arrowTotal(g.ch),stock);
  }
});
