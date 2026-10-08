import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFiles, eventRange } from '../../scripts/ci-scope.mjs';

test('planning and documentation do not request gameplay or browser validation', () => {
  assert.deepEqual(classifyFiles(['AGENTS.md', 'CLAUDE.md', 'docs/JEV-CONTEXT-TH.md', 'docs/reference/review.jpg']),
    { game: false, tools: false, ui: false, hud: false, render: false, map: false });
});
test('combat and its browser test do not wake unrelated UI or whole-map captures', () => {
  const scope = classifyFiles(['src/core/ai.js', 'src/core/game.js', 'data/monsters.json', 'src/render/monsters.js', 'src/render/vfx.js', 'tests/browser/coastal-attacks.mjs']);
  assert.equal(scope.game, true);
  for (const key of ['tools', 'ui', 'hud', 'render', 'map']) assert.equal(scope[key], false, key);
});
test('UI, saves, renderer lighting and map changes select their consumers', () => {
  assert.equal(classifyFiles(['src/ui/fieldhud.js']).hud, true);
  assert.equal(classifyFiles(['tests/browser/passive-checks.mjs']).ui, true);
  assert.equal(classifyFiles(['src/save.js']).ui, true);
  assert.equal(classifyFiles(['src/render/toon.js']).render, true);
  assert.equal(classifyFiles(['data/world.json']).map, true);
  assert.equal(classifyFiles(['src/render/harbor.js']).map, true);
});
test('CI/build infrastructure requests game and tooling checks; dependencies request all owners', () => {
  assert.deepEqual(classifyFiles(['.github/workflows/ci.yml', 'scripts/ci-scope.mjs', 'tests/tools/ci-scope.test.mjs']),
    { game: true, tools: true, ui: false, hud: false, render: false, map: false });
  assert.ok(Object.values(classifyFiles(['package-lock.json'])).every(Boolean));
  assert.equal(classifyFiles(['new-runtime-file.js']).game, true);
});
test('PR and main push compare the event source revisions; other events require conservative checks', () => {
  assert.deepEqual(eventRange('pull_request', { pull_request: { base: { sha: 'base' }, head: { sha: 'head' } } }), { base: 'base', head: 'head' });
  assert.deepEqual(eventRange('push', { before: 'previous', after: 'main' }), { base: 'previous', head: 'main' });
  assert.deepEqual(eventRange('workflow_dispatch', {}), {});
});
test('workflow routing preserves check matrices and a single owner of smoke/UX', () => {
  const read = name => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  const ci = read('ci'), light = read('render-light'), ui = read('ui-review'), hud = read('field-hud');
  assert.match(ci, /workflows: \['Deploy to GitHub Pages'\]/);
  assert.doesNotMatch(ci, /\n  push:/);
  assert.match(ci, /pull_request:/);
  for (const text of [ci, light, ui, hud]) {
    assert.doesNotMatch(text, /paths(?:-ignore)?:/);
    assert.match(text, /uses: \.\/\.github\/actions\/change-scope/);
    assert.match(text, /browser: \[chromium, webkit\]/);
  }
  assert.match(light, /suite: \[visual, regression\]/);
  assert.doesNotMatch(light, /npm run test:browser|npm run test:ux/);
  assert.doesNotMatch(ui, /\n  push:/);
  assert.match(ci, /steps\.scope\.outputs\.game == 'true'/);
  assert.match(ci, /name: test \(\$\{\{ matrix.browser \}\}\)/);
  assert.match(ci, /workflow_dispatch:/);
  assert.match(ui, /steps\.scope\.outputs\.ui == 'true'/);
});
test('the CI entrypoint writes main-push scope and handles first pushes conservatively', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'CI fixture');
  git('config', 'user.email', 'ci@example.invalid');
  writeFileSync(join(dir, 'README.md'), 'before');
  git('add', '.'); git('commit', '-qm', 'before');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(dir, 'README.md'), 'after');
  git('add', '.'); git('commit', '-qm', 'docs');
  const head = git('rev-parse', 'HEAD'), event = join(dir, 'event.json'), output = join(dir, 'output');
  const run = (before, force = 'false', boot = 'false') => {
    writeFileSync(event, JSON.stringify({ before, after: head, ref: 'refs/heads/main' }));
    writeFileSync(output, '');
    execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/ci-scope.mjs', import.meta.url))], {
      cwd: dir, env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'push', GITHUB_OUTPUT: output, FORCE_RENDER: force, FORCE_BOOT: boot, RELEASE_BASE_SHA: base },
    });
    return readFileSync(output, 'utf8');
  };
  assert.match(run(base), /game=false/);
  assert.match(run(base, 'true'), /render=true/);
  const release = run(base, 'false', 'true');
  assert.match(release, /game=true/);
  assert.match(release, /browser_suites=\["boot","save"\]/);
  const firstPush = run('0'.repeat(40));
  assert.doesNotMatch(firstPush, /=false/);
  assert.match(firstPush, /browser_suites=\["boot","smoke"/);
});
