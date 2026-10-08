import { loadData } from '../../src/core/data-node.js';
import { readFileSync } from 'node:fs';
export const data = loadData();
// Historical scenarios remain regression coverage; harbor.test exercises the
// active map separately, including the new onboarding and migration.
export const legacyData = { ...data, ...Object.fromEntries(['world', 'quests', 'monsters'].map(name => [name, JSON.parse(readFileSync(new URL(`../fixtures/frontier/${name}.json`, import.meta.url), 'utf8'))])) };

// Established combat/loadout scenarios explicitly own a learned loadout. This is
// test-only; ordinary production creation is covered separately by opening.test.
import { createCharacter as newCharacter } from '../../src/core/character.js';
import { Game as RealGame } from '../../src/core/game.js';
export function createLearnedCharacter(data, opts = {}) {
  const ch = newCharacter(data, opts);
  if (opts.opening) return ch;
  ch.skills = { slash: 1, hunter_shot: 1, firebolt: 1, ward: 1 };
  const kit = opts.kit || data.progression.start.defaultKit || 'sword';
  const skills = {sword:['slash','ward','firebolt',null],bow:['hunter_shot','slash','ward',null],staff:['firebolt','ward','slash',null]};
  ch.slots = (skills[kit] || skills.sword).map(skill => ({skill, mods:[]}));
  ch.movementSkills = ['dash','roll']; ch.movement = kit === 'bow' ? 'roll' : 'dash';
  return ch;
}
export class LearnedGame extends RealGame {
  constructor(data, opts = {}) { super(data, {...opts, character: opts.character || createLearnedCharacter(data)}); }
}
