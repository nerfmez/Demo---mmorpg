// Single inventory: PR affected checks and full regression use the same scripts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RASTER_ICONS } from '../src/ui/raster-icons.js';

export const ROUTING_VERSION = 5;
export const SUITES = {
  boot: ['boot.mjs'],
  opening: ['opening.mjs'],
  smoke: ['smoke.mjs'],
  world: ['map-travel.mjs', 'open-world.mjs', 'open-world-city.mjs'],
  combat: ['midhigh-monsters.mjs', 'coastal-attacks.mjs'],
  equipment: ['gear-hands.mjs', 'details-touch.mjs', 'details-game-touch.mjs'],
  'equipment-focus': ['equipment-focused.mjs'],
  'equipment-inactive': ['equipment-inactive.mjs'],
  weapons: ['weapon-loading.mjs', 'weapon-models.mjs'],
  items: ['shop-potions.mjs', 'potions-moving.mjs'],
  menu: ['menu-hub.mjs'],
  ux: ['ux.mjs'],
  lab: ['lab.mjs'],
  capture: ['capture.mjs'],
  save: ['journal-route-save.mjs'],
  icons: ['icon-consumers.mjs'],
  'monster-identity': ['monster-identity.mjs'],
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
  hud: ['fieldhud.mjs', 'gameplay-qol.mjs'],
};
export const FULL_SUITES = Object.keys(SUITES);
export const LEGACY_UI_SUITES = ['journal', 'journal-motion', 'overlays', 'workspaces', 'journal-upgrade', 'journal-lines', 'skill-lines', 'wearable', 'save'];
const UI_TESTS = new Set(['ux', 'journal', 'workspaces', 'passive-checks']);

// Demo release policy: bounded risk checks, not full-regression certification.
// Every runtime build gets real startup/create/save/Continue + route-save checks.
// Unknown/shared inputs get the bounded integration set; full inventory is separate.
export const SAFETY_SUITES = ['boot', 'save'];
export const SHARED_SUITES = ['boot', 'smoke', 'combat', 'menu', 'save', 'hud'];
export function riskSuites(file) {
  const name = file.split('/').at(-1).split('.')[0];
  if (file === 'src/save.js' || /^(?:character|progression|skills|jobtree|mods|journal)(?:-|$)/.test(name))
    return ['save', 'opening', 'journal-upgrade', 'skill-lines'];
  if (/^(?:world|terrain|map|harbor|city|ground|environment)(?:-|$)/.test(name)) return ['world', 'smoke'];
  if (/^(?:ai|combat|monsters?|damage|projectiles?|physical|vfx|status|boss)(?:-|$)/.test(name))
    return ['combat', 'monster-identity', 'smoke'];
  if (/^(?:equipment|gear|crafting|items?|weapons?|loot|shop|potions?)(?:-|$)/.test(name))
    return ['equipment-focus', 'weapons', 'items'];
  if (file.startsWith('src/lab/')) return ['lab'];
  if (file.startsWith('src/ui/')) return ['menu', 'hud', 'overlays'];
  return SHARED_SUITES;
}
const LOCAL_PATHS = {
  // This infrastructure also defines the actual opening case inventory.
  'scripts/ci-browser-shards.mjs': [...SHARED_SUITES, 'opening'],
  // Title creation and Continue are exercised by boot; hub navigation by menu.
  'src/ui/menu.js': ['menu'],
  'src/ui/menu-map.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/mapimage.js': ['world', 'menu', 'ux', 'capture'],
  'src/ui/equipment-avatar.js': ['equipment', 'weapons', 'menu', 'ux', 'workspaces', 'hud'],
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
  if (['data/items.json', 'data/quests.json', 'src/ui/art.js', 'src/ui/raster-icons.js'].includes(file) || file.startsWith('public/assets/icons/monster/')) return [...riskSuites(file), 'monster-identity'];
  if (ITEM_IMAGES.has(file)) return ['icons'];
  if (JOURNAL_FILES.has(file)) return JOURNAL_SUITES;
  return LOCAL_PATHS[file];
}

export function focusedReviewCovered(file) {
  // Older allowlists retain their legacy review owners until every consumer is
  // explicitly represented. These three bounded components have focused proof.
  return ITEM_IMAGES.has(file) || ['src/ui/menu.js', 'src/ui/quest-journal.js', 'src/ui/fieldhud.css'].includes(file);
}

export function legacyReviewRequirements(file) {
  const browserTest = /^tests\/browser\/([^/]+)\.mjs$/.exec(file)?.[1];
  const sharedUi = !focusedReviewCovered(file) && file.startsWith('src/ui/');
  return {
    ui: sharedUi || file === 'index.html' ||
      ['src/core/skills.js', 'src/core/character.js', 'src/save.js', 'data/jobtree.json', 'data/skills.json', 'data/mods.json'].includes(file) ||
      UI_TESTS.has(browserTest) || /^tests\/core\/(workspaces|journal|skills|save|progression)\.test\.js$/.test(file),
    hud: sharedUi || file === 'index.html' || browserTest === 'fieldhud' || file === 'tests/core/fieldhud.test.js',
  };
}

// Hash the policy/runner/action as well as its version; forgetting to bump the
// version cannot make an older artifact certify a changed routing contract.
export function routingDigest() {
  const hash = createHash('sha256');
  for (const path of ['scripts/ci-browser-plan.mjs', 'scripts/ci-scope.mjs', 'scripts/ci-browser-run.mjs', 'scripts/ci-browser-gate.mjs',
    'scripts/ci-pr-source.mjs', 'scripts/ci-equipment-impact.mjs', 'scripts/ci-browser-engine.mjs', 'scripts/ci-browser-shards.mjs', 'scripts/ci-review-plan.mjs', '.github/workflows/ci.yml',
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
    // Unclassified infrastructure exercises the bounded shared integration checks.
    game = true;
    // Diff-aware shared functions require independently inspected before/after source.
    let affected = impacts[file] || boundedSuites(file);
    if (/^tests\/core\/(equipment-inactive|gear-hands|wearable-level|crafting)\.test\.js$/.test(file))
      affected = ['equipment', 'equipment-focus', 'wearable', 'save'];
    if (file.startsWith('public/models/weapons/')) affected = ['smoke', 'equipment', 'weapons', 'combat', 'ux'];
    if (!affected) affected = Object.entries(SUITES).filter(([, scripts]) => scripts.some(name => file === `tests/browser/${name}`)).map(([suite]) => suite);
    if (!affected.length) affected = riskSuites(file);
    affected.forEach(suite => selected.add(suite));

  }
  if (game) SAFETY_SUITES.forEach(suite => selected.add(suite));
  return { suites: FULL_SUITES.filter(suite => selected.has(suite)), reason: game ? 'startup/save safety + bounded affected demo checks (full regression separate)' : 'documentation/tool checks only' };
}
