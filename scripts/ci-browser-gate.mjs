// Aggregate success alone cannot certify that every planned shard actually ran.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SUITES } from './ci-browser-plan.mjs';

export function verifyBrowserReports({ directory, source, browser, suites, mode }) {
  if (!/^[a-f0-9]{40}$/.test(source) || !['chromium', 'webkit'].includes(browser) ||
      !['quick', 'full', 'merge'].includes(mode) || !Array.isArray(suites) || !suites.length || new Set(suites).size !== suites.length)
    throw Error('Invalid selected browser gate identity');
  for (const suite of suites) {
    if (!SUITES[suite]) throw Error(`Unknown selected suite: ${suite}`);
    const report = JSON.parse(readFileSync(join(directory, `${mode}-${browser}-${suite}.json`), 'utf8'));
    if (report.source !== source || report.sourceDirty !== false || report.mode !== mode || report.browser !== browser ||
        report.suite !== suite || report.ok !== true || report.complete !== true || report.running !== null ||
        !report.startedAt || !report.finishedAt || !Array.isArray(report.checks) ||
        JSON.stringify(report.checks.map(check => check.script)) !== JSON.stringify(SUITES[suite]) ||
        report.checks.some(check => check.exitCode !== 0 || check.signal || check.error || !check.startedAt || !(check.durationMs >= 0)))
      throw Error(`Incomplete/failed/wrong-source selected shard: ${browser}/${suite}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyBrowserReports({ directory: 'gate-reports', source: process.env.CI_SOURCE_SHA, browser: process.env.BROWSER,
    suites: JSON.parse(process.env.CI_SUITES), mode: process.env.CI_MODE });
}
