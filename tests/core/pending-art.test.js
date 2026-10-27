// Skills without a picture yet (owner, 2026-10-26): each shows a labelled "ยังไม่มีรูป" stand-in, is
// listed for the owner in docs/SKILL-ICONS-PENDING-TH.md, and never also claims a supplied PNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { art, hasArt } from '../../src/ui/art.js';
import { rasterIconUrl } from '../../src/ui/raster-icons.js';
import { PENDING_SKILL_ICONS } from '../../src/ui/pending-art.js';

const pending = Object.entries({ ...data.skills.combat, ...data.skills.movement }).filter(([, s]) => s.iconPending);

test('the pending list matches the data and every pending skill shows its name and "ยังไม่มีรูป"', () => {
  assert.deepEqual(Object.keys(PENDING_SKILL_ICONS).sort(), pending.map(([id]) => id).sort());
  for (const [id, s] of pending) {
    assert.equal(PENDING_SKILL_ICONS[id], s.nameTh, id);
    assert.ok(hasArt('skill', id), id);
    const markup = art('skill', id);
    assert.ok(markup.includes(`data-art="skill/${id}"`) && markup.includes('ยังไม่มีรูป') && markup.includes(s.nameTh), id);
    assert.equal(rasterIconUrl('skill', id), null, `${id} is pending, so it has no registered PNG`);
  }
});

test('the owner\'s list names every pending skill and how to add its picture', () => {
  const doc = readFileSync(new URL('../../docs/SKILL-ICONS-PENDING-TH.md', import.meta.url), 'utf8');
  for (const [id, s] of pending) assert.ok(doc.includes('`' + id + '`') && doc.includes(s.nameTh), id);
  assert.ok(doc.includes('public/assets/icons/skill/<id>.png') && doc.includes('public/assets/icons/skill-round/<id>.png'));
});
