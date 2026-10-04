// One-time content pass (phase 2b): place every gear base on a tier (item level 1/6/11/16/21)
// matching the monsters whose parts make it, rescale base stats to the tier reference, and
// give each recipe a cost that grows with the tier and asks for bulk lower-tier parts.
// Writes data/items.json and data/recipes.json. Kept for review; re-running is idempotent.
import fs from 'node:fs';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const items = read('data/items.json'), recipes = read('data/recipes.json');
const G = items.gearBases, R = recipes.recipes, W = items.requirements.weights;
const TIERS = [1, 6, 11, 16, 21];
const power = (s) => Object.entries(s).reduce((a, [k, v]) => a + Math.abs(v) * (W[k] || 0), 0);
const ref = (il) => items.handRules.reference.base + items.handRules.reference.perItemLevel * (il - 1);
// Armour reference: the set totals the balance model expects (progression.balance.gear).
const SET = { defense: (il) => 7 + 5.5 * (il - 1), maxHp: (il) => 18 + 10 * (il - 1) };
const SHARE = { armor: 0.45, helm: 0.2, gloves: 0.1, boots: 0.15, offhand: 0.3 };
const setPower = (il) => SET.defense(il) + SET.maxHp(il) * W.maxHp;
function target(base, il) {
  if (base.slot === 'weapon') return ref(il) * items.handRules[items.weaponTypes[base.weaponType].hands].baseFactor;
  if (base.slot === 'charm') return ref(il) * 0.12;
  return setPower(il) * SHARE[base.slot];
}
// Bulk parts per tier and family (what a recipe of that tier asks for in quantity).
const BULK = {
  phys: ['boar_tusk', 'wolf_fang', 'beetle_shell', 'hawk_feather', 'crag_stone'],
  def: ['boar_hide', 'beetle_shell', 'crab_shell', 'crag_stone', 'crag_stone'],
  mag: ['spore_sac', 'venom_gland', 'spore_sac', 'glow_dust', 'wisp_core'],
};
const COUNT = [ // main, second, bulk(previous tier), bulk(tier 1), rare, gold
  [5, 2, 0, 0, 0, 20], [6, 3, 0, 10, 0, 60], [8, 4, 10, 20, 0, 150], [10, 4, 12, 25, 1, 300], [12, 5, 15, 30, 2, 500]];
const RARE = { 3: 'storm_quill', 4: 'ruin_shard' };
// id: [tier index, family, main, second, (new base fields)]
const PLAN = {
  // tier 1 (item level 1): beach, meadow and glade parts
  tusk_blade: [0, 'phys', 'boar_tusk', 'boar_hide'], hunter_bow: [0, 'phys', 'boar_tusk', 'boar_hide'], spore_wand: [0, 'mag', 'spore_sac', 'salt_gel'],
  hide_vest: [0, 'def', 'boar_hide', 'salt_gel'], leather_cap: [0, 'def', 'boar_hide', 'shore_feather'], crabshell_helm: [0, 'def', 'crab_shell', 'salt_gel'],
  tide_boots: [0, 'def', 'crab_shell', 'shore_feather'], wisp_slippers: [0, 'mag', 'glow_dust', 'boar_hide'], tusk_charm: [0, 'phys', 'boar_tusk', 'boar_hide'],
  pearl_pendant: [0, 'mag', 'sea_pearl', 'crab_shell'], crab_shield: [0, 'def', 'crab_shell', 'salt_gel'], shell_mitts: [0, 'def', 'crab_shell', 'shore_feather'],
  hide_gloves: [0, 'phys', 'boar_hide', 'boar_tusk'],
  shell_knife: [0, 'phys', 'crab_shell', 'salt_gel', { name: 'Shell Knife', nameTh: 'มีดเปลือกปู', slot: 'weapon', weaponType: 'dagger', requirementStat: 'DEX', optionPool: ['attack_flat', 'crit_pct', 'projectile_pct', 'move_pct', 'leech_pct'] }],
  tusk_club: [0, 'phys', 'boar_tusk', 'boar_hide', { name: 'Tusk Club', nameTh: 'กระบองเขี้ยวหมูป่า', slot: 'weapon', weaponType: 'mace', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'hp_flat', 'defense_flat', 'leech_pct'] }],
  tusk_greatblade: [0, 'phys', 'boar_tusk', 'salt_gel', { name: 'Tusk Greatblade', nameTh: 'ดาบใหญ่เขี้ยวหมูป่า', slot: 'weapon', weaponType: 'greatblade', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'area_pct', 'hp_flat', 'leech_pct'] }],
  tide_staff: [0, 'mag', 'sea_pearl', 'shore_feather', { name: 'Tide Staff', nameTh: 'คทาคลื่นทะเล', slot: 'weapon', weaponType: 'staff', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'area_pct', 'mp_flat', 'cdr_pct'] }],
  // tier 2 (item level 6): headland, Azure forest and Frontier meadow parts
  fang_dagger: [1, 'phys', 'wolf_fang', 'wolf_pelt'], beetle_maul: [1, 'phys', 'beetle_shell', 'boar_tusk'], shell_guard: [1, 'def', 'beetle_shell', 'venom_gland'],
  wolfpelt_coat: [1, 'def', 'wolf_pelt', 'hermit_fragment'], beetle_helm: [1, 'def', 'beetle_shell', 'hermit_fragment'], spore_hood: [1, 'mag', 'spore_sac', 'venom_gland'],
  wolf_grips: [1, 'phys', 'wolf_pelt', 'wolf_fang'], wolf_boots: [1, 'def', 'wolf_pelt', 'hermit_fragment'], spore_amulet: [1, 'mag', 'spore_sac', 'venom_gland'],
  beetle_buckler: [1, 'def', 'beetle_shell', 'hermit_fragment'],
  wolfbite_sword: [1, 'phys', 'wolf_fang', 'wolf_pelt', { name: 'Wolfbite Sword', nameTh: 'ดาบเขี้ยวหมาป่า', slot: 'weapon', weaponType: 'sword', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'crit_pct', 'leech_pct', 'hp_flat'] }],
  venom_wand: [1, 'mag', 'venom_gland', 'spore_sac', { name: 'Venom Wand', nameTh: 'ไม้กายสิทธิ์พิษ', slot: 'weapon', weaponType: 'wand', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'poison_on_hit', 'cdr_pct', 'mp_flat'] }],
  hermit_cleaver: [1, 'phys', 'hermit_fragment', 'beetle_shell', { name: 'Hermit Cleaver', nameTh: 'ดาบใหญ่เปลือกเสฉวน', slot: 'weapon', weaponType: 'greatblade', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'area_pct', 'defense_flat', 'hp_flat'] }],
  spore_staff: [1, 'mag', 'spore_sac', 'venom_gland', { name: 'Spore Staff', nameTh: 'คทาสปอร์', slot: 'weapon', weaponType: 'staff', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'summon_pct', 'poison_on_hit', 'heal_pct'] }],
  fang_bow: [1, 'phys', 'wolf_fang', 'boar_tusk', { name: 'Fang Bow', nameTh: 'ธนูเขี้ยวหมาป่า', slot: 'weapon', weaponType: 'bow', requirementStat: 'DEX', optionPool: ['attack_flat', 'projectile_pct', 'crit_pct', 'move_pct', 'leech_pct'] }],
  // tier 3 (item level 11): wolf den, Greyfang and the Frontier forest/coast. Names are no longer the parts.
  greyfang_sabre: [2, 'phys', 'greyfang_mane', 'wolf_fang'],
  frontier_kris: [2, 'phys', 'wolf_fang', 'venom_gland', { name: 'Frontier Kris', nameTh: 'กริชพรานชายแดน', slot: 'weapon', weaponType: 'dagger', requirementStat: 'DEX', optionPool: ['attack_flat', 'crit_pct', 'poison_on_hit', 'move_pct', 'leech_pct'] }],
  moonleaf_wand: [2, 'mag', 'spore_sac', 'sea_pearl', { name: 'Moonleaf Wand', nameTh: 'ไม้กายสิทธิ์ใบจันทร์', slot: 'weapon', weaponType: 'wand', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'heal_pct', 'cdr_pct', 'mp_flat'] }],
  ranger_axe: [2, 'phys', 'beetle_shell', 'wolf_fang', { name: 'Ranger Axe', nameTh: 'ขวานศึกพรานป่า', slot: 'weapon', weaponType: 'axe', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'hp_flat', 'defense_flat', 'leech_pct'] }],
  knight_greatsword: [2, 'phys', 'greyfang_mane', 'beetle_shell', { name: 'Frontier Knight Greatsword', nameTh: 'ดาบใหญ่อัศวินชายแดน', slot: 'weapon', weaponType: 'greatblade', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'area_pct', 'hp_flat', 'defense_flat'] }],
  tidecaller_staff: [2, 'mag', 'sea_pearl', 'crab_shell', { name: 'Tidecaller Staff', nameTh: 'คทาเรียกกระแสน้ำ', slot: 'weapon', weaponType: 'staff', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'area_pct', 'barrier_pct', 'mp_flat'] }],
  dusk_longbow: [2, 'phys', 'wolf_pelt', 'hawk_feather', { name: 'Dusk Longbow', nameTh: 'ธนูยาวสนธยา', slot: 'weapon', weaponType: 'bow', requirementStat: 'DEX', optionPool: ['attack_flat', 'projectile_pct', 'crit_pct', 'move_pct', 'cdr_pct'] }],
  kite_shield: [2, 'def', 'beetle_shell', 'crab_shell', { name: 'Kite Shield', nameTh: 'โล่ว่าวอัศวิน', slot: 'offhand', offhandType: 'shield', requirementStat: 'VIT', optionPool: ['defense_flat', 'hp_flat', 'block_pct', 'regen_flat', 'barrier_pct'], blockChancePct: 15 }],
  ranger_coat: [2, 'def', 'wolf_pelt', 'beetle_shell', { name: 'Ranger Coat', nameTh: 'เสื้อคลุมพราน', slot: 'armor', look: 'pelt', requirementStat: 'VIT', optionPool: ['defense_flat', 'hp_flat', 'move_pct', 'regen_flat', 'projectile_pct'] }],
  ranger_hood: [2, 'mag', 'wolf_pelt', 'spore_sac', { name: 'Ranger Hood', nameTh: 'ฮู้ดพราน', slot: 'helm', look: 'hood', requirementStat: 'AGI', optionPool: ['defense_flat', 'crit_pct', 'cdr_pct', 'move_pct', 'hp_flat'] }],
  brigand_gloves: [2, 'phys', 'wolf_pelt', 'venom_gland', { name: 'Brigand Gloves', nameTh: 'ถุงมือโจรป่า', slot: 'gloves', look: 'pelt', requirementStat: 'DEX', optionPool: ['attack_flat', 'crit_pct', 'poison_on_hit', 'leech_pct', 'move_pct'] }],
  trail_boots: [2, 'def', 'wolf_pelt', 'crab_shell', { name: 'Trail Boots', nameTh: 'รองเท้าเดินป่า', slot: 'boots', requirementStat: 'AGI', optionPool: ['move_pct', 'defense_flat', 'hp_flat', 'regen_flat', 'cdr_pct'] }],
  fang_talisman: [2, 'phys', 'wolf_fang', 'greyfang_mane', { name: 'Moonfang Talisman', nameTh: 'เครื่องรางเขี้ยวจันทร์', slot: 'charm', requirementStat: 'DEX', optionPool: ['crit_pct', 'attack_flat', 'move_pct', 'leech_pct', 'melee_pct'] }],
  // tier 4 (item level 16): wetland and highlands
  wisp_staff: [3, 'mag', 'wisp_core', 'glow_dust'], storm_bow: [3, 'phys', 'storm_quill', 'hawk_feather'], storm_mantle: [3, 'mag', 'hawk_feather', 'storm_quill'],
  feather_circlet: [3, 'mag', 'hawk_feather', 'glow_dust'], wisp_wraps: [3, 'mag', 'glow_dust', 'wisp_core'], wisp_pendant: [3, 'mag', 'wisp_core', 'glow_dust'],
  feather_charm: [3, 'phys', 'hawk_feather', 'storm_quill'],
  stormglass_blade: [3, 'phys', 'hawk_feather', 'glow_dust', { name: 'Stormglass Blade', nameTh: 'ดาบแก้วพายุ', slot: 'weapon', weaponType: 'sword', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'crit_pct', 'cdr_pct', 'leech_pct'] }],
  wisp_stiletto: [3, 'phys', 'wisp_core', 'glow_dust', { name: 'Wisplight Stiletto', nameTh: 'มีดแหลมแสงวิญญาณ', slot: 'weapon', weaponType: 'dagger', requirementStat: 'DEX', optionPool: ['attack_flat', 'crit_pct', 'cdr_pct', 'move_pct', 'leech_pct'] }],
  lantern_wand: [3, 'mag', 'wisp_core', 'glow_dust', { name: 'Spirit Lantern Wand', nameTh: 'ไม้กายสิทธิ์ตะเกียงวิญญาณ', slot: 'weapon', weaponType: 'wand', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'summon_pct', 'cdr_pct', 'mp_flat'] }],
  thunder_maul: [3, 'phys', 'crag_stone', 'storm_quill', { name: 'Roaring Thunder Maul', nameTh: 'กระบองสายฟ้าคำราม', slot: 'weapon', weaponType: 'mace', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'area_pct', 'hp_flat', 'leech_pct'] }],
  galebreaker: [3, 'phys', 'hawk_feather', 'crag_stone', { name: 'Galebreaker', nameTh: 'ดาบใหญ่ฝ่าลมพายุ', slot: 'weapon', weaponType: 'greatblade', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'area_pct', 'move_pct', 'hp_flat'] }],
  highland_shield: [3, 'def', 'crag_stone', 'hawk_feather', { name: 'Highland Shield', nameTh: 'โล่ที่ราบสูง', slot: 'offhand', offhandType: 'shield', requirementStat: 'VIT', optionPool: ['defense_flat', 'hp_flat', 'block_pct', 'regen_flat', 'barrier_pct'], blockChancePct: 17 }],
  gale_boots: [3, 'def', 'hawk_feather', 'wolf_pelt', { name: 'Gale Boots', nameTh: 'รองเท้าวายุ', slot: 'boots', requirementStat: 'AGI', optionPool: ['move_pct', 'defense_flat', 'cdr_pct', 'hp_flat', 'projectile_pct'] }],
  // tier 5 (item level 21): the ruins and the Horned Warden
  crag_axe: [4, 'phys', 'crag_stone', 'golem_heart'], horn_greatblade: [4, 'phys', 'warden_horn', 'crag_stone'], ancient_staff: [4, 'mag', 'ancient_core', 'wisp_core'],
  crag_plate: [4, 'def', 'crag_stone', 'golem_heart'], horned_helm: [4, 'def', 'warden_horn', 'crag_stone'], crag_gauntlets: [4, 'def', 'crag_stone', 'golem_heart'],
  crag_greaves: [4, 'def', 'crag_stone', 'golem_heart'], golem_amulet: [4, 'def', 'golem_heart', 'crag_stone'], ancient_ring: [4, 'mag', 'ancient_core', 'wisp_core'],
  crag_tower_shield: [4, 'def', 'crag_stone', 'golem_heart'],
  oathblade: [4, 'phys', 'crag_stone', 'storm_quill', { name: 'Ancient Oathblade', nameTh: 'ดาบสาบานโบราณ', slot: 'weapon', weaponType: 'sword', requirementStat: 'STR', optionPool: ['attack_flat', 'melee_pct', 'crit_pct', 'hp_flat', 'leech_pct'] }],
  ruin_fang: [4, 'phys', 'storm_quill', 'wisp_core', { name: 'Ruinfang', nameTh: 'มีดเขี้ยวซากโบราณ', slot: 'weapon', weaponType: 'dagger', requirementStat: 'DEX', optionPool: ['attack_flat', 'crit_pct', 'poison_on_hit', 'move_pct', 'leech_pct'] }],
  relic_wand: [4, 'mag', 'wisp_core', 'golem_heart', { name: 'Relic Wand', nameTh: 'ไม้กายสิทธิ์โบราณวัตถุ', slot: 'weapon', weaponType: 'wand', requirementStat: 'INT', optionPool: ['magic_flat', 'spell_pct', 'area_pct', 'cdr_pct', 'mp_flat'] }],
  skyrender_bow: [4, 'phys', 'storm_quill', 'hawk_feather', { name: 'Skyrender Bow', nameTh: 'ธนูฉีกฟ้า', slot: 'weapon', weaponType: 'bow', requirementStat: 'DEX', optionPool: ['attack_flat', 'projectile_pct', 'crit_pct', 'cdr_pct', 'move_pct'] }],
};
// New bases borrow the stat shape of a sibling of the same kind, then scale to the tier.
const SHAPE = { sword: { attack: 0.9, magic: 0.1 }, dagger: { attack: 0.85, critChancePct: 0.3 }, wand: { attack: 0.15, magic: 0.85 }, mace: { attack: 0.92, maxHp: 1 },
  axe: { attack: 0.95, maxHp: 1 }, greatblade: { attack: 0.82, magic: 0.18 }, staff: { attack: 0.15, magic: 0.85 }, bow: { attack: 0.88, magic: 0.12 },
  shield: { defense: 0.7, maxHp: 2, blockChancePct: 0 }, armor: { defense: 0.6, maxHp: 4 }, helm: { defense: 0.6, maxHp: 3, cooldownPct: 0.1 }, gloves: { defense: 0.4, attack: 0.4, critChancePct: 0.2 },
  boots: { defense: 0.5, moveSpeedPct: 0.25, maxHp: 2 }, charm: { critChancePct: 1, attack: 0.5 } };
for (const [id, [t, family, main, second, fresh]] of Object.entries(PLAN)) {
  const il = TIERS[t];
  // Existing first-tier items keep their tuned onboarding stats, requirements and recipes.
  if (t === 0 && !fresh) {
    G[id].itemLevel = il;
    for (const r of Object.values(R)) if (r.type === 'gear' && r.result === id) r.itemLevel = il;
    continue;
  }
  if (fresh) {
    const { blockChancePct, ...rest } = fresh;
    const kind = rest.weaponType || rest.offhandType || rest.slot;
    G[id] = { ...rest, stats: { ...SHAPE[kind] }, requires: {}, starter: false, upgradeMaterial: main, itemLevel: il };
    if (blockChancePct) G[id].stats.blockChancePct = blockChancePct;
  }
  const b = G[id];
  b.itemLevel = il;
  b.upgradeMaterial = main;
  b.requires = {}; // wear requirements follow the power rule
  // Block chance is a fixed shield property; scale the rest to the tier target.
  const fixed = b.stats.blockChancePct || 0, rest = { ...b.stats };
  delete rest.blockChancePct;
  const want = target(b, il) - fixed * W.blockChancePct, k = want / power(rest);
  b.stats = Object.fromEntries(Object.entries(rest).map(([s, v]) => [s, Math.round(v * k * 10) / 10]));
  if (fixed) b.stats.blockChancePct = fixed;
  // Recipe: main + second part, bulk previous-tier and first-tier parts, a rare from tier 4.
  // An alternate recipe of the same base keeps its own leading part as the main one.
  const [nm, ns, nb, n1, nr, gold] = COUNT[t];
  const make = (lead) => {
    const cost = {}, add = (k, n) => { if (n > 0) cost[k] = (cost[k] || 0) + n; };
    add(lead, nm); add(second, ns);
    if (nb) add(BULK[family][t - 1], nb);
    if (n1) add(BULK[family][0], n1);
    if (nr) add(RARE[t], nr);
    add('gold', gold);
    return cost;
  };
  const ids = Object.keys(R).filter((r) => R[r].type === 'gear' && R[r].result === id);
  if (!ids.length) ids.push(id);
  for (const rid of ids) {
    const lead = rid === id || !R[rid] ? main : Object.keys(R[rid].cost).find((k) => k !== 'gold');
    R[rid] = { ...(R[rid] || { type: 'gear', result: id }), cost: make(lead), itemLevel: il, optionPool: b.optionPool };
  }
}
// Starters stay at item level 1 with their minimum requirement.
for (const id of ['rusty_sword', 'old_bow', 'apprentice_staff', 'travel_tunic', 'travel_boots']) G[id].itemLevel = 1;
const write = (f, d) => {
  const raw = fs.readFileSync(f, 'utf8');
  let out = JSON.stringify(d, null, 2) + '\n';
  if (/\\u[0-9a-f]{4}/.test(raw)) out = out.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  fs.writeFileSync(f, out);
};
write('data/items.json', items);
write('data/recipes.json', recipes);
console.log('bases', Object.keys(G).length, 'gear recipes', Object.values(R).filter((r) => r.type === 'gear').length);
