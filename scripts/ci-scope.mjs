// Risk-based CI routing. Unknown runtime paths fail closed to the main game suite.
// Keep workflow/check names stable; gate expensive steps, not workflow triggers.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { browserPlan } from './ci-browser-plan.mjs';

const UI_TESTS = new Set(['ux', 'journal', 'workspaces', 'passive-checks']);
const LIGHT_FILES = new Set(['view', 'toon', 'patch', 'settings', 'painted', 'ground', 'ground-color', 'grass', 'environment', 'surfaceart', 'anime-study', 'art-study', 'leafpaint', 'nature']);
const MAP_FILES = new Set(['ground', 'ground-color', 'grass', 'environment', 'harbor', 'nature', 'anime-study', 'art-study']);
const all = () => ({ game: true, tools: true, ui: true, hud: true, render: true, map: true });

export function classifyFiles(files) {
  const scope = { game: false, tools: false, ui: false, hud: false, render: false, map: false };
  for (const file of files) {
    if (file === 'docs/WEAPON-MODEL-PROVENANCE.json') { scope.game = true; continue; }
    if (file.startsWith('docs/') || /^(AGENTS|CLAUDE|README)\.md$/.test(file) || /^(LICENSE|\.gitignore)$/.test(file)) continue;
    if (file.startsWith('.github/') || file.startsWith('scripts/') || file.startsWith('tests/tools/')) {
      scope.tools = true;
      continue;
    }
    scope.game = true;
    const browserTest = /^tests\/browser\/([^/]+)\.mjs$/.exec(file)?.[1];
    const renderFile = /^src\/render\/([^/]+)\.js$/.exec(file)?.[1];
    if (file.startsWith('src/ui/') || file === 'index.html' ||
        ['src/core/skills.js', 'src/core/character.js', 'src/save.js', 'data/jobtree.json', 'data/skills.json', 'data/mods.json'].includes(file) ||
        UI_TESTS.has(browserTest) || /^tests\/core\/(workspaces|journal|skills|save|progression)\.test\.js$/.test(file)) scope.ui = true;
    if (file.startsWith('src/ui/') || file === 'index.html' || browserTest === 'fieldhud' || file === 'tests/core/fieldhud.test.js') scope.hud = true;
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
  const { base, head } = eventRange(process.env.GITHUB_EVENT_NAME, event);
  let scope, files = [], forceFull = process.env.FORCE_FULL === 'true';
  if (!base || !head || /^0+$/.test(base)) { scope = all(); forceFull = true; }
  else {
    // NUL delimiters preserve spaces/newlines in filenames. Missing commits are an
    // error, never an excuse to silently omit checks; checkout must fetch history.
    files = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head], { encoding: 'utf8' }).split('\0').filter(Boolean);
    scope = classifyFiles(files);
    console.log(`Changed files: ${files.length}; scope: ${JSON.stringify(scope)}`);
  }
  if (process.env.FORCE_RENDER === 'true') scope.render = true;
  if (forceFull) scope = all();
  const plan = browserPlan(files, { full: forceFull });
  if (process.env.FORCE_BOOT === 'true') {
    scope.game = true;
    if (!plan.suites.includes('boot')) plan.suites.unshift('boot');
    if (plan.suites.length === 1) plan.reason = 'release build/core/boot required even for documentation/tool changes';
  }
  // JSON encodes filenames safely, including embedded newlines. Actions outputs
  // remain single-line and are never interpolated into shell code.
  const output = Object.entries({ ...scope, browser_suites: JSON.stringify(plan.suites), browser_reason: JSON.stringify(plan.reason) }).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
