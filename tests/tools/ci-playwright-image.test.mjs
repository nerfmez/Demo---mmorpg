import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const locked = JSON.parse(read('package-lock.json')).packages['node_modules/playwright'].version;
const ci = read('.github/workflows/ci.yml').split('\n  browser:\n')[1].split('\n  review:\n')[0];
const live = read('.github/workflows/deploy.yml').split('\n  deploy:\n')[1];
const light = read('.github/workflows/render-light.yml').split('\n  verify:\n')[1];
const guard = job => job.match(/node <<'NODE'\n([\s\S]*?)\n\s+NODE/)[1].split('\n').map(line => line.trimStart()).join('\n');

test('renderer light/shadow review runs in the same preinstalled image (no browser download per run)', () => {
  assert.equal(light.match(/image: (\S+)/)[1], ci.match(/image: (\S+)/)[1]);
  assert.match(light, /options: --init --shm-size=1g/);
  assert.match(light, /NODE_OPTIONS: --dns-result-order=ipv4first/);
  assert.doesNotMatch(light, /install --with-deps|apt-get|python3/);
  assert.match(light, /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/);
  // the file server is copied out before a review_ref checkout (which may predate it) replaces the workspace
  assert.match(light, /cp scripts\/static-serve\.mjs "\$RUNNER_TEMP\/static-serve\.mjs"/);
  assert.match(light, /node "\$RUNNER_TEMP\/static-serve\.mjs" /);
  assert.ok(light.indexOf('cp scripts/static-serve.mjs') < light.indexOf('name: Checkout requested render source'));
  assert.ok(light.indexOf('npm ci && npm run build') < light.indexOf('name: Verify preinstalled Playwright'));
  assert.ok(light.indexOf('name: Verify preinstalled Playwright') < light.indexOf('name: Pinned unmodified baseline screenshots'));
  assert.deepEqual(guard(light), guard(ci));
});

test('browser shards and live WebKit use the same official immutable image matching the lock', () => {
  const images = [ci, live].map(job => job.match(/image: (\S+)/)[1]);
  assert.equal(images[0], images[1]);
  assert.match(images[0], /^mcr\.microsoft\.com\/playwright:v[\d.]+-noble@sha256:[a-f0-9]{64}$/);
  assert.equal(images[0].match(/:v([\d.]+)-noble/)[1], locked);
  for (const job of [ci, live]) {
    assert.match(job, /options: --init --shm-size=1g/);
    assert.match(job, /NODE_OPTIONS: --dns-result-order=ipv4first/);
    assert.doesNotMatch(job, /--privileged|--cap-add|--ipc=host|install --with-deps|apt-get|PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS/);
    assert.ok(job.indexOf('run: npm ci') < job.indexOf('name: Verify preinstalled Playwright'));
  }
  assert.doesNotMatch(ci, /actions\/cache@|ms-playwright\s*\n\s*key:/);
  assert.ok(ci.indexOf('name: Verify downloaded build source') < ci.indexOf('name: Verify preinstalled Playwright'));
  assert.ok(ci.indexOf('name: Verify preinstalled Playwright') < ci.indexOf('name: Run complete selected shard'));
  assert.ok(live.indexOf('name: Verify preinstalled Playwright') < live.indexOf('name: Published startup save'));
  assert.deepEqual(guard(ci), guard(live));
});

function verify(overrides = {}) {
  const fixture = { client: locked, core: locked, image: locked, imageName: `mcr.microsoft.com/playwright:v${locked}-noble`,
    browser: 'webkit', executable: '/ms-playwright/webkit-2215/pw_run.sh', ...overrides };
  const files = {
    constants: { X_OK: 1 },
    readFileSync: path => { assert.equal(path, '/ms-playwright/.docker-info');
      if (fixture.missingMetadata) throw Error('missing metadata');
      return JSON.stringify({ driverVersion: fixture.image, dockerImageName: fixture.imageName }); },
    realpathSync: path => { assert.equal(path, '/sdk/selected-browser');
      if (fixture.missingBrowser) throw Error('missing browser');
      return fixture.executable; },
    accessSync: (path, mode) => { assert.equal(path, fixture.executable); assert.equal(mode, 1);
      if (fixture.notExecutable) throw Error('not executable'); },
  };
  const modules = {
    'node:assert/strict': assert, 'node:fs': files,
    './package-lock.json': { packages: { 'node_modules/playwright': { version: locked } } },
    'playwright/package.json': { version: fixture.client }, 'playwright-core/package.json': { version: fixture.core },
    playwright: Object.fromEntries(['chromium', 'webkit'].map(engine => [engine, { executablePath: () => '/sdk/selected-browser' }])),
  };
  return runInNewContext(guard(ci), { require: name => { assert.ok(name in modules, name); return modules[name]; },
    process: { env: { BROWSER: fixture.browser } }, console: { log() {} } });
}

test('actual workflow guard accepts only matching installed image/client and selected preinstalled engine', () => {
  for (const browser of ['chromium', 'webkit']) assert.doesNotThrow(() => verify({ browser }));
  for (const invalid of [{ client: '1.57.0' }, { core: '1.57.0' }, { image: '1.57.0' },
    { imageName: `untrusted.example/playwright:v${locked}-noble` }, { browser: 'firefox' }, { browser: '' },
    { executable: '/tmp/browser' }, { missingMetadata: true }, { missingBrowser: true }, { notExecutable: true }])
    assert.throws(() => verify(invalid), JSON.stringify(invalid));
});

test('container shell trusts only its verified exact workspace; SHA and dirty checks stay mandatory', t => {
  const trust = job => job.split('      - name: Trust exact checked-out container workspace\n')[1]
    .split('      - uses:')[0].split('        run: |\n')[1].split('\n').map(line => line.trimStart()).join('\n');
  assert.equal(trust(ci), trust(live));
  for (const job of [ci, live]) {
    assert.ok(job.indexOf('uses: actions/checkout@') < job.indexOf('name: Trust exact checked-out'));
    assert.ok(job.indexOf('name: Trust exact checked-out') < job.indexOf('uses: actions/setup-node@'));
  }
  assert.doesNotMatch(trust(ci), /\*|chown|sudo/);
  const dir = mkdtempSync(join(tmpdir(), 'ci-container-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repository = join(dir, 'workspace'), other = join(dir, 'other');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(dir, 'global.gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
  for (const path of [repository, other]) {
    mkdirSync(path); execFileSync('git', ['init', '-q', path], { env });
    writeFileSync(join(path, 'README.md'), 'fixture');
    execFileSync('git', ['-C', path, 'add', '.'], { env });
    execFileSync('git', ['-C', path, '-c', 'user.name=fixture', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture'], { env });
  }
  const differentOwner = { ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' };
  const inspect = path => spawnSync('git', ['-C', path, 'rev-parse', 'HEAD'], { env: differentOwner });
  assert.notEqual(inspect(repository).status, 0);
  const wrong = spawnSync('bash', ['-e', '-c', trust(ci)], { cwd: repository, env: { ...differentOwner, GITHUB_WORKSPACE: other } });
  assert.notEqual(wrong.status, 0);
  const trusted = spawnSync('bash', ['-e', '-c', trust(ci)], { cwd: repository, env: { ...differentOwner, GITHUB_WORKSPACE: repository } });
  assert.equal(trusted.status, 0);
  assert.equal(inspect(repository).status, 0);
  assert.notEqual(inspect(other).status, 0, 'unrelated checkout remains untrusted');
  assert.equal(execFileSync('git', ['config', '--global', '--get-all', 'safe.directory'], { env, encoding: 'utf8' }).trim(), repository);
  const runner = read('scripts/ci-browser-run.mjs');
  assert.match(runner, /source !== process\.env\.CI_SOURCE_SHA/);
  assert.match(runner, /process\.env\.CI_SOURCE_SHA && sourceDirty/);
});
