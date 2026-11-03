// Game data for the browser build. Same shape as src/core/data-node.js.
import skills from '../data/skills.json';
import mods from '../data/mods.json';
import monsters from '../data/monsters.json';
import items from '../data/items.json';
import recipes from '../data/recipes.json';
import progression from '../data/progression.json';
import jobtree from '../data/jobtree.json';
import wheeltree from '../data/wheeltree.json';
import world from '../data/world.json';
import quests from '../data/quests.json';
import models from '../data/models.json';
import city from '../data/city-v3.json';
import frontier from '../data/maps/frontier-wilds.json';
import moonroot from '../data/maps/moonroot-grove.json';
import encounters from '../data/encounters.json';
import { mapRegistry } from './core/maps.js';

if (world.city?.enabled) world.city = { ...city, ...world.city, docks: [...city.docks,...world.city.joins||[]] };

// data.world is the map being played; main.js selects it (selectMap) before building the world.
// ?tree=wheel previews the wheel Job Tree (phase B review) until it replaces the old tree (phase C)
const wheelPreview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('tree') === 'wheel';
export const data = { skills, mods, monsters, items, recipes, progression, jobtree: wheelPreview ? wheeltree : jobtree, world, quests, models, encounters, maps: mapRegistry(world, [frontier, moonroot]) };
