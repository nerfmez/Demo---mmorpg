// Risk-based CI routing. Unknown runtime paths fail closed to the main game suite.
// Keep workflow/check names stable; gate expensive steps, not workflow triggers.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { legacyReviewRequirements, validationPlan, SAFETY_SUITES } from './ci-browser-plan.mjs';
import { gitEquipmentImpacts } from './ci-equipment-impact.mjs';

const LIGHT_FILES = new Set(['view', 'toon', 'patch', 'settings', 'painted', 'ground', 'ground-color', 'grass', 'environment', 'surfaceart', 'anime-study', 'art-study', 'leafpaint', 'nature']);
const MAP_FILES = new Set(['ground', 'ground-color', 'grass', 'environment', 'harbor', 'nature', 'anime-study', 'art-study']);
const all = () => ({ game: true, tools: true, ui: true, hud: true, render: true, map: true });

export function classifyFiles(files) {
  const scope = { game: false, tools: false, ui: false, hud: false, render: false, map: false };
  for (const file of files) {
    if (['docs/WEAPON-MODEL-PROVENANCE.json', 'docs/icon-assets-manifest.json'].includes(file)) {
      scope.game = true; continue;
    }
    if (file.startsWith('docs/') || /^(AGENTS|CLAUDE|README)\.md$/.test(file) || /^(LICENSE|\.gitignore)$/.test(file)) continue;
    if (file.startsWith('.github/') || file.startsWith('scripts/') || file.startsWith('tests/tools/')) {
      scope.tools = true;
      // Keep scope and browserPlan aligned: CI/build infrastructure selects full.
      if (!file.startsWith('tests/tools/')) scope.game = true;
      continue;
    }
    scope.game = true;
    const browserTest = /^tests\/browser\/([^/]+)\.mjs$/.exec(file)?.[1];
    const renderFile = /^src\/render\/([^/]+)\.js$/.exec(file)?.[1];
    // Explicit bounded consumers run in CI's selected shards. Broad review still
    // runs for shared/unknown UI, and CI owns every broad script after merge.
    const legacy = legacyReviewRequirements(file);
    if (legacy.ui) scope.ui = true;
    if (legacy.hud) scope.hud = true;
    if (LIGHT_FILES.has(renderFile) || ['data/rendering.json', 'data/art.json', 'data/world.json', 'tests/core/rendering.test.js'].includes(file) || browserTest === 'render-light') scope.render = true;
    if (MAP_FILES.has(renderFile) || ['data/world.json', 'data/art.json', 'src/core/world.js', 'src/core/terrain.js'].includes(file) || ['capture', 'harbor-capture', 'dreamloop'].includes(browserTest)) scope.map = true;
    // Dependency/build changes and unknown infrastructure may affect every browser path.
    if (['package.json', 'package-lock.json'].includes(file) || /^vite\.config\./.test(file)) Object.assign(scope, all());
  }
  return scope;
}

export function eventRange(eventName, event) {
  if (eventName === 'pull_request') return { base: event.pull_request?.base?.sha, head: event.pull_request?.head?.sha };
  if (eventName === 'push') return { base: event.before, head: event.after };
  return {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let { base, head } = eventRange(process.env.GITHUB_EVENT_NAME, event);
  if (process.env.FORCE_BOOT === 'true') {
    if (!/^[a-f0-9]{40}$/.test(process.env.RELEASE_BASE_SHA || '')) throw Error('Missing verified published release baseline');
    base = process.env.RELEASE_BASE_SHA;
    head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  }
  let scope, files = [], forceFull = process.env.FORCE_FULL === 'true';
  if (!base || !head || /^0+$/.test(base)) { scope = all(); files = ['unknown-release-input']; }
  else {
    // NUL delimiters preserve spaces/newlines in filenames. Missing commits are an
    // error, never an excuse to silently omit checks; checkout must fetch history.
    files = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head], { encoding: 'utf8' }).split('\0').filter(Boolean);
    scope = classifyFiles(files);
    console.log(`Changed files: ${files.length}; scope: ${JSON.stringify(scope)}`);
  }
  if (!forceFull && process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GH_TOKEN) {
    const { docFollowup } = await import('./ci-doc-followup.mjs');
    const reused = await docFollowup(event);
    if (reused) {
      files = [];
      scope = classifyFiles(files);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `Prose-only followup: runtime/tests/config unchanged. Reused real affected evidence ${JSON.stringify(reused)}. No new game build or browser run claimed.\n`);
    }
  }
  if (process.env.FORCE_RENDER === 'true') scope.render = true;
  if (forceFull) scope = all();
  const impacts = !forceFull && base && head ? gitEquipmentImpacts(files, base, head) : {};
  const plan = validationPlan(files, { full: forceFull, impacts });
  if (process.env.FORCE_BOOT === 'true') {
    scope.game = true;
    for (const suite of SAFETY_SUITES) if (!plan.suites.includes(suite)) plan.suites.push(suite);
    if (plan.suites.length === 2) plan.reason = 'release build/core/startup/save required even for documentation/tool changes';
  }
  // JSON encodes filenames safely, including embedded newlines. Actions outputs
  // remain single-line and are never interpolated into shell code.
  const output = Object.entries({ ...scope, browser_suites: JSON.stringify(plan.suites), browser_reason: JSON.stringify(plan.reason) }).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
