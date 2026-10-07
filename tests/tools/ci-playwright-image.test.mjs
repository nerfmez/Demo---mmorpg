import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const locked = JSON.parse(read('package-lock.json')).packages['node_modules/playwright'].version;
const ci = read('.github/workflows/ci.yml').split('\n  browser:\n')[1].split('\n  review:\n')[0];
const live = read('.github/workflows/deploy.yml').split('\n  deploy:\n')[1];
const guard = job => job.match(/node <<'NODE'\n([\s\S]*?)\n\s+NODE/)[1].split('\n').map(line => line.trimStart()).join('\n');

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
  assert.ok(live.indexOf('name: Verify preinstalled Playwright') < live.indexOf('name: Dreamloop'));
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
