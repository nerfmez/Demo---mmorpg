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

test('creatures strike with what they have: trails come out of their own claws, jaws and pincers', () => {
  const models = JSON.parse(readFileSync(new URL('../../data/models.json', import.meta.url), 'utf8')).monsters;
  assert.equal(fx.monsters.bite.kind, 'fangs');
  assert.equal(fx.monsters.pinch.kind, 'pincer');
  for (const name of ['rend', 'rake', 'claw']) {
    assert.equal(fx.monsters[name].kind, 'claw', `${name} rakes with claws`);
    assert.ok(fx.monsters[name].trail.streaks >= 3, `${name}: three or four claw lines`);
  }
  for (const [type, def] of Object.entries(data.monsters.monsters)) {
    for (const name of Object.keys(def.attacks)) {
      const base = fx.monsters[name];
      if (!['claw', 'fangs', 'pincer'].includes(base?.kind)) continue;
      const f = { ...base, ...(fx.overrides[`${type}.${name}`] || {}) };
      assert.ok(f.limbs?.length, `${type}.${name}: names the limbs that strike`);
      for (const limb of f.limbs) {
        const bone = typeof limb === 'string' ? limb : limb.bone;
        assert.ok(models[type]?.segments[bone], `${type}.${name}: ${bone} is a skinned bone of the model`);
      }
      const t = f.trail;
      assert.ok(t.life > 0.05 && t.life < 0.5 && t.fullSpeed > t.minSpeed && t.width > 0, `${type}.${name}: a short, speed-gated trail`);
    }
  }
});
