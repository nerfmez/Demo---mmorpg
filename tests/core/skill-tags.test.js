// One tag vocabulary (src/ui/buildmeta.js TAG_GROUPS, docs/SKILL-TAXONOMY-RESEARCH-TH.md): every tag a
// skill or mod uses has a group and a Thai name, and skills keep the group rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { TAG_GROUPS, TAGS } from '../../src/ui/buildmeta.js';

const FUSION = JSON.parse(readFileSync(new URL('../../data/fusion.json', import.meta.url)));
const combat = { ...data.skills.combat, ...FUSION.skills }; // with the bench's prototype spells
const group = (g) => Object.keys(TAG_GROUPS[g]);

test('every tag used by skills, movement skills and mods has one group and a Thai name', () => {
  const seen = new Map();
  for (const [g, tags] of Object.entries(TAG_GROUPS)) for (const [t, th] of Object.entries(tags)) {
    assert.ok(!seen.has(t), `${t} is in both ${seen.get(t)} and ${g}`);
    seen.set(t, g);
    assert.ok(th && /[฀-๿]/.test(th), `${t} has a Thai name`);
  }
  const used = [];
  for (const [id, s] of Object.entries({ ...combat, ...data.skills.movement })) for (const t of s.tags) used.push([id, t]);
  for (const [id, m] of Object.entries(data.mods.mods)) for (const k of ['tags', 'needs', 'on', 'not', 'grants']) for (const t of m[k] || []) used.push([`mod ${id}.${k}`, t]);
  for (const [where, t] of used) assert.ok(TAGS[t], `${where}: ${t} is not in the vocabulary`);
  assert.equal(TAGS.Projectile, 'ยิง', 'the owner\'s word for Projectile');
});

test('combat skills: one power tag (none only for a Warcry), Melee is Strike or Slam, damage names its element, a duration is tagged', () => {
  const ELEMENT = { physical: 'Physical', fire: 'Fire', cold: 'Cold', lightning: 'Lightning', poison: 'Poison', arcane: 'Arcane' };
  for (const [id, s] of Object.entries(combat)) {
    const t = new Set(s.tags);
    const power = group('power').filter((x) => t.has(x));
    if (t.has('Warcry')) assert.ok(power.length <= 1, id); else assert.equal(power.length, 1, `${id}: exactly one of Attack/Spell`);
    if (s.power === 'spell') assert.ok(t.has('Spell'), `${id}: a spell is tagged Spell`);
    if (t.has('Melee')) assert.equal(['Strike', 'Slam'].filter((x) => t.has(x)).length, 1, `${id}: Strike or Slam`);
    assert.ok(!t.has('Strike') && !t.has('Slam') || t.has('Melee'), `${id}: Strike/Slam are melee`);
    if (t.has('Damage')) {
      assert.ok(t.has(ELEMENT[s.element]), `${id}: its element ${s.element}`);
      const els = group('element').filter((x) => t.has(x) && x !== 'Earth');
      assert.equal(els.length, 1, `${id}: one element (Earth rides on Physical)`);
    }
    assert.equal(t.has('Duration'), s.duration !== undefined, `${id}: Duration tag iff it has a duration`);
  }
});
