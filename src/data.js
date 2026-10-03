// Game data for the browser build. Same shape as src/core/data-node.js.
import skills from '../data/skills.json';
import mods from '../data/mods.json';
import monsters from '../data/monsters.json';
import items from '../data/items.json';
import recipes from '../data/recipes.json';
import progression from '../data/progression.json';
import jobtree from '../data/jobtree.json';
import world from '../data/world.json';
import quests from '../data/quests.json';
import models from '../data/models.json';
import city from '../data/city-v3.json';

if (world.city?.enabled) world.city = { ...city, enabled: true };

export const data = { skills, mods, monsters, items, recipes, progression, jobtree, world, quests, models };
