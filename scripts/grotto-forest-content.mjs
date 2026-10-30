// Content pass (owner, 2026-10-30, docs/STATS-TH.md section 7): the Pearlshell Grotto's monsters and boss and
// the three forest monsters (models in PR #170) become game data: their materials (icons cut from the owner's
// sheets), fixed levels, stats, drops, and the gear and recipes made from them. Monsters reuse existing
// behaviours (ai.js) until they get their own; they wait for placement (`awaiting: "placement"`), and the
// armour and weapons use placeholder looks until the outfit and weapon models are wired in. Bases enter at
// their range start (items.gearLevels); run scripts/gear-identity.mjs, armor-identity.mjs and option-pools.mjs
// after it. Re-running adds nothing twice. node scripts/grotto-forest-content.mjs
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');
const MATERIALS = {
  pearl_scale: { name: 'Pearl Scale', nameTh: 'เกล็ดมุก', color: '#cfe4f4', value: 12, shape: 'gem' },
  sea_slime: { name: 'Sea Slime', nameTh: 'เมือกทะเล', color: '#4fd6cf', value: 12, shape: 'gem' },
  clam_shell: { name: 'Violet Clam Shell', nameTh: 'เปลือกหอยม่วง', color: '#b79bd8', value: 13, shape: 'box' },
  snail_shell_shard: { name: 'Bronze Shell Shard', nameTh: 'เศษเปลือกสำริด', color: '#c89a4a', value: 40, shape: 'box', rare: true },
  golden_pearl: { name: 'Golden Pearl', nameTh: 'ไข่มุกทอง', color: '#f2c14e', value: 160, shape: 'gem', rare: true },
  pangolin_plate: { name: 'Stone Plate', nameTh: 'แผ่นเกราะหิน', color: '#d8c8a4', value: 9, shape: 'box' },
  foxleaf_tail: { name: 'Leaf Tail', nameTh: 'หางใบไม้', color: '#f08a3a', value: 9, shape: 'feather' },
  tanuki_fur: { name: 'Tanuki Fur', nameTh: 'ขนทานุกิ', color: '#8a6648', value: 8, shape: 'box' },
};

// monsters: one fixed level range each (monsters.json levels); attacks copy the behaviour they reuse
const M = JSON.parse(read('data/monsters.json'));
const like = (id) => JSON.parse(JSON.stringify(M.monsters[id].attacks));
const gold = (lo, hi) => ({ item: 'gold', chance: 1, min: lo, max: hi });
const MONSTERS = {
  leaf_fox: { name: 'Leaf Fox', nameTh: 'จิ้งจอกใบไม้', behavior: 'stalker', hp: 650, damage: 100, defense: 40, speed: 4.8, radius: 0.65, aggroRange: 9, leashRange: 20, exp: 18, jobExp: 12, attacks: like('duskmane_stalker'),
    drops: [{ item: 'foxleaf_tail', chance: 0.6, min: 1, max: 2 }, { item: 'boar_hide', chance: 0.3, min: 1, max: 1 }, gold(2, 6)], levels: [12, 14] },
  leaf_tanuki: { name: 'Leaf Tanuki', nameTh: 'ทานุกิใบไม้', behavior: 'spore', hp: 700, damage: 85, defense: 60, speed: 2.4, radius: 0.65, aggroRange: 7, leashRange: 18, exp: 18, jobExp: 12, attacks: like('sporecap'),
    drops: [{ item: 'tanuki_fur', chance: 0.6, min: 1, max: 2 }, { item: 'spore_sac', chance: 0.3, min: 1, max: 1 }, gold(2, 6)], levels: [14, 16] },
  stone_pangolin: { name: 'Stone Pangolin', nameTh: 'ตัวนิ่มหิน', behavior: 'charger', hp: 1100, damage: 100, defense: 100, speed: 3.2, radius: 0.8, aggroRange: 8, leashRange: 18, exp: 24, jobExp: 16, attacks: like('tusk_boar'),
    drops: [{ item: 'pangolin_plate', chance: 0.6, min: 1, max: 2 }, { item: 'boar_tusk', chance: 0.3, min: 1, max: 1 }, gold(3, 7)], levels: [16, 19] },
  pearl_fish: { name: 'Pearl Fish', nameTh: 'ปลามุก', behavior: 'kiter', hp: 480, damage: 110, defense: 25, speed: 3.4, radius: 0.6, aggroRange: 9, leashRange: 20, exp: 20, jobExp: 14, attacks: like('marsh_wisp'),
    drops: [{ item: 'pearl_scale', chance: 0.6, min: 1, max: 2 }, { item: 'sea_pearl', chance: 0.2, min: 1, max: 1 }, gold(3, 8)], levels: [22, 24] },
  pearl_slug: { name: 'Pearl Sea Slug', nameTh: 'ทากทะเลมุก', behavior: 'viper', hp: 700, damage: 95, defense: 50, speed: 1.8, radius: 0.7, aggroRange: 8, leashRange: 18, exp: 20, jobExp: 14, keepDistance: [3, 6], attacks: like('reed_viper'),
    drops: [{ item: 'sea_slime', chance: 0.6, min: 1, max: 2 }, { item: 'glow_dust', chance: 0.3, min: 1, max: 1 }, gold(3, 8)], levels: [24, 26] },
  eye_clam: { name: 'One-eyed Clam', nameTh: 'หอยตาเดียว', behavior: 'shell_spitter', hp: 950, damage: 90, defense: 100, speed: 1.2, radius: 0.9, aggroRange: 8, leashRange: 16, exp: 26, jobExp: 17, attacks: like('moss_beetle'),
    drops: [{ item: 'clam_shell', chance: 0.6, min: 1, max: 2 }, { item: 'sea_pearl', chance: 0.3, min: 1, max: 1 }, gold(3, 8)], levels: [26, 28] },
  pearl_snail_king: { ...JSON.parse(JSON.stringify(M.monsters.horned_warden)), levels: undefined, name: 'Pearl Snail King', nameTh: 'ราชาหอยทากมุก', hp: 9500, damage: 150, defense: 160, speed: 2.6, radius: 1.6, exp: 240, jobExp: 150,
    // owner: the shell shard drops easily, the golden pearl is rare
    drops: [{ item: 'skill_crystal_l', chance: 1, min: 1, max: 1 }, { item: 'snail_shell_shard', chance: 1, min: 2, max: 4 }, { item: 'golden_pearl', chance: 0.2, min: 1, max: 1 }, gold(80, 120)], levels: [30, 30] },
};
// new entries go in as text so the rest of monsters.json keeps its formatting
let monsters = read('data/monsters.json');
const monText = Object.entries(MONSTERS).filter(([id]) => !M.monsters[id]).map(([id, m]) => `    "${id}": ${JSON.stringify({ ...m, awaiting: 'placement' }, null, 2).replace(/\n/g, '\n    ')}`);
if (monText.length) {
  const at = monsters.indexOf('"monsters": {'), end = (() => { let d = 0; for (let i = at + 12; i < monsters.length; i++) { if (monsters[i] === '{') d++; else if (monsters[i] === '}' && --d === 0) return i; } })();
  monsters = monsters.slice(0, end).replace(/\s*$/, '') + ',\n' + monText.join(',\n') + '\n  ' + monsters.slice(end);
  JSON.parse(monsters);
  fs.writeFileSync('data/monsters.json', monsters);
}

// gear: [id, name, nameTh, slot, type/stat, secondary, range start, max, stats seed, upgrade material, look/placeholder]
const GEAR = [
  ['leafbear_coat', 'Leafbear Coat', 'เสื้อทานุกิใบไม้', 'armor', 'AGI', null, 15, 24, { moveSpeedPct: 1 }, 'tanuki_fur', 'pelt'],
  ['leafbear_hood', 'Leafbear Hood', 'ฮู้ดทานุกิใบไม้', 'helm', 'AGI', null, 15, 24, { critChancePct: 1 }, 'tanuki_fur', 'hood'],
  ['leafbear_gloves', 'Leafbear Gloves', 'ถุงมือทานุกิใบไม้', 'gloves', 'AGI', null, 15, 24, { attack: 30, critChancePct: 1 }, 'foxleaf_tail', 'pelt'],
  ['leafbear_boots', 'Leafbear Boots', 'รองเท้าทานุกิใบไม้', 'boots', 'AGI', null, 15, 24, { moveSpeedPct: 1 }, 'tanuki_fur', null],
  ['snailshell_plate', 'Snailshell Plate', 'เกราะเปลือกหอยทาก', 'armor', 'VIT', null, 30, 39, {}, 'clam_shell', 'plate'],
  ['snailshell_helm', 'Snailshell Helm', 'หมวกเปลือกหอยทาก', 'helm', 'VIT', 'STR', 30, 39, {}, 'clam_shell', null],
  ['snailshell_gloves', 'Snailshell Gauntlets', 'ถุงมือเปลือกหอยทาก', 'gloves', 'VIT', null, 30, 39, { attack: 26 }, 'clam_shell', 'plate'],
  ['snailshell_greaves', 'Snailshell Greaves', 'รองเท้าเปลือกหอยทาก', 'boots', 'VIT', null, 30, 39, {}, 'clam_shell', null],
  ['pearlscale_armor', 'Pearlscale Coat', 'เสื้อเกล็ดมุก', 'armor', 'AGI', 'DEX', 25, 34, { critChancePct: 1 }, 'pearl_scale', 'pelt'],
  ['pearlscale_crest', 'Pearlscale Crest', 'หมวกครีบเกล็ดมุก', 'helm', 'AGI', null, 25, 34, { hastePct: 1 }, 'pearl_scale', null],
  ['pearlscale_gloves', 'Pearlscale Gloves', 'ถุงมือเกล็ดมุก', 'gloves', 'AGI', 'DEX', 25, 34, { attack: 50, critChancePct: 1 }, 'sea_slime', 'pelt'],
  ['pearlscale_boots', 'Pearlscale Boots', 'รองเท้าเกล็ดมุก', 'boots', 'AGI', null, 25, 34, { moveSpeedPct: 1 }, 'sea_slime', null],
  ['leaf_axe', 'Leaf Axe', 'ขวานใบไม้', 'weapon', 'axe', null, 10, 19, { attack: 300 }, 'pangolin_plate', null],
  ['snailshell_mace', 'Snailshell Mace', 'กระบองเปลือกหอยทาก', 'weapon', 'mace', 'VIT', 30, 39, { attack: 400, maxHp: 200 }, 'clam_shell', null],
  ['snailshell_shield', 'Snailshell Greatshield', 'โล่ใหญ่เปลือกหอยทาก', 'weapon', 'greatshield', 'STR', 30, 39, { attack: 542, defense: 229, maxHp: 417, blockChancePct: 16 }, 'clam_shell', null],
  ['foxleaf_charm', 'Foxleaf Charm', 'เครื่องรางหางจิ้งจอก', 'charm', 'AGI', null, 15, 24, { moveSpeedPct: 3, hastePct: 6 }, 'foxleaf_tail', null],
  ['golden_pearl_pendant', 'Golden Pearl Pendant', 'จี้ไข่มุกทอง', 'charm', 'LUK', null, 25, 34, { critChancePct: 3, critMultPct: 10, maxMp: 120 }, 'golden_pearl', null],
];
const STAT_OF = { axe: 'STR', mace: 'STR', greatshield: 'VIT' };
// recipes: main + second part, a bulk first-tier part, gold (the tier schedule of the bases beside them)
const COST = {
  leafbear_coat: { tanuki_fur: 8, foxleaf_tail: 4, boar_hide: 20, gold: 150 },
  leafbear_hood: { tanuki_fur: 8, foxleaf_tail: 3, boar_hide: 16, gold: 150 },
  leafbear_gloves: { foxleaf_tail: 8, pangolin_plate: 4, boar_tusk: 12, gold: 150 },
  leafbear_boots: { tanuki_fur: 8, pangolin_plate: 4, boar_hide: 20, gold: 150 },
  snailshell_plate: { snail_shell_shard: 2, clam_shell: 14, crab_shell: 10, boar_hide: 22, gold: 300 },
  snailshell_helm: { snail_shell_shard: 2, clam_shell: 12, crab_shell: 8, boar_hide: 18, gold: 300 },
  snailshell_gloves: { snail_shell_shard: 1, clam_shell: 12, beetle_shell: 8, boar_tusk: 18, gold: 300 },
  snailshell_greaves: { snail_shell_shard: 1, clam_shell: 14, crab_shell: 8, boar_hide: 22, gold: 300 },
  pearlscale_armor: { pearl_scale: 12, sea_slime: 6, viper_scale: 5, boar_hide: 30, gold: 300 },
  pearlscale_crest: { pearl_scale: 12, sea_slime: 4, glow_dust: 6, spore_sac: 30, gold: 300 },
  pearlscale_gloves: { sea_slime: 12, pearl_scale: 6, viper_scale: 4, boar_tusk: 30, gold: 300 },
  pearlscale_boots: { sea_slime: 12, clam_shell: 4, pearl_scale: 6, boar_hide: 30, gold: 300 },
  leaf_axe: { pangolin_plate: 6, tanuki_fur: 3, boar_tusk: 13, gold: 60 },
  snailshell_mace: { snail_shell_shard: 2, clam_shell: 14, beetle_shell: 10, boar_tusk: 18, gold: 300 },
  snailshell_shield: { snail_shell_shard: 2, clam_shell: 16, crab_shell: 10, boar_hide: 22, gold: 300 },
  foxleaf_charm: { foxleaf_tail: 12, tanuki_fur: 4, boar_tusk: 12, gold: 150 },
  golden_pearl_pendant: { golden_pearl: 1, clam_shell: 10, pearl_scale: 6, boar_tusk: 22, gold: 300 },
};

let items = read('data/items.json');
const I = JSON.parse(items);
const close = (text, open) => { let d = 0; for (let i = open; i < text.length; i++) { if (text[i] === '{') d++; else if (text[i] === '}' && --d === 0) return i; } };
const addBlock = (text, key, entries, indent = '    ') => {
  const at = text.indexOf(`"${key}": {`), end = close(text, at + key.length + 3);
  const body = text.slice(0, end).replace(/\s*$/, '');
  return body + ',\n' + entries.join(',\n') + '\n' + indent.slice(2) + text.slice(end);
};
const matText = Object.entries(MATERIALS).filter(([id]) => !I.materials[id]).map(([id, m]) => `    "${id}": ${JSON.stringify(m, null, 2).replace(/\n/g, '\n    ')}`);
if (matText.length) items = addBlock(items, 'materials', matText);
const inline = (v) => '{ ' + Object.entries(v).map(([k, x]) => `"${k}": ${x}`).join(', ') + ' }';
const gearText = GEAR.filter(([id]) => !I.gearBases[id]).map(([id, name, nameTh, slot, kind, sec, lo, hi, stats, up, look]) => {
  const weapon = slot === 'weapon', lines = [`"name": "${name}"`, `"nameTh": "${nameTh}"`, `"slot": "${slot}"`];
  if (weapon) lines.push(`"weaponType": "${kind}"`);
  lines.push(`"requirementStat": "${weapon ? STAT_OF[kind] : kind}"`);
  if (sec) lines.push(`"secondaryStat": "${sec}"`);
  lines.push('"optionPool": []', `"stats": ${inline(stats)}`, '"requires": {}', '"starter": false', `"upgradeMaterial": "${up}"`, `"itemLevel": ${lo}`, `"maxItemLevel": ${hi}`);
  if (look) lines.push(`"look": "${look}"`);
  return `    "${id}": {\n      ${lines.join(',\n      ')}\n    }`;
});
if (gearText.length) items = addBlock(items, 'gearBases', gearText);
// the lines these bases fill leave the known gaps (tests/core/gear-tiers.test.js)
items = items.replace(/"knownGaps": \{[^}]*\}/, '"knownGaps": { "axe": "1-9,30-39", "mace": "20-29,40", "greatshield": "20-29", "plate.armor": "20-29", "plate.helm": "20-29", "plate.gloves": "20-29", "plate.boots": "1-9,20-29", "cloth.armor": "1-4,35-40", "cloth.helm": "1-4,35-40", "cloth.gloves": "1-4,35-40", "cloth.boots": "35-40" }');
JSON.parse(items);
fs.writeFileSync('data/items.json', items);

let recipes = read('data/recipes.json');
const R = JSON.parse(recipes).recipes;
const recText = GEAR.filter(([id]) => !R[id]).map(([id, , , , , , lo]) => {
  const cost = Object.entries(COST[id]).map(([k, n]) => `        "${k}": ${n}`).join(',\n');
  return `    "${id}": {\n      "type": "gear",\n      "result": "${id}",\n      "cost": {\n${cost}\n      },\n      "optionPool": [],\n      "itemLevel": ${lo}\n    }`;
});
if (recText.length) recipes = addBlock(recipes, 'recipes', recText);
JSON.parse(recipes);
fs.writeFileSync('data/recipes.json', recipes);
