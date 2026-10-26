// One-time content pass: the 29 set pieces proposed with the equipment turnarounds
// (assets-source/equipment/20261026, icons in assets-source/equipment/20261025/icons) become live
// gear. Each piece takes its set's tier, wear stat and parts; stats follow the gear-tiers.mjs budget
// (progression set totals x slot share; tier-1 pieces sit beside their tuned siblings instead) and
// recipes its tier schedule. Writes data/items.json, data/recipes.json and data/outfits.json.
// Kept for review; re-running is idempotent.
import fs from 'node:fs';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = read('data/items.json'), recipes = read('data/recipes.json'), outfits = read('data/outfits.json');
const G = items.gearBases, R = recipes.recipes, W = items.requirements.weights;
const ref = (il) => items.handRules.reference.base + items.handRules.reference.perItemLevel * (il - 1);
const SET = { defense: (il) => 7 + 5.5 * (il - 1), maxHp: (il) => 18 + 10 * (il - 1) };
const SHARE = { armor: 0.45, helm: 0.2, gloves: 0.1, boots: 0.15 };
const target = (slot, il) => slot === 'charm' ? ref(il) * 0.12 : (SET.defense(il) + SET.maxHp(il) * W.maxHp) * SHARE[slot];
// main, second, bulk(previous tier), bulk(tier 1), rare, gold (gear-tiers.mjs COUNT)
const COUNT = { 1: [5, 2, 0, 0, 0, 20], 6: [6, 3, 0, 10, 0, 60], 11: [8, 4, 10, 20, 0, 150], 16: [10, 4, 12, 25, 1, 300] };
const BULK = { phys: ['boar_tusk', 'wolf_fang', 'beetle_shell'], def: ['boar_hide', 'beetle_shell', 'crab_shell'], mag: ['spore_sac', 'venom_gland', 'spore_sac'] };
const TIER = { 1: 0, 6: 1, 11: 2, 16: 3 };
function cost(il, family, main, second) {
  const [nm, ns, nb, n1, nr, gold] = COUNT[il], c = {}, add = (k, n) => { if (n > 0) c[k] = (c[k] || 0) + n; };
  add(main, nm); add(second, ns);
  if (nb) add(BULK[family][TIER[il] - 1], nb);
  if (n1) add(BULK[family][0], n1);
  if (nr) add('storm_quill', nr);
  add('gold', gold);
  return c;
}
const POOL = {
  vit: ['hp_flat', 'defense_flat', 'barrier_pct', 'regen_flat', 'block_pct'],
  agi: ['move_pct', 'defense_flat', 'crit_pct', 'cdr_pct', 'hp_flat'],
  dex: ['attack_flat', 'crit_pct', 'projectile_pct', 'move_pct', 'leech_pct'],
  int: ['magic_flat', 'mp_flat', 'spell_pct', 'cdr_pct', 'heal_pct'],
};
// id: [name, Thai name (as in the turnaround archive), item level, slot, wear stat, look, family, main, second, shape or fixed tier-1 stats, option pool, outfit entry]
// Tier-1 (travel, boarhide, crabshell) stats are written out like their tuned siblings; for the rest
// the shape is each stat's share of the tier budget (weighted power, so a 0.15-weight percentage
// does not swamp the item). Stat themes follow the set (spore heals, wisp regenerates mana,
// mirrorwing shields, fernstep moves).
const PLAN = {
  travel_cap: ['Travel Cap', 'หมวกเดินทาง', 1, 'helm', 'VIT', 'cap', 'def', 'boar_hide', 'shore_feather', { defense: 1.5, maxHp: 6 }, POOL.vit,
    { kind: 'cap', palette: { main: '#efe6d2', trim: '#4f8f8a' } }],
  travel_gloves: ['Travel Gloves', 'ถุงมือเดินทาง', 1, 'gloves', 'DEX', 'wrap', 'phys', 'boar_hide', 'salt_gel', { defense: 1, attack: 1 }, POOL.dex,
    { len: 0.3, pattern: 1, palette: { main: '#efe6d2', trim: '#4f8f8a', accent: '#8a5634' }, parts: [] }],
  boarhide_boots: ['Boarhide Boots', 'รองเท้าหนังหมูป่า', 1, 'boots', 'AGI', null, 'def', 'boar_hide', 'shore_feather', { defense: 3, maxHp: 8, moveSpeedPct: 2 }, POOL.agi,
    { len: 0.6, palette: { main: '#6a4028', trim: '#e6d2a8', accent: '#3c2516', sole: '#3a2618' }, parts: ['furCuffs', 'bootStraps'] }],
  crabshell_vest: ['Crabshell Vest', 'เกราะกระดองปู', 1, 'armor', 'VIT', 'shell', 'def', 'crab_shell', 'salt_gel', { defense: 7.5, maxHp: 12 }, POOL.vit,
    { style: 'shell', palette: { main: '#e8704a', sleeve: '#c85a36', trim: '#b84a2a', accent: '#f6c0a0', metal: '#f08a5a', pants: '#3a3030' }, trousers: { pattern: 3 } }],
  beetle_gloves: ['Beetle Gloves', 'ถุงมือกระดองด้วง', 6, 'gloves', 'VIT', 'shell', 'def', 'beetle_shell', 'venom_gland', { defense: 0.8, maxHp: 0.2 }, POOL.vit,
    { len: 0.5, pattern: 3, palette: { main: '#6fae3a', trim: '#35601d', accent: '#a8d860' }, parts: [] }],
  beetle_boots: ['Beetle Boots', 'รองเท้ากระดองด้วง', 6, 'boots', 'VIT', null, 'def', 'beetle_shell', 'hermit_fragment', { defense: 0.7, maxHp: 0.2, moveSpeedPct: 0.1 }, POOL.vit,
    { len: 0.7, pattern: 3, palette: { main: '#6fae3a', trim: '#35601d', accent: '#a8d860', sole: '#2e3a24' }, parts: ['shinGuards'] }],
  sporeweave_boots: ['Sporeweave Boots', 'รองเท้าทอสปอร์', 6, 'boots', 'INT', null, 'mag', 'spore_sac', 'glow_dust', { defense: 0.5, maxMp: 0.3, healPct: 0.2 }, ['mp_flat', 'heal_pct', 'defense_flat', 'hp_flat', 'summon_pct'],
    { len: 0.3, pattern: 2, palette: { main: '#efe6d0', trim: '#e0ac3e', accent: '#f7f0dc', sole: '#8a5a2a' }, parts: ['bootCuffs'] }],
  wolfpelt_hood: ['Wolfpelt Hood', 'ฮู้ดหนังหมาป่า', 6, 'helm', 'AGI', 'hood', 'def', 'wolf_pelt', 'hermit_fragment', { defense: 0.6, maxHp: 0.2, critChancePct: 0.2 }, POOL.agi,
    { kind: 'furHood', palette: { main: '#8a7a66', trim: '#ddd4c6', accent: '#5e5246' } }],
  burrowguard_armor: ['Burrowguard Armor', 'เกราะผู้พิทักษ์โพรง', 6, 'armor', 'VIT', 'shell', 'def', 'rootdigger_claw', 'fern_ear_tuft', { defense: 0.75, maxHp: 0.15, hpRegen: 0.1 }, POOL.vit,
    { style: 'shell', palette: { main: '#6a4a30', sleeve: '#5a3e28', trim: '#3a2a1c', accent: '#e6d8c0', metal: '#8a6a48', pants: '#3a2e26' }, trousers: { pattern: 2 } }],
  burrowguard_helm: ['Burrowguard Helm', 'หมวกผู้พิทักษ์โพรง', 6, 'helm', 'VIT', 'beetle', 'def', 'rootdigger_claw', 'fern_ear_tuft', { defense: 0.7, maxHp: 0.2, barrierPct: 0.1 }, POOL.vit,
    { kind: 'shell', palette: { main: '#7a5232', trim: '#3a2a1c', accent: '#e6d8c0' } }],
  burrowguard_gloves: ['Burrowguard Gloves', 'ถุงมือผู้พิทักษ์โพรง', 6, 'gloves', 'VIT', 'plate', 'def', 'rootdigger_claw', 'boar_tusk', { defense: 0.55, maxHp: 0.15, attack: 0.3 }, POOL.vit,
    { len: 0.55, pattern: 3, palette: { main: '#6a4a30', trim: '#e6d8c0', accent: '#3a2a1c' }, parts: ['claws'] }],
  burrowguard_boots: ['Burrowguard Boots', 'รองเท้าผู้พิทักษ์โพรง', 6, 'boots', 'VIT', null, 'def', 'rootdigger_claw', 'fern_ear_tuft', { defense: 0.75, maxHp: 0.25 }, POOL.vit,
    { len: 0.7, pattern: 1, palette: { main: '#6a4a30', trim: '#e6d8c0', accent: '#3a2a1c', sole: '#2e2218' }, parts: ['bootStraps'] }],
  mirrorwing_robe: ['Mirrorwing Robe', 'เสื้อคลุมปีกกระจก', 6, 'armor', 'INT', 'mantle', 'mag', 'mirror_scale', 'glow_dust', { defense: 0.6, maxMp: 0.32, barrierPct: 0.08 }, ['mp_flat', 'barrier_pct', 'spell_pct', 'defense_flat', 'magic_flat'],
    { style: 'mantle', palette: { main: '#26304e', sleeve: '#26304e', trim: '#c8d4e0', accent: '#9fd0f0', pattern: '#9fd0f0', gem: '#9fd0f0', pants: '#1e2438' }, trousers: { pattern: 1 } }],
  mirrorwing_hood: ['Mirrorwing Hood', 'ฮู้ดปีกกระจก', 6, 'helm', 'INT', 'hood', 'mag', 'mirror_scale', 'fern_ear_tuft', { defense: 0.5, maxMp: 0.4, spellDamagePct: 0.1 }, POOL.int,
    { kind: 'furHood', palette: { main: '#26304e', trim: '#c8d4e0', accent: '#9fd0f0' } }],
  mirrorwing_gloves: ['Mirrorwing Gloves', 'ถุงมือปีกกระจก', 6, 'gloves', 'INT', 'wrap', 'mag', 'mirror_scale', 'glow_dust', { magic: 0.7, critChancePct: 0.3 }, POOL.int,
    { len: 0.6, palette: { main: '#26304e', trim: '#c8d4e0', accent: '#9fd0f0' }, parts: [] }],
  mirrorwing_boots: ['Mirrorwing Boots', 'รองเท้าปีกกระจก', 6, 'boots', 'INT', null, 'mag', 'mirror_scale', 'fern_ear_tuft', { defense: 0.4, moveSpeedPct: 0.35, maxMp: 0.25 }, ['mp_flat', 'move_pct', 'cdr_pct', 'defense_flat', 'barrier_pct'],
    { len: 0.6, pattern: 3, palette: { main: '#26304e', trim: '#c8d4e0', accent: '#9fd0f0', sole: '#1a1e30' }, parts: ['ankleWings'] }],
  fernstep_coat: ['Fernstep Coat', 'เสื้อคลุมก้าวเฟิร์น', 6, 'armor', 'AGI', 'pelt', 'def', 'fern_ear_tuft', 'mirror_scale', { defense: 0.65, maxHp: 0.12, moveSpeedPct: 0.23 }, POOL.agi,
    { style: 'coat', palette: { main: '#5f7a3a', sleeve: '#5f7a3a', trim: '#efe6d0', accent: '#7a5232', cuff: '#efe6d0', fur: '#efe6d0', pants: '#3e4a2e' }, cut: { cuff: 0.82 }, trousers: { pattern: 1 } }],
  fernstep_cap: ['Fernstep Cap', 'หมวกก้าวเฟิร์น', 6, 'helm', 'AGI', 'cap', 'phys', 'fern_ear_tuft', 'glow_dust', { defense: 0.5, maxHp: 0.2, critChancePct: 0.3 }, POOL.agi,
    { kind: 'cap', palette: { main: '#5f7a3a', trim: '#efe6d0' } }],
  fernstep_gloves: ['Fernstep Gloves', 'ถุงมือก้าวเฟิร์น', 6, 'gloves', 'DEX', 'pelt', 'phys', 'fern_ear_tuft', 'rootdigger_claw', { attack: 0.55, critChancePct: 0.3, projectileDamagePct: 0.15 }, POOL.dex,
    { len: 0.5, palette: { main: '#6a4a30', trim: '#5f7a3a', accent: '#efe6d0' }, parts: ['gloveStraps'] }],
  fernstep_boots: ['Fernstep Boots', 'รองเท้าก้าวเฟิร์น', 6, 'boots', 'AGI', null, 'def', 'fern_ear_tuft', 'rootdigger_claw', { defense: 0.45, moveSpeedPct: 0.55 }, POOL.agi,
    { len: 0.6, palette: { main: '#5f7a3a', trim: '#efe6d0', accent: '#6a4a30', sole: '#3a2a1c' }, parts: ['furCuffs', 'leafTips'] }],
  moonleaf_robe: ['Moonleaf Robe', 'เสื้อคลุมใบจันทร์', 11, 'armor', 'INT', 'tunic', 'mag', 'spore_sac', 'sea_pearl', { defense: 0.45, maxMp: 0.35, cooldownPct: 0.2 }, ['defense_flat', 'mp_flat', 'cdr_pct', 'heal_pct', 'magic_flat'],
    { style: 'tunic', palette: { main: '#efe8d6', sleeve: '#efe8d6', trim: '#6f8a3a', accent: '#c8c0a8', pants: '#4f6a3a' }, skirt: { length: 0.4, flare: 0.1, opening: 0.2 }, trousers: { pattern: 1 } }],
  moonleaf_cowl: ['Moonleaf Cowl', 'ผ้าคลุมใบจันทร์', 11, 'helm', 'INT', 'cowl', 'mag', 'spore_sac', 'sea_pearl', { defense: 0.5, maxMp: 0.35, healPct: 0.15 }, POOL.int,
    { kind: 'cowl', palette: { main: '#efe8d6', trim: '#6f8a3a', accent: '#c8ccd4' } }],
  moonleaf_gloves: ['Moonleaf Gloves', 'ถุงมือใบจันทร์', 11, 'gloves', 'INT', 'wrap', 'mag', 'spore_sac', 'glow_dust', { magic: 0.6, maxMp: 0.2, cooldownPct: 0.2 }, POOL.int,
    { len: 0.4, pattern: 1, palette: { main: '#efe8d6', trim: '#6f8a3a', accent: '#c0c8c8' }, parts: [] }],
  moonleaf_pendant: ['Moonleaf Pendant', 'จี้ใบจันทร์', 11, 'charm', 'INT', null, 'mag', 'sea_pearl', 'spore_sac', { maxMp: 0.5, magic: 0.35, healPct: 0.15 }, ['magic_flat', 'mp_flat', 'heal_pct', 'cdr_pct', 'spell_pct'], null],
  storm_gloves: ['Storm Gloves', 'ถุงมือพายุ', 16, 'gloves', 'DEX', 'pelt', 'phys', 'hawk_feather', 'viper_scale', { attack: 0.55, critChancePct: 0.3, projectileDamagePct: 0.15 }, POOL.dex,
    { len: 0.5, palette: { main: '#3a3440', trim: '#8a4a2a', accent: '#4aa8e8' }, parts: ['gloveGem'] }],
  wisp_robe: ['Wisp Robe', 'เสื้อคลุมแสงวิญญาณ', 16, 'armor', 'INT', 'tunic', 'mag', 'wisp_core', 'viper_scale', { defense: 0.6, maxMp: 0.35, spellDamagePct: 0.05 }, ['mp_flat', 'spell_pct', 'defense_flat', 'magic_flat', 'area_pct'],
    { style: 'tunic', palette: { main: '#efe8d8', sleeve: '#efe8d8', trim: '#2f8f8a', accent: '#4fb8b0', pants: '#2f5a5a' }, skirt: { length: 0.5, flare: 0.12, opening: 0.3 }, trousers: { pattern: 1 } }],
  wisp_hood: ['Wisp Hood', 'ฮู้ดแสงวิญญาณ', 16, 'helm', 'INT', 'hood', 'mag', 'glow_dust', 'wisp_core', { defense: 0.4, maxMp: 0.35, cooldownPct: 0.25 }, POOL.int,
    { kind: 'furHood', palette: { main: '#efe8d8', trim: '#4fb8b0', accent: '#2f8f8a' } }],
  wisp_boots: ['Wisp Boots', 'รองเท้าแสงวิญญาณ', 16, 'boots', 'INT', null, 'mag', 'glow_dust', 'viper_scale', { defense: 0.45, mpRegenPct: 0.3, moveSpeedPct: 0.25 }, ['mp_flat', 'move_pct', 'cdr_pct', 'defense_flat', 'hp_flat'],
    { len: 0.45, pattern: 1, palette: { main: '#efe8d8', trim: '#4fb8b0', accent: '#c8a060', sole: '#8a6a40' }, parts: ['bootStraps'] }],
};
// The Wardenstalker set is crafted after the Horned Warden: its boots follow the hand-set recipe of
// the set's gloves rather than the tier schedule.
const WARDEN_BOOTS = ['Wardenstalker Boots', 'รองเท้าพรานผู้พิทักษ์', 21, 'boots', 'AGI', null, 'phys', 'greyfang_mane', 'dusk_pelt', { defense: 0.45, moveSpeedPct: 0.25, maxHp: 0.15, critChancePct: 0.15 }, POOL.agi,
  { len: 0.62, palette: { main: '#3e5a36', trim: '#d2c8b4', accent: '#6a4a2a', sole: '#2c2a24' }, parts: ['furCuffs', 'bootStraps'] }];
const TABLE = { armor: 'armor', boots: 'boots', gloves: 'gloves', helm: 'helms' };
for (const [id, [name, nameTh, il, slot, stat, look, family, main, second, shape, optionPool, outfit]] of Object.entries({ ...PLAN, wardenstalker_boots: WARDEN_BOOTS })) {
  let stats = shape;
  if (il > 1) {
    const t = target(slot, il) / Object.values(shape).reduce((a, v) => a + v, 0);
    stats = Object.fromEntries(Object.entries(shape).map(([s, v]) => [s, Math.round((v * t) / W[s] * 10) / 10]));
  }
  G[id] = { name, nameTh, slot, requirementStat: stat, optionPool, stats, requires: {}, starter: false, upgradeMaterial: main, itemLevel: il, ...(look ? { look } : {}) };
  const recipeCost = id === 'wardenstalker_boots'
    ? { greyfang_mane: 2, dusk_pelt: 17, wolf_pelt: 9, hawk_feather: 17, boar_hide: 17, ruin_shard: 2, gold: 500 }
    : cost(il, family, main, second);
  R[id] = { type: 'gear', result: id, cost: recipeCost, optionPool, itemLevel: il };
  if (outfit) outfits[TABLE[slot]][id] = outfit;
}
// keep the files' existing layout (items.json writes one small object inline)
const inline = (out) => out.replace(/"autoUse": \{\n\s*"hp": \{\n\s*"threshold": (\d+)\n\s*\},\n\s*"mp": \{\n\s*"threshold": (\d+)\n\s*\}\n\s*\}/, '"autoUse": {"hp": {"threshold": $1}, "mp": {"threshold": $2}}');
const write = (f, d) => fs.writeFileSync(f, inline(JSON.stringify(d, null, 2) + '\n'));
write('data/items.json', items);
write('data/recipes.json', recipes);
write('data/outfits.json', outfits);
console.log('bases', Object.keys(G).length, 'gear recipes', Object.values(R).filter((r) => r.type === 'gear').length);
