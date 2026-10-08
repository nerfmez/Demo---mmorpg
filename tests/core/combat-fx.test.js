import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';

const fx = JSON.parse(readFileSync(new URL('../../data/combat-fx.json', import.meta.url), 'utf8'));
const KINDS = new Set(['splash', 'thrust', 'pincer', 'fangs', 'claw', 'smear']);

test('every weapon type has a blade trail look, and every melee strike a look of its own', () => {
  for (const w of [...Object.keys(data.items.weaponTypes).filter((k) => !k.startsWith('_')), 'none']) {
    const c = fx.weapons[w];
    assert.ok(c, `weapon type ${w} has a trail config`);
    assert.ok(c.tip > c.base && c.base >= 0, `${w}: the trail runs from base to a tip further out`);
    assert.ok(c.fullSpeed > c.minSpeed && c.life > 0, `${w}: speed band and life`);
  }
  // attacks that emit monsterSwing (src/core/ai.js): bite, sweep, shove and the planted contacts
  for (const name of ['bite', 'sweep', 'shove', 'slap', 'peck', 'pinch', 'scythe', 'claw', 'rend', 'rake']) {
    assert.ok(KINDS.has(fx.monsters[name]?.kind), `${name} has a known effect kind`);
  }
  const looks = Object.values(fx.monsters).map((m) => JSON.stringify(m));
  assert.equal(new Set(looks).size, looks.length, 'no two attacks share one look');
  for (const key of Object.keys(fx.overrides)) {
    const [type, attack] = key.split('.');
    assert.ok(data.monsters.monsters[type]?.attacks[attack], `override ${key} names a real monster attack`);
    assert.ok(fx.monsters[attack], `override ${key} tweaks an attack that has a look`);
  }
});

test('creatures strike with what they have: fangs bite, claws rake, a pincer snaps (no blade cuts)', () => {
  assert.equal(fx.monsters.bite.kind, 'fangs');
  for (const name of ['rend', 'rake', 'claw']) {
    const f = fx.monsters[name];
    assert.equal(f.kind, 'claw', `${name} rakes with claws`);
    assert.ok(f.count >= 3 && f.count <= 4, `${name}: three or four claw streaks`);
  }
  assert.equal(fx.monsters.pinch.kind, 'pincer');
  for (const [name, f] of Object.entries(fx.monsters)) {
    if (!['claw', 'fangs', 'pincer'].includes(f.kind)) continue;
    assert.ok(f.size > 0 && f.dur > 0.2 && f.dur < 0.8, `${name}: a readable but short mark`);
    assert.ok(f.height > 0.3 && f.height < 1.4, `${name}: drawn at body height`);
  }
});
