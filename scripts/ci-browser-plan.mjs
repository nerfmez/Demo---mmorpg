// Single inventory: PR affected checks and full regression use the same scripts.
export const SUITES = {
  boot: ['boot.mjs'],
  smoke: ['smoke.mjs'],
  world: ['map-travel.mjs', 'open-world.mjs', 'open-world-city.mjs'],
  combat: ['midhigh-monsters.mjs', 'coastal-attacks.mjs'],
  equipment: ['gear-hands.mjs', 'details-touch.mjs'],
  weapons: ['weapon-loading.mjs', 'weapon-models.mjs'],
  items: ['shop-potions.mjs', 'potions-moving.mjs'],
  menu: ['menu-hub.mjs'],
  ux: ['ux.mjs'],
  lab: ['lab.mjs'],
  capture: ['capture.mjs'],
  save: ['journal-route-save.mjs'],
};
export const FULL_SUITES = Object.keys(SUITES);

// Only explicit, bounded dependencies may select a subset. Core/data, shared
// renderer/UI, assets outside this allowlist and new paths always fall back full.
const LOCAL_PATHS = {
  'src/ui/menu.js': ['smoke', 'menu', 'ux', 'save'],
  'src/ui/menu-map.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/mapimage.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/equipment-avatar.js': ['equipment', 'weapons', 'ux'],
};
export function browserPlan(files, { full = false } = {}) {
  if (full) return { suites: [...FULL_SUITES], reason: 'postmerge/manual full regression' };
  const selected = new Set();
  let game = false;
  for (const file of files) {
    // These have their own static/tool checks. Weapon provenance is runtime test
    // input, despite living in docs, so it must be handled before the docs rule.
    if (file === 'docs/WEAPON-MODEL-PROVENANCE.json') {
      game = true; selected.add('weapons'); continue;
    }
    if (file.startsWith('docs/') || /^(AGENTS|CLAUDE|README)\.md$/.test(file) || /^(LICENSE|\.gitignore)$/.test(file) ||
        file.startsWith('.github/') || file.startsWith('scripts/') || file.startsWith('tests/tools/')) continue;
    game = true;
    let affected = LOCAL_PATHS[file];
    if (file.startsWith('public/models/weapons/')) affected = ['smoke', 'equipment', 'weapons', 'combat', 'ux'];
    if (file.startsWith('src/ui/skill-journal/')) affected = ['smoke', 'menu', 'ux', 'save'];
    if (!affected) affected = Object.entries(SUITES).filter(([, scripts]) => scripts.some(name => file === `tests/browser/${name}`)).map(([suite]) => suite);
    if (!affected.length) return { suites: [...FULL_SUITES], reason: `conservative full fallback: ${file}` };
    affected.forEach(suite => selected.add(suite));
  }
  if (game) selected.add('boot');
  return { suites: FULL_SUITES.filter(suite => selected.has(suite)), reason: game ? 'boot + explicitly affected functionality' : 'documentation/tool checks only' };
}
