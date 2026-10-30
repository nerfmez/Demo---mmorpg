// The Pearlshell Grotto opens inside the Singing Conch on the Conch Coast (owner, 30 October 2026):
// beside it nearby() offers the dungeon, enterDungeon() says yes (not in a fight, not dead) with an
// `enterDungeon` event, and the dungeon's pearl gate leads back to the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { data } from './helpers.js';
import { createWorld } from '../../src/core/world.js';
import { OpenWorldGame } from '../../src/core/open-world-game.js';

const frontier = 'frontier-wilds-v1';
const worlds = Object.fromEntries(Object.entries(data.maps).map(([id, map]) => [id, createWorld(map)]));
const conch = data.maps[frontier].landmarks.find((l) => l.id === 'giant_conch');
const GROTTO = JSON.parse(readFileSync(new URL('../../data/dungeons/shell-grotto.json', import.meta.url), 'utf8'));

function gameAt(dx, dz) {
  const g = new OpenWorldGame({ ...data, world: data.maps[frontier] }, { world: worlds[frontier], worlds, seed: 9 });
  g.monsters = [];
  [g.player.x, g.player.z] = g.scenePoint(frontier, conch.at[0] + dx, conch.at[1] + dz);
  g.activateRegion(frontier);
  return g;
}

test('beside the Singing Conch the Pearlshell Grotto can be entered; away from it, in a fight or dead it cannot', () => {
  assert.equal(conch.dungeon.id, 'shell-grotto');
  const g = gameAt(conch.dungeon.r - 1, 0);
  assert.equal(g.nearby().dungeon, 'shell-grotto');
  g.drainEvents();
  assert.deepEqual(g.enterDungeon('shell-grotto'), { ok: true });
  assert.ok(g.drainEvents().some((e) => e.type === 'enterDungeon' && e.id === 'shell-grotto'));

  const far = gameAt(conch.dungeon.r + 3, 0);
  assert.equal(far.nearby().dungeon, null);
  assert.equal(far.enterDungeon('shell-grotto').reason, 'far');

  const dead = gameAt(0, conch.dungeon.r - 1);
  dead.player.dead = true;
  assert.equal(dead.enterDungeon('shell-grotto').reason, 'dead');
});

test('the grotto is entered at its spawn and its pearl gate leads back to the game (no beach of its own)', () => {
  assert.equal(GROTTO.outside, undefined, 'the preview beach is gone: the game is outside');
  const exit = GROTTO.inside.links.find((l) => l.id === 'shell-exit');
  assert.equal(exit.to, 'game');
  assert.ok(!exit.secret);
});
