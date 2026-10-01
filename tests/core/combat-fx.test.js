import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { SHAPES } from '../../src/render/fx-shapes.js';

const fx = JSON.parse(readFileSync(new URL('../../data/combat-fx.json', import.meta.url), 'utf8'));
const KINDS = new Set(['splash', 'thrust', 'snap', 'fangs', 'smear']);

test('every weapon type has a blade trail look, and every melee strike a look of its own', () => {
  for (const w of [...Object.keys(data.items.weaponTypes).filter((k) => !k.startsWith('_')), 'none']) {
    const c = fx.weapons[w];
    assert.ok(c, `weapon type ${w} has a trail config`);
    assert.ok(c.tip > c.base && c.base >= 0, `${w}: the trail runs from base to a tip further out`);
    assert.ok(c.fullSpeed > c.minSpeed && c.life > 0, `${w}: speed band and life`);
  }
  // attacks that emit monsterSwing (src/core/ai.js): bite, sweep and the coastal contacts
  for (const name of ['bite', 'sweep', 'slap', 'peck', 'pinch']) {
    assert.ok(KINDS.has(fx.monsters[name]?.kind), `${name} has a known effect kind`);
  }
  const kinds = Object.values(fx.monsters).map((m) => m.kind);
  assert.equal(new Set(kinds).size, kinds.length, 'no two attacks share one look');
  for (const key of Object.keys(fx.overrides)) {
    const [type, attack] = key.split('.');
    assert.ok(data.monsters.monsters[type]?.attacks[attack], `override ${key} names a real monster attack`);
    assert.ok(fx.monsters[attack], `override ${key} tweaks an attack that has a look`);
  }
});

test('skill looks name real skills, known shapes and positive sizes; casts gather at a focus weapon or the hand', () => {
  assert.ok(fx.weapons.staff.focus && fx.weapons.wand.focus, 'staff and wand gather spells at their tip');
  const shapes = new Set(Object.keys(SHAPES));
  for (const [id, look] of Object.entries(fx.skills)) {
    const skill = data.skills.combat[id];
    assert.ok(skill, `${id} is a combat skill`);
    if (look.travel) assert.equal(skill.kind, 'projectile', `${id}: only projectiles have a travel look`);
    for (const [beat, cfg] of Object.entries(look)) {
      assert.ok(['cast', 'travel', 'impact'].includes(beat), `${id}: ${beat} is a known beat`);
      for (const [key, value] of Object.entries(cfg)) {
        if (/shape$/i.test(key)) assert.ok(shapes.has(value), `${id}.${beat}.${key}: ${value} is an fx-shapes.js shape`);
        else if (/Color$/.test(key)) assert.match(value, /^#[0-9a-f]{6}$/i, `${id}.${beat}.${key} is a hex colour`);
        else assert.ok(Number.isFinite(value) && value >= 0, `${id}.${beat}.${key} is a non-negative number`);
      }
    }
    // an impact shorter than one frame at 30 fps would not be seen on the iPad
    if (look.impact) assert.ok(look.impact.flashLife >= 1 / 30 && look.impact.flash > 0, `${id}: the impact flash is visible`);
  }
  assert.ok(fx.skills.firebolt?.cast && fx.skills.firebolt.travel && fx.skills.firebolt.impact, 'firebolt has all three beats');
});
