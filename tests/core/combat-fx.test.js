import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';

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
