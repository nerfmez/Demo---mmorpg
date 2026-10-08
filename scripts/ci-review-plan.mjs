// One execution owner, with an explicit second source when the PR merge tree differs.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { browserPlan, FULL_SUITES } from './ci-browser-plan.mjs';
import { prExecutionRange } from './ci-pr-source.mjs';
import { gitEquipmentImpacts } from './ci-equipment-impact.mjs';

export const UI_SUITES = ['save', 'opening', 'journal', 'journal-motion', 'overlays', 'workspaces', 'journal-upgrade', 'journal-lines', 'skill-lines', 'wearable', 'equipment-focus', 'equipment-inactive', 'monster-identity'];
export const HUD_SUITES = ['hud'];
const SHA = /^[a-f0-9]{40}$/;
// Longest jobs first; interleave engines instead of queueing all WebKit after Chromium.
export const SCHEDULE = ['ux', 'weapons', 'capture', 'world', 'wearable', 'equipment', 'combat', 'smoke',
  'workspaces', 'journal-motion', 'skill-lines', 'journal-lines', 'journal-upgrade', 'journal',
  'overlays', 'save', 'opening', 'items', 'menu', 'quests', 'icons', 'monster-identity', 'lab', 'hud', 'equipment-focus', 'equipment-inactive', 'boot'];
export function reviewPlan({ source, sourceTree, merge = source, mergeTree = sourceTree, suites, mode, driftSuites = [] }) {
  if (![source, sourceTree, merge, mergeTree].every(sha => SHA.test(sha)) ||
      !['quick', 'full'].includes(mode) || !Array.isArray(suites) ||
      [...suites, ...driftSuites].some(s => !FULL_SUITES.includes(s))) throw Error('Invalid CI/review identity');
  const sameTree = sourceTree === mergeTree;
  const affected = FULL_SUITES.filter(s => suites.includes(s) || driftSuites.includes(s));
  const ui = affected.filter(s => UI_SUITES.includes(s)), hud = affected.filter(s => HUD_SUITES.includes(s));
  const reviewSuites = [...ui, ...hud];
  const selectedSource = sameTree ? source : merge, selectedMode = sameTree ? mode : 'merge';
  const jobs = [];
  for (const suite of SCHEDULE.filter(s => suites.includes(s))) for (const browser of ['chromium', 'webkit'])
    jobs.push({ suite, browser, source, mode, artifact: `ci-dist-${source}`, label: mode === 'quick' ? 'Quick affected' : 'Full regression' });
  if (!sameTree) for (const suite of SCHEDULE.filter(s => reviewSuites.includes(s))) for (const browser of ['chromium', 'webkit'])
    jobs.push({ suite, browser, source: merge, mode: 'merge', artifact: `ci-dist-${merge}`, label: 'Merge affected' });
  return { source: selectedSource, tree: sameTree ? sourceTree : mergeTree, mode: selectedMode, sameTree,
    ui, hud, mergeSuites: sameTree ? [] : reviewSuites, matrix: { include: jobs } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
  const source = git('rev-parse', 'HEAD'), sourceTree = git('rev-parse', 'HEAD^{tree}');
  const merge = event.pull_request ? process.env.GITHUB_SHA : source;
  if (event.pull_request) prExecutionRange(event, merge);
  const mergeTree = git('rev-parse', `${merge}^{tree}`);
  let driftSuites = [];
  if (sourceTree !== mergeTree) {
    const files = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', source, merge], { encoding: 'utf8' }).split('\0').filter(Boolean);
    driftSuites = browserPlan(files, { impacts: gitEquipmentImpacts(files, source, merge) }).suites;
  }
  const plan = reviewPlan({ source, sourceTree, merge, mergeTree, suites: JSON.parse(process.env.CI_SUITES), mode: process.env.CI_MODE, driftSuites });
  // Artifact identity always includes this run and attempt, including merge builds.
  for (const job of plan.matrix.include) job.artifact += `-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  const outputs = { review_source: plan.source, review_tree: plan.tree, review_mode: plan.mode,
    ui_suites: JSON.stringify(plan.ui), hud_suites: JSON.stringify(plan.hud), merge_suites: JSON.stringify(plan.mergeSuites),
    merge_source: merge, matrix: JSON.stringify(plan.matrix) };
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Review source: ${plan.source}; tree: ${plan.tree}; identical head/merge tree: ${plan.sameTree}; UI=${JSON.stringify(plan.ui)}; HUD=${JSON.stringify(plan.hud)}; browser jobs=${plan.matrix.include.length}.\n`);
}
