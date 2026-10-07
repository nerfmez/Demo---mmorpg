// Single inventory: PR affected checks and full regression use the same scripts.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { RASTER_ICONS } from '../src/ui/raster-icons.js';

export const ROUTING_VERSION = 3;
export const SUITES = {
  boot: ['boot.mjs'],
  smoke: ['smoke.mjs'],
  world: ['map-travel.mjs', 'open-world.mjs', 'open-world-city.mjs'],
  combat: ['midhigh-monsters.mjs', 'coastal-attacks.mjs'],
  equipment: ['gear-hands.mjs', 'details-touch.mjs', 'details-game-touch.mjs'],
  'equipment-focus': ['equipment-focused.mjs'],
  // PR101 owns this test until merge. Discover it at the tested source without
  // copying the feature branch; the runner rejects its legacy single-engine form.
  ...(existsSync(new URL('../tests/browser/equipment-inactive.mjs', import.meta.url))
    ? { 'equipment-inactive': ['equipment-inactive.mjs'] } : {}),
  weapons: ['weapon-loading.mjs', 'weapon-models.mjs'],
  items: ['shop-potions.mjs', 'potions-moving.mjs'],
  menu: ['menu-hub.mjs'],
  ux: ['ux.mjs'],
  lab: ['lab.mjs'],
  capture: ['capture.mjs'],
  save: ['journal-route-save.mjs'],
  icons: ['icon-consumers.mjs'],
  quests: ['quest-journal.mjs'],
  // Full postmerge/manual CI owns ALL of the existing broad UI/HUD review.
  // Keep separate shards: moving ownership must not create a 9-script timeout.
  journal: ['journal.mjs'],
  'journal-motion': ['skill-journal.mjs'],
  overlays: ['fullscreen-overlays.mjs'],
  workspaces: ['workspaces.mjs'],
  'journal-upgrade': ['journal-route-upgrade.mjs'],
  'journal-lines': ['journal-lines.mjs'],
  'skill-lines': ['skill-lines.mjs'],
  wearable: ['wearable-level.mjs'],
  hud: ['fieldhud.mjs'],
};
export const FULL_SUITES = Object.keys(SUITES);

// Only explicit, bounded dependencies may select a subset. Core/data, shared
// renderer/UI, assets outside this allowlist and new paths always fall back full.
const LOCAL_PATHS = {
  // Title creation and Continue are exercised by boot; hub navigation by menu.
  'src/ui/menu.js': ['menu'],
  'src/ui/menu-map.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/mapimage.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/equipment-avatar.js': ['equipment', 'weapons', 'menu', 'ux'],
  'src/ui/quest-journal.js': ['quests', 'hud'],
  'src/ui/fieldhud.css': ['hud'],
};
const JOURNAL_FILES = new Set(['camera.js', 'format.js', 'journal.css', 'journal.js', 'layout.js',
  'line-groups.js', 'model.js', 'page-turn.js', 'paper-audio.js', 'presentation.js', 'route-motion.js',
  'fonts/noto-thai-400.ttf', 'fonts/noto-thai-600.ttf', 'fonts/OFL.txt'].map(file => `src/ui/skill-journal/${file}`));
const JOURNAL_SUITES = ['menu', 'save', 'journal', 'journal-motion', 'overlays', 'journal-upgrade', 'journal-lines', 'skill-lines'];
// New/unregistered images and the registry itself fail closed. These bytes are
// consumed by inventory, crafting, skill buttons, atlas/quests and ground loot.
export const ITEM_IMAGES = new Set(Object.entries(RASTER_ICONS)
  .filter(([key]) => /^(gear|material|arrow|skill)\//.test(key))
  .map(([, path]) => `public/${path}`));

export function boundedSuites(file) {
  if (ITEM_IMAGES.has(file)) return ['icons'];
  if (JOURNAL_FILES.has(file)) return JOURNAL_SUITES;
  return LOCAL_PATHS[file];
}

export function focusedReviewCovered(file) {
  // Older allowlists retain their legacy review owners until every consumer is
  // explicitly represented. These three bounded components have focused proof.
  return ITEM_IMAGES.has(file) || ['src/ui/menu.js', 'src/ui/quest-journal.js', 'src/ui/fieldhud.css'].includes(file);
}

// Hash the policy/runner/action as well as its version; forgetting to bump the
// version cannot make an older artifact certify a changed routing contract.
export function routingDigest() {
  const hash = createHash('sha256');
  for (const path of ['scripts/ci-browser-plan.mjs', 'scripts/ci-scope.mjs', 'scripts/ci-browser-run.mjs', 'scripts/ci-browser-gate.mjs',
    'scripts/ci-equipment-impact.mjs', 'scripts/ci-browser-engine.mjs', 'scripts/ci-review-plan.mjs', '.github/workflows/ci.yml',
    '.github/actions/change-scope/action.yml']) {
    hash.update(path + '\0'); hash.update(readFileSync(new URL(`../${path}`, import.meta.url))); hash.update('\0');
  }
  return hash.digest('hex');
}

export function validationPlan(files, options) {
  const paths = [...new Set(files)].sort();
  return { version: ROUTING_VERSION, routingDigest: routingDigest(), files: paths, ...browserPlan(paths, options) };
}
export function browserPlan(files, { full = false, impacts = {} } = {}) {
  if (full) return { suites: [...FULL_SUITES], reason: 'postmerge/manual full regression' };
  const selected = new Set();
  let game = false;
  for (const file of files) {
    // Runtime test inputs under docs need exact-path exceptions before the
    // documentation-only rule. Their consumers still require core/tools/build.
    if (file === 'docs/WEAPON-MODEL-PROVENANCE.json') {
      game = true; selected.add('weapons'); continue;
    }
    if (file === 'docs/icon-assets-manifest.json') {
      game = true; selected.add('icons'); continue;
    }
    if (file.startsWith('docs/') || /^(AGENTS|CLAUDE|README)\.md$/.test(file) || /^(LICENSE|\.gitignore)$/.test(file) ||
        file.startsWith('tests/tools/')) continue;
    // CI/build scripts change execution and artifact contracts, not just tooling.
    // Unclassified infrastructure must exercise the full inventory before review.
    game = true;
    // Diff-aware shared functions require independently inspected before/after source.
    let affected = impacts[file] || boundedSuites(file);
    if (/^tests\/core\/(equipment-inactive|gear-hands|wearable-level|crafting)\.test\.js$/.test(file))
      affected = ['equipment', 'equipment-focus', 'wearable', 'save'];
    if (file.startsWith('public/models/weapons/')) affected = ['smoke', 'equipment', 'weapons', 'combat', 'ux'];
    if (!affected) affected = Object.entries(SUITES).filter(([, scripts]) => scripts.some(name => file === `tests/browser/${name}`)).map(([suite]) => suite);
    if (!affected.length) return { suites: [...FULL_SUITES], reason: `conservative full fallback: ${file}` };
    affected.forEach(suite => selected.add(suite));
  }
  if (game) selected.add('boot');
  return { suites: FULL_SUITES.filter(suite => selected.has(suite)), reason: game ? 'boot + explicitly affected functionality' : 'documentation/tool checks only' };
}
