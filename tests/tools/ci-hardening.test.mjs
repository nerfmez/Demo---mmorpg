// These are isolated routing/runner contract tests, not browser/gameplay results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES, FULL_SUITES, browserPlan } from '../../scripts/ci-browser-plan.mjs';
import { classifyFiles } from '../../scripts/ci-scope.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const ci = read('.github/workflows/ci.yml');
const deploy = read('.github/workflows/deploy.yml');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-hardening-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const put = (path, data) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), data); };
  git('init', '-q'); git('config', 'user.name', 'CI fixture'); git('config', 'user.email', 'ci@example.invalid');
  put('README.md', 'fixture'); git('add', '.'); git('commit', '-qm', 'base');
  return { dir, git, put };
}
const shell = (script, dir, env = {}) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, ...env },
});

test('PR78 actual-game details regression has exactly one mandatory equipment owner', () => {
  assert.deepEqual(SUITES.equipment, ['gear-hands.mjs', 'details-touch.mjs', 'details-game-touch.mjs']);
  const all = Object.values(SUITES).flat();
  assert.equal(all.length, 19);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(browserPlan(['tests/browser/details-game-touch.mjs']).suites, ['boot', 'equipment']);
});
test('CI/build infrastructure cannot receive a tooling-only or partial browser pass', () => {
  for (const path of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/actions/change-scope/action.yml',
    '.github/actions/new/action.yml', 'scripts/ci-browser-plan.mjs', 'scripts/ci-browser-run.mjs',
    'scripts/ci-scope.mjs', 'scripts/build-new.mjs', 'scripts/preserve-published-lab.mjs']) {
    assert.equal(classifyFiles([path]).game, true, path);
    assert.equal(classifyFiles([path]).tools, true, path);
    assert.deepEqual(browserPlan([path]).suites, FULL_SUITES, path);
  }
});
test('bounded edits retain quick routing, boot, saves and the equipment menu consumer', () => {
  assert.deepEqual(browserPlan(['docs/HANDOFF.md']).suites, []);
  assert.deepEqual(browserPlan(['tests/tools/ci-scope.test.mjs']).suites, []);
  assert.equal(classifyFiles(['tests/tools/ci-scope.test.mjs']).tools, true);
  assert.equal(classifyFiles(['tests/tools/ci-scope.test.mjs']).game, false);
  assert.deepEqual(browserPlan(['tests/browser/menu-hub.mjs']).suites, ['boot', 'menu']);
  assert.deepEqual(browserPlan(['src/ui/equipment-avatar.js']).suites, ['boot', 'equipment', 'weapons', 'menu', 'ux']);
  for (const path of ['src/ui/menu.js', 'src/ui/skill-journal/journal.js']) {
    assert.ok(browserPlan([path]).suites.includes('save'), path);
    assert.ok(browserPlan([path]).suites.includes('boot'), path);
  }
});
test('shared, save, unknown and mixed/renamed runtime paths fail closed', () => {
  for (const path of ['src/main.js', 'src/save.js', 'data/items.json', 'src/ui/panels.js', 'src/render/view.js',
    'tests/browser/helpers/new.mjs', 'package-lock.json', 'vite.config.js', 'src/a\nb.js']) {
    assert.deepEqual(browserPlan(['tests/browser/menu-hub.mjs', path]).suites, FULL_SUITES, path);
  }
  assert.deepEqual(browserPlan(['docs/new-name.md', 'src/old-name.js']).suites, FULL_SUITES);
  assert.deepEqual(browserPlan([], { full: true }).suites, FULL_SUITES);
});

test('scope CLI routes a real CI-only PR diff to full and keeps its gate enabled', t => {
  const { dir, git, put } = fixture(t), base = git('rev-parse', 'HEAD');
  put('scripts/new-build.mjs', '// affects build'); git('add', '.'); git('commit', '-qm', 'infra');
  put('event.json', JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: git('rev-parse', 'HEAD') } } }));
  const run = spawnSync(process.execPath, [join(root, 'scripts/ci-scope.mjs')], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_OUTPUT: join(dir, 'outputs'), FORCE_FULL: 'false', FORCE_BOOT: 'false', FORCE_RENDER: 'false',
  } });
  assert.equal(run.status, 0, run.stderr);
  const out = readFileSync(join(dir, 'outputs'), 'utf8');
  assert.match(out, /^game=true$/m); assert.match(out, /^tools=true$/m);
  assert.deepEqual(JSON.parse(out.match(/^browser_suites=(.*)$/m)[1]), FULL_SUITES);
});
test('renames keep the removed runtime path even when the destination is documentation', t => {
  const { dir, git, put } = fixture(t);
  put('runtime.js', '// source'); git('add', '.'); git('commit', '-qm', 'runtime');
  const base = git('rev-parse', 'HEAD'); mkdirSync(join(dir, 'docs')); git('mv', 'runtime.js', 'docs/renamed.md'); git('commit', '-qm', 'move');
  const files = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, 'HEAD'], { cwd: dir, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(files.includes('runtime.js')); assert.ok(files.includes('docs/renamed.md'));
  assert.deepEqual(browserPlan(files).suites, FULL_SUITES);
});
test('missing git history is an error, not a successful skipped gate', t => {
  const { dir, git, put } = fixture(t);
  put('event.json', JSON.stringify({ before: 'a'.repeat(40), after: git('rev-parse', 'HEAD') }));
  const run = spawnSync(process.execPath, [join(root, 'scripts/ci-scope.mjs')], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: join(dir, 'event.json'),
    GITHUB_OUTPUT: join(dir, 'outputs'), FORCE_FULL: 'false', FORCE_BOOT: 'false',
  } });
  assert.notEqual(run.status, 0);
});

test('the actual summary shell rejects every failed/cancelled/unexpected-skip combination', t => {
  const { dir } = fixture(t);
  const tail = ci.slice(ci.indexOf('      - name: Report gate outcome at exact source'));
  const gate = tail.slice(tail.indexOf('        run: |\n') + '        run: |\n'.length).split('\n').map(line => line.replace(/^          /, '')).join('\n');
  assert.ok(gate.includes('test "$PREPARE" = success'));
  const statuses = ['success', 'failure', 'cancelled', 'skipped'];
  for (const PREPARE of statuses) for (const BROWSER_RESULT of statuses) for (const GAME of ['true', 'false', '']) for (const SUITES of ['', '[]', '["boot"]']) {
    const expected = PREPARE === 'success' && ((GAME === 'true' && BROWSER_RESULT === 'success' && SUITES !== '' && SUITES !== '[]') ||
      (GAME === 'false' && BROWSER_RESULT === 'skipped' && SUITES === '[]'));
    const result = shell(gate, dir, { PREPARE, BROWSER_RESULT, GAME, SUITES, SOURCE: 'b'.repeat(40), MODE: 'unit fixture', GITHUB_STEP_SUMMARY: join(dir, 'summary') });
    assert.equal(result.status === 0, expected, JSON.stringify({ PREPARE, BROWSER_RESULT, GAME, SUITES }));
  }
  assert.notEqual(shell(gate, dir, { PREPARE: 'success', BROWSER_RESULT: 'success', GAME: 'true', SUITES: '["boot"]', SOURCE: '', GITHUB_STEP_SUMMARY: join(dir, 'summary') }).status, 0);
});
test('browser artifact source check rejects an absent or wrong-source build', t => {
  const { dir, put } = fixture(t);
  const block = ci.match(/- name: Verify downloaded build source\n\s+run: (.*)/)?.[1];
  assert.ok(block, 'workflow must execute the marker check');
  const env = { CI_SOURCE_SHA: 'c'.repeat(40) };
  assert.notEqual(shell(block, dir, env).status, 0);
  put('dist/ci-source.txt', 'wrong\n'); assert.notEqual(shell(block, dir, env).status, 0);
  put('dist/ci-source.txt', 'c'.repeat(40) + '\n'); assert.equal(shell(block, dir, env).status, 0);
});
test('release uses the tested artifact, validates its source, and pins live-test checkout', () => {
  assert.match(ci, /artifact=ci-dist-\$sha-\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT/);
  assert.match(ci, /name: \$\{\{ needs.prepare.outputs.artifact \}\}/);
  assert.match(ci, /artifact:\n\s+value: \$\{\{ jobs.prepare.outputs.artifact \}\}/);
  assert.match(deploy, /name: \$\{\{ needs.validate.outputs.artifact \}\}/);
  assert.match(deploy, /test "\$\(cat dist\/ci-source.txt\)" = "\$SOURCE"/);
  assert.match(deploy, /ref: \$\{\{ needs.build.outputs.source \}\}/);
  assert.match(deploy, /release=\$\{\{ needs.build.outputs.source \}\}/);
  assert.equal((ci.match(/if-no-files-found: error/g) || []).length, 2);
});
test('parallel engine coverage, main full-run isolation, permissions and core/build owners are retained', () => {
  assert.match(ci, /browser: \[chromium, webkit\]/);
  assert.match(ci, /fail-fast: false/); assert.match(ci, /max-parallel: 6/);
  assert.match(ci, /group: ci-.*\|\| github.sha/);
  assert.match(ci, /cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \|\| inputs.quick_gate \}\}/);
  assert.match(ci, /permissions:\n  contents: read\nconcurrency:/);
  assert.match(deploy, /permissions:\n  contents: read\n  pages: write\n  id-token: write\n  actions: read\n/);
  assert.match(ci, /run: npm run test:tools\n\s+if: steps.scope.outputs.game == 'true' \|\| steps.scope.outputs.tools == 'true'/);
  assert.equal((ci.match(/run: npm test\n/g) || []).length, 1);
  assert.equal((ci.match(/run: npm run build\n/g) || []).length, 1);
  assert.doesNotMatch(ci + deploy, /continue-on-error/);
});

for (const browser of ['chromium', 'webkit']) test(`runner ${browser} records a failure before proceeding and never turns it green`, t => {
  const { dir, git, put } = fixture(t);
  const reportName = `tests/browser/out/ci/quick-${browser}-weapons.json`;
  put('tests/browser/weapon-loading.mjs', `import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; const r=JSON.parse(readFileSync('${reportName}')); assert.equal(r.complete,false); assert.equal(r.ok,false); assert.equal(r.running,'weapon-loading.mjs'); process.exit(7);`);
  put('tests/browser/weapon-models.mjs', `import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; const r=JSON.parse(readFileSync('${reportName}')); assert.equal(r.checks[0].exitCode,7); assert.equal(r.complete,false); assert.equal(r.running,'weapon-models.mjs');`);
  git('add', '.'); git('commit', '-qm', 'runner fixtures'); const source = git('rev-parse', 'HEAD');
  const run = extra => spawnSync(process.execPath, [join(root, 'scripts/ci-browser-run.mjs'), 'weapons'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, BROWSER: browser, CI_MODE: 'quick', CI_SOURCE_SHA: source, QUICK: '', SKIP_CAPTURES: '', ...extra,
  } });
  const result = run({}); assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(readFileSync(join(dir, reportName)));
  assert.equal(report.source, source); assert.equal(report.ok, false); assert.equal(report.complete, true);
  assert.deepEqual(report.checks.map(c => c.exitCode), [7, 0]);
  assert.ok(report.checks.every(c => c.durationMs >= 0 && c.startedAt));
  assert.notEqual(run({ CI_SOURCE_SHA: 'd'.repeat(40) }).status, 0);
  assert.notEqual(run({ QUICK: '1' }).status, 0); assert.notEqual(run({ SKIP_CAPTURES: '1' }).status, 0);
  put('README.md', 'dirty'); assert.notEqual(run({}).status, 0);
});
test('a signalled child remains failed and the next script is still attempted', t => {
  const { dir, git, put } = fixture(t);
  put('tests/browser/weapon-loading.mjs', "process.kill(process.pid, 'SIGTERM');");
  put('tests/browser/weapon-models.mjs', 'process.exit(0);'); git('add', '.'); git('commit', '-qm', 'signal fixture');
  const result = spawnSync(process.execPath, [join(root, 'scripts/ci-browser-run.mjs'), 'weapons'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, BROWSER: 'chromium', CI_MODE: 'full', CI_SOURCE_SHA: git('rev-parse', 'HEAD'), QUICK: '', SKIP_CAPTURES: '',
  } });
  assert.equal(result.status, 1);
  const report = JSON.parse(readFileSync(join(dir, 'tests/browser/out/ci/full-chromium-weapons.json')));
  assert.equal(report.ok, false); assert.equal(report.checks[0].signal, 'SIGTERM'); assert.equal(report.checks[1].exitCode, 0);
});
