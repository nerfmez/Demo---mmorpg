import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { Game } from '../../src/core/game.js';
import { createRng } from '../../src/core/rng.js';
import {
  CHARACTER_VERSION, createCharacter, migrateCharacter, derive, equip, unequip, enforceEquipment,
  gearPower, gearStats, gearRequirements, wearRequirements, handsOf, gearLook, arrowInUse, arrowTotal,
} from '../../src/core/character.js';
import { craft, recipeBlocker, sellGear, salvageGear, salvageMany, salvageReturn, toggleGearLock, gearSellValue } from '../../src/core/crafting.js';
import { powerOf, powerDelta } from '../../src/core/power.js';

const give = (ch, base, extra = {}) => {
  const item = { uid: ch.nextUid++, base, itemLevel: data.items.gearBases[base].itemLevel, grade: 'C', upgrade: 0, options: [], ...extra };
  ch.gear.push(item);
  return item;
};
const strong = (kit = 'sword') => {
  const ch = createCharacter(data, { kit });
  for (const s of Object.keys(ch.stats)) ch.stats[s] = 60;
  return ch;
};

test('weapon base power follows its hands: two-hand ~2x and heavy ~1.5x a light weapon of the same item level', () => {
  const rules = data.items.handRules, [lo, hi] = rules.tolerance;
  for (const [id, base] of Object.entries(data.items.gearBases)) {
    if (base.slot !== 'weapon') continue;
    const hands = data.items.weaponTypes[base.weaponType].hands;
    const ref = base.starter ? rules.reference.starter : rules.reference.base + rules.reference.perItemLevel * (base.itemLevel - 1);
    const ratio = gearPower(base.stats, data) / (rules[hands].baseFactor * ref);
    assert.ok(ratio >= lo && ratio <= hi, `${id} (${hands}) power ratio ${ratio.toFixed(2)}`);
  }
  // Base stats only: options are never multiplied by the hand factor.
  const opt = { id: 'attack_flat', value: 3 };
  assert.equal(gearStats({ base: 'horn_greatblade', grade: 'B', upgrade: 0, options: [opt] }, data).attack, data.items.gearBases.horn_greatblade.stats.attack + 3);
});

test('two light weapons dual-wield with no penalty but need the sum of both wear requirements', () => {
  const ch = strong();
  const a = give(ch, 'tusk_blade'), b = give(ch, 'fang_dagger');
  assert.ok(equip(ch, data, a.uid).ok);
  const alone = derive(ch, data);
  assert.ok(equip(ch, data, b.uid, 'offhand').ok);
  const both = derive(ch, data);
  assert.equal(both.dualWield, true);
  // Both items' base stats and implicits count in full.
  assert.ok(Math.abs(both.attack - alone.attack - gearStats(b, data).attack) < 0.11);
  assert.ok(both.critChancePct > alone.critChancePct);
  const sum = wearRequirements(ch, data, a, 'weapon');
  const own = gearRequirements(a, data), other = gearRequirements(b, data);
  for (const k of new Set([...Object.keys(own), ...Object.keys(other)])) assert.equal(sum[k], (own[k] || 0) + (other[k] || 0), k);
  // Not enough stats for the pair: refused, nothing changes.
  const weak = createCharacter(data, { kit: 'sword' });
  const c = give(weak, 'rusty_sword'), d = give(weak, 'rusty_sword');
  assert.ok(equip(weak, data, c.uid).ok);
  for (const s of Object.keys(weak.stats)) weak.stats[s] = 3;
  const before = { ...weak.equipped };
  const r = equip(weak, data, d.uid, 'offhand');
  assert.equal(r.ok, false);
  assert.deepEqual(weak.equipped, before);
  // A stat respec below the pair's sum puts the left hand back in the bag, never deletes it.
  ch.stats = { STR: 3, AGI: 3, VIT: 3, INT: 3, DEX: 3 };
  enforceEquipment(ch, data);
  assert.equal(ch.equipped.offhand, null);
  assert.ok(ch.gear.some((g) => g.uid === b.uid));
});

test('hands: heavy weapons take a shield but not a second weapon, two-hand weapons free the left hand', () => {
  const ch = strong();
  const sword = give(ch, 'tusk_blade'), dagger = give(ch, 'fang_dagger'), maul = give(ch, 'beetle_maul');
  const shield = give(ch, 'beetle_buckler'), great = give(ch, 'horn_greatblade');
  assert.equal(handsOf(data, maul), 'heavy');
  assert.equal(handsOf(data, shield), 'off');
  assert.equal(equip(ch, data, maul.uid, 'offhand').reason, 'slot', 'heavy weapons are right hand only');
  assert.ok(equip(ch, data, sword.uid).ok);
  assert.ok(equip(ch, data, dagger.uid, 'offhand').ok);
  // Switching to a heavy weapon returns the paired light weapon to the bag.
  const heavy = equip(ch, data, maul.uid);
  assert.ok(heavy.ok);
  assert.deepEqual(heavy.freed, [dagger.uid]);
  assert.equal(ch.equipped.offhand, null);
  assert.equal(equip(ch, data, dagger.uid, 'offhand').reason, 'needs_light');
  assert.ok(equip(ch, data, shield.uid).ok);
  assert.equal(derive(ch, data).offhand, 'shield');
  assert.ok(derive(ch, data).blockChance > 0);
  // A two-hand weapon frees the left hand; a shield then cannot go in.
  assert.ok(equip(ch, data, great.uid).ok);
  assert.equal(ch.equipped.offhand, null);
  assert.equal(equip(ch, data, shield.uid).reason, 'two_hand');
  // The right hand always holds something; a weapon cannot be in both hands.
  assert.equal(unequip(ch, data, 'weapon').ok, false);
  assert.equal(equip(ch, data, great.uid, 'offhand').ok, false);
  assert.equal(ch.equipped.weapon, great.uid);
  const look = gearLook(ch, data);
  assert.equal(look.weapon, 'greatblade');
  assert.equal(look.offhand, null);
});

test('gloves are their own slot and a shield blocks only frontal hits', () => {
  const ch = strong();
  const gloves = give(ch, 'hide_gloves'), shield = give(ch, 'crag_tower_shield');
  assert.ok(equip(ch, data, gloves.uid).ok);
  assert.equal(ch.equipped.gloves, gloves.uid);
  assert.equal(gearLook(ch, data).gloves, 'hide');
  assert.ok(equip(ch, data, shield.uid).ok);
  const g = new Game(data, { character: ch, seed: 2 });
  g.derived.blockChance = 1; // always block when allowed
  const p = g.player;
  p.facing = 0; // facing +Z
  const front = { kind: 'monster', x: p.x, z: p.z + 2 }, back = { kind: 'monster', x: p.x, z: p.z - 2 };
  const full = Math.max(1, Math.round(100 * (1 - g.derived.defense / (g.derived.defense + 60))));
  p.hp = p.maxHp = 1e6;
  g.damagePlayer(100, back);
  assert.equal(1e6 - p.hp, full, 'from behind: never blocked');
  p.hp = 1e6;
  g.damagePlayer(100, front);
  assert.equal(1e6 - p.hp, Math.max(1, Math.round(full * data.progression.combat.block.taken)), 'from the front: blocked');
  assert.ok(g.drainEvents().some((e) => e.type === 'playerHit' && e.blocked));
  p.hp = 1e6;
  g.damagePlayer(100, null);
  assert.equal(1e6 - p.hp, full, 'ground hazards are never blocked');
});

test('Attack+Projectile skills spend arrows, more with extra projectiles, and cannot fire without any', () => {
  const ch = strong('bow');
  ch.slots[0] = { skill: 'hunter_shot', mods: [] };
  const g = new Game(data, { character: ch, seed: 3 });
  const start = arrowTotal(g.ch);
  assert.equal(start, data.items.arrows.start.feather_arrow);
  assert.ok(g.castSlot(0));
  assert.equal(arrowTotal(g.ch), start - data.items.arrows.perCast);
  // Split adds projectiles and an extra arrow.
  g.player.cast = null;
  g.player.cooldowns[0] = 0;
  g.ch.mods.push({ uid: 900, id: 'split', level: 1, grade: 'C' });
  g.ch.slots[0].mods = [900];
  g.refresh();
  assert.ok(g.castSlot(0));
  assert.equal(arrowTotal(g.ch), start - 2 * data.items.arrows.perCast - data.items.arrows.multiShotExtra);
  // Spells never spend arrows.
  g.player.cast = null;
  g.ch.slots[1] = { skill: 'firebolt', mods: [] };
  g.refresh();
  const before = arrowTotal(g.ch);
  assert.ok(g.castSlot(1));
  assert.equal(arrowTotal(g.ch), before);
  // Empty: refused, no mana spent, and the reason is announced.
  g.player.cast = null;
  g.player.cooldowns[0] = 0;
  g.ch.arrows.stock = {};
  g.refresh();
  const mp = g.player.mp;
  g.drainEvents();
  assert.equal(g.castSlot(0), false);
  assert.equal(g.player.mp, mp);
  assert.ok(g.drainEvents().some((e) => e.type === 'fail' && e.reason === 'arrows'));
});

test('arrows: the type in use adds its stats with a bow, the next stocked type takes over, crafting is capped and refused in combat', () => {
  const ch = strong('bow');
  ch.arrows = { use: 'hawk_arrow', stock: { hawk_arrow: 1, feather_arrow: 5 } };
  const withHawk = derive(ch, data);
  assert.equal(withHawk.offhand, 'arrows');
  assert.equal(gearLook(ch, data).offhand, 'quiver');
  ch.slots[0] = { skill: 'hunter_shot', mods: [] };
  const g = new Game(data, { character: ch, seed: 4 });
  const pct = g.derived.projectileDamagePct;
  assert.ok(g.castSlot(0));
  assert.equal(arrowInUse(g.ch, data), 'feather_arrow', 'the empty type hands over');
  assert.ok(g.derived.projectileDamagePct < pct, 'stats re-derived for the new type');
  // Crafting: anywhere, but not in combat, and never past the quiver.
  g.ch.materials.shore_feather = 99;
  g.ch.gold = 999;
  g.inCombat = () => true;
  assert.equal(g.craftArrows('arrows_feather').reason, 'combat');
  g.inCombat = () => false;
  const r = g.craftArrows('arrows_feather');
  assert.ok(r.ok && r.qty === data.recipes.recipes.arrows_feather.qty);
  g.ch.arrows.stock.feather_arrow = data.items.arrows.capacity - 10;
  delete g.ch.arrows.stock.hawk_arrow;
  assert.equal(g.craftArrows('arrows_feather').qty, 10, 'trimmed to the quiver');
  assert.equal(recipeBlocker(g.ch, data, 'arrows_feather'), 'full');
  // Every arrow recipe makes a real type.
  for (const r of Object.values(data.recipes.recipes)) if (r.type === 'arrow') assert.ok(data.items.arrows.types[r.result]);
});

test('v5 saves gain the left hand, gloves and an arrow stock without losing equipment', () => {
  const ch = createCharacter(data, { kit: 'bow' });
  const weapon = ch.equipped.weapon;
  ch.version = 5;
  delete ch.arrows;
  delete ch.equipped.offhand;
  delete ch.equipped.gloves;
  const m = migrateCharacter(JSON.parse(JSON.stringify(ch)), data);
  assert.equal(m.version, CHARACTER_VERSION);
  assert.equal(m.equipped.weapon, weapon);
  assert.equal(m.equipped.offhand, null);
  assert.equal(m.equipped.gloves, null);
  assert.deepEqual(m.arrows.stock, data.items.arrows.start);
  // Repeat migration keeps the stock as it is.
  m.arrows.stock.feather_arrow = 7;
  assert.equal(migrateCharacter(JSON.parse(JSON.stringify(m)), data).arrows.stock.feather_arrow, 7);
});

test('power score folds every system and previews a change without touching the character', () => {
  const ch = strong();
  const base = powerOf(ch, data);
  assert.ok(base.power > 0 && base.offence > 0 && base.defence > 0);
  const great = give(ch, 'horn_greatblade');
  const snapshot = JSON.stringify(ch);
  const d = powerDelta(ch, data, (c) => equip(c, data, great.uid));
  assert.equal(JSON.stringify(ch), snapshot, 'preview only');
  assert.ok(d.ok && d.diff > 0 && d.offence > 0);
  const shield = give(ch, 'crag_tower_shield');
  assert.ok(powerDelta(ch, data, (c) => equip(c, data, shield.uid)).defence > 0);
  assert.equal(powerDelta(ch, data, (c) => equip(c, data, 99999)).ok, false);
  assert.ok(powerDelta(ch, data, (c) => { c.stats.STR += 5; }).diff > 0, 'stat points count');
});

test('gear sells for gold or salvages into part of its recipe; worn and locked items are refused', () => {
  const ch = strong();
  const worn = ch.gear[0];
  assert.equal(sellGear(ch, data, worn.uid).reason, 'equipped');
  const a = give(ch, 'crag_tower_shield', { grade: 'S', upgrade: 2 }), c = give(ch, 'crag_tower_shield');
  assert.ok(gearSellValue(data, a) > gearSellValue(data, c), 'grade and +N raise the price');
  const back = salvageReturn(data, a), backC = salvageReturn(data, c);
  for (const k of Object.keys(back)) assert.ok(data.items.materials[k], k);
  assert.ok(back.crag_stone > backC.crag_stone);
  toggleGearLock(ch, a.uid);
  assert.equal(salvageGear(ch, data, a.uid).reason, 'locked');
  toggleGearLock(ch, a.uid);
  const stone = ch.materials.crag_stone || 0;
  assert.ok(salvageGear(ch, data, a.uid).ok);
  assert.equal(ch.materials.crag_stone, stone + back.crag_stone);
  assert.ok(!ch.gear.some((g) => g.uid === a.uid));
  const gold = ch.gold, value = gearSellValue(data, c);
  assert.ok(sellGear(ch, data, c.uid).ok);
  assert.equal(ch.gold, gold + value);
  // Bulk salvage: only the chosen grades, never worn gear.
  const keep = give(ch, 'hide_gloves', { grade: 'A' });
  give(ch, 'hide_gloves');
  give(ch, 'wolf_grips');
  const many = salvageMany(ch, data, ['C']);
  assert.equal(many.count, 2);
  assert.ok(ch.gear.some((g) => g.uid === keep.uid));
  assert.ok(ch.gear.some((g) => g.uid === worn.uid));
});

test('every new gear recipe crafts with a real optionPool', () => {
  const ch = strong();
  ch.gold = 1e6;
  for (const k of Object.keys(data.items.materials)) ch.materials[k] = 999;
  for (const id of ['beetle_maul', 'crab_shield', 'beetle_buckler', 'crag_tower_shield', 'hide_gloves', 'shell_mitts', 'wolf_grips', 'wisp_wraps', 'crag_gauntlets']) {
    const r = craft(ch, data, id, createRng(1));
    assert.ok(r.ok, id);
    for (const o of r.item.options) assert.ok(data.items.gearOptions[o.id], id + ' ' + o.id);
  }
});

test('a higher mod rank asks for more stats: upgrades are refused until it can be met, and an unmet rank goes inactive', async () => {
  const { modRequires, computeSkill } = await import('../../src/core/skills.js');
  const { modUpgradeState } = await import('../../src/core/crafting.js');
  const split = data.mods.mods.split, step = data.progression.modUpgrade.requiresStatPerLevel;
  assert.ok(step > 0);
  assert.equal(modRequires(data, split, 3).DEX, split.requires.DEX + 2 * step);
  const ch = createCharacter(data, { kit: 'bow' });
  ch.level = 40;
  ch.gold = 1e6;
  for (const k of Object.keys(data.items.materials)) ch.materials[k] = 99;
  ch.stats.DEX = split.requires.DEX;
  const inst = { uid: 901, id: 'split', level: 1, grade: 'C' };
  ch.mods.push(inst);
  ch.slots[0] = { skill: 'hunter_shot', mods: [901] };
  assert.equal(modUpgradeState(ch, data, inst).reason, 'requires');
  ch.stats.DEX += step;
  assert.ok(modUpgradeState(ch, data, inst).ok);
  inst.level = 2;
  assert.equal(computeSkill(ch, data, derive(ch, data), 0).mods[0].active, true);
  ch.stats.DEX -= 1;
  const s = computeSkill(ch, data, derive(ch, data), 0);
  assert.equal(s.mods[0].active, false);
  assert.equal(s.projectiles, 1, 'an inactive mod changes nothing');
});
