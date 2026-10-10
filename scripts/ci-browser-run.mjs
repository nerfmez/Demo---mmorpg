import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { SUITES } from './ci-browser-plan.mjs';
import { validateEngineOwnership } from './ci-browser-engine.mjs';
import { browserShard } from './ci-browser-shards.mjs';

const suite = process.argv[2];
if (!SUITES[suite]) throw Error(`Unknown browser suite: ${suite}`);
const selection = browserShard(suite, process.argv[3]);
if (!['chromium', 'webkit'].includes(process.env.BROWSER)) throw Error('Set BROWSER=chromium or webkit');
if (process.env.QUICK || process.env.SKIP_CAPTURES || process.env.OFFLINE_UI || process.env.UI_DEVICE ||
    process.env.OPENING_VIEW || process.env.KIT || process.env.OPENING_MIGRATION || process.env.SMOKE_CASE)
  throw Error('CI must retain all real-game viewport assertions and captures');
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
if (process.env.CI_SOURCE_SHA && source !== process.env.CI_SOURCE_SHA) throw Error('Checkout differs from the planned source SHA');
if (process.env.CI_SOURCE_SHA && sourceDirty) throw Error('CI checkout contains uncommitted tracked changes');
const report = { ok: false, complete: false, startedAt: new Date().toISOString(), source, sourceDirty, mode: process.env.CI_MODE || 'local', browser: process.env.BROWSER, suite, shard: selection.shard, selection: selection.env, checks: [] };
mkdirSync('tests/browser/out/ci', { recursive: true });
const reportPath = `tests/browser/out/ci/${report.mode}-${report.browser}-${selection.shard}.json`;
const saveReport = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
saveReport();
let failed = false;
for (const script of SUITES[suite]) {
  report.running = script;
  saveReport(); // A killed/timed-out shard leaves an explicitly incomplete report.
  const start = Date.now();
  console.log(`START ${source} ${report.browser} ${selection.shard}/${script}`);
  let result;
  try {
    validateEngineOwnership(script, readFileSync(`tests/browser/${script}`, 'utf8'));
    // Preserve browser stderr and process-exit diagnostics for real crashes.
    // This adds evidence, never retries or changes assertions/timeouts.
    const env = { ...process.env, ...selection.env, DEBUG: [process.env.DEBUG, 'pw:browser'].filter(Boolean).join(',') };
    result = spawnSync(process.execPath, [`tests/browser/${script}`], { stdio: 'inherit', env });
  } catch (error) {
    console.error(error.message);
    result = { status: 1, signal: null, error };
  }
  const check = { script, startedAt: new Date(start).toISOString(), durationMs: Date.now() - start, exitCode: result.status, signal: result.signal, error: result.error?.message };
  report.checks.push(check);
  report.running = null;
  saveReport();
  console.log(`END ${JSON.stringify(check)}`);
  if (result.status !== 0) failed = true;
  // Attempt other scripts in the shard for evidence, but never turn a failure green.
}
report.ok = !failed;
report.complete = true;
report.finishedAt = new Date().toISOString();
saveReport();
process.exitCode = failed ? 1 : 0;
