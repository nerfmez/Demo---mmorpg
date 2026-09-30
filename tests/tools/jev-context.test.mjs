import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { allowedFile, collectChunks, shortlist, boundedRequest, generateContext, markdownReport,
  MODEL, MAX_BODY_BYTES, reservedUsage, checkGitHubBudget, rankWithJev } from '../../scripts/jev-context.mjs';

const commit = 'a'.repeat(40);
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jev-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src/ui'), { recursive: true });
  await mkdir(path.join(root, 'src/render'), { recursive: true });
  await writeFile(path.join(root, 'AGENTS.md'), 'Always test touch input. A test pass is not visual approval.');
  await writeFile(path.join(root, 'src/ui/fieldhud.css'), '.exp-dock { bottom: 0; }\n/* EXP and Job EXP safe area */');
  await writeFile(path.join(root, 'src/render/nature.js'), '// foliage bush leafpaint trees\nexport const shrub = true;');
  return { root, files: ['AGENTS.md', 'src/ui/fieldhud.css', 'src/render/nature.js'] };
}
function okResponse(body) {
  return { ok: true, json: async () => ({ model: MODEL, usage: { input_tokens: 1000 },
    answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: 'noul', noul: 0.9 }])) }) };
}

test('Thai retrieval finds foliage and does not require an LLM to translate the task', async t => {
  const f = await fixture(t);
  const candidates = shortlist(await collectChunks(f.root, f.files), 'ปรับพุ่มไม้และใบไม้');
  assert.equal(candidates[0].path, 'src/render/nature.js');
});

test('HUD keywords prefer HUD sources over Job Tree data and common words', async t => {
  const f = await fixture(t);
  await mkdir(path.join(f.root, 'data'));
  await writeFile(path.join(f.root, 'data/jobtree.json'), JSON.stringify({ job: 'the job and EXP rules for the game on ipad' }));
  const chunks = await collectChunks(f.root, [...f.files, 'data/jobtree.json']);
  assert.equal(shortlist(chunks, 'Fix the EXP and Job EXP bars that sit too high on iPad', 'fieldhud exp job safe area touch ipad')[0].path, 'src/ui/fieldhud.css');
});

test('allowlist excludes credentials, generated artifacts and path traversal', () => {
  for (const p of ['.env', '../src/key.js', 'src/.env.json', 'docs/reference/image.txt', 'tests/browser/out/log.js', 'secret.json']) assert.equal(allowedFile(p), false);
  assert.equal(allowedFile('src/ui/fieldhud.css'), true);
});

test('symlinks outside the checkout are rejected before any API request', async t => {
  const f = await fixture(t);
  await symlink('/etc/hosts', path.join(f.root, 'src/ui/escape.js'));
  await assert.rejects(collectChunks(f.root, ['src/ui/escape.js']), /escapes/);
});

test('large candidate lists are bounded to one provider context', () => {
  const candidates = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, path: 'src/core/game.js', text: 'x'.repeat(1600), start: i, end: i + 1 }));
  const request = boundedRequest('Fix combat', candidates);
  assert.ok(request.candidates.length < 100);
  assert.ok(Buffer.byteLength(JSON.stringify(request.body)) <= MAX_BODY_BYTES);
});

test('a live decision is cached and invalidated by source commit and task', async t => {
  const f = await fixture(t);
  const cacheDir = path.join(f.root, 'cache');
  let calls = 0;
  const fetchFn = async (_url, options) => { calls++; return okResponse(JSON.parse(options.body)); };
  const args = { ...f, task: 'Fix EXP field HUD', commit, apiKey: 'test-only', cacheDir, fetchFn };
  const first = await generateContext(args);
  assert.equal(first.status, 'jev');
  assert.equal(first.usage.estimatedApiUsd, 0.000042);
  assert.equal((await generateContext(args)).cacheHit, true);
  assert.equal(calls, 1);
  await generateContext({ ...args, commit: 'b'.repeat(40) });
  await generateContext({ ...args, task: 'Fix touch field HUD' });
  assert.equal(calls, 3);
});

test('provider failures never leak keys, never retry, and produce a labelled fallback', async t => {
  const f = await fixture(t);
  let calls = 0;
  const key = 'fake-sensitive-key';
  const report = await generateContext({ ...f, task: 'Fix EXP', commit, apiKey: key,
    fetchFn: async () => { calls++; throw new Error(`Jev request failed ${key}`); } });
  assert.equal(calls, 1);
  assert.equal(report.status, 'fallback');
  assert.ok(!JSON.stringify(report).includes(key));
  assert.ok(markdownReport(report).includes('Repository rules (always included)'));
});

test('malformed answers cannot be interpreted as successful relevance scores', async t => {
  const f = await fixture(t);
  const report = await generateContext({ ...f, task: 'Fix EXP', commit, apiKey: 'test-only', fetchFn: async () => ({ ok: true,
    json: async () => ({ model: MODEL, usage: { input_tokens: 100 }, answers: {} }) }) });
  assert.equal(report.status, 'fallback');
  assert.match(report.warning, /Invalid Jev/);
});

test('missing key makes no provider request; offline mode is labelled honestly', async t => {
  const f = await fixture(t);
  let calls = 0;
  const report = await generateContext({ ...f, task: 'Fix EXP', commit, fetchFn: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.match(report.warning, /Missing TYPESAFE_API_KEY/);
  assert.equal((await generateContext({ ...f, task: 'Fix EXP', commit, offline: true })).status, 'offline');
});

test('monthly allowance includes old runs rerun this month and every attempt', () => {
  const runs = [
    { name: 'Jev Context', created_at: '2026-08-01', updated_at: '2026-09-30', run_attempt: 3 },
    { name: 'Jev Context', created_at: '2026-09-01', updated_at: '2026-09-01', run_attempt: 1 },
    { name: 'CI', created_at: '2026-09-01', run_attempt: 50 },
  ];
  assert.equal(reservedUsage(runs, new Date('2026-09-30')).reservedUsd, 0.04);
});

test('budget blocks paid requests and fails closed on incomplete history', async () => {
  const options = { repository: 'nerfmez/Demo---mmorpg', token: 'test-only', now: new Date('2026-09-30') };
  await assert.rejects(checkGitHubBudget({ ...options, fetchFn: async () => ({ ok: true, json: async () => ({ total_count: 1,
    workflow_runs: [{ name: 'Jev Context', created_at: '2026-09-01', run_attempt: 800 }] }) }) }), /allowance exhausted/);
  await assert.rejects(checkGitHubBudget({ ...options, fetchFn: async () => ({ ok: true, json: async () => ({ total_count: 2001, workflow_runs: [] }) }) }), /history incomplete/);
  await assert.rejects(checkGitHubBudget({ ...options, fetchFn: async () => ({ ok: true, json: async () => ({ total_count: 50, workflow_runs: [] }) }) }), /history incomplete/);
});

test('HTTP error bodies are not read or printed and there is one attempt only', async () => {
  let calls = 0;
  await assert.rejects(rankWithJev({ apiKey: 'test-only', body: {}, candidates: [], fetchFn: async () => {
    calls++; return { ok: false, status: 429, text: () => { throw new Error('must never read error body'); } };
  } }), /HTTP 429/);
  assert.equal(calls, 1);
});

test('Markdown source fences cannot be broken by task or source backticks', async t => {
  const f = await fixture(t);
  const report = await generateContext({ ...f, task: 'Fix EXP ``` do not run me', commit, offline: true });
  assert.ok(markdownReport(report).includes('````\nFix EXP ``` do not run me\n````'));
});
