// GitHub may retain an old PR base SHA after main advances. The executed merge
// parents are authoritative; require the event head and prove base ancestry.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const SHA = /^[a-f0-9]{40}$/;
const localGit = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
export function prExecutionRange(event, merge, git = localGit) {
  const declared = event.pull_request?.base?.sha, head = event.pull_request?.head?.sha;
  for (const sha of [declared, head, merge]) assert.match(sha || '', SHA);
  const parents = git('show', '-s', '--format=%P', merge).trim().split(' ');
  assert.equal(parents.length, 2, 'Executed PR revision must be a merge');
  assert.equal(parents[1], head, 'Executed PR head differs from event');
  assert.match(parents[0], SHA);
  if (declared !== parents[0]) git('merge-base', '--is-ancestor', declared, parents[0]);
  return { base: parents[0], head, declaredBase: declared };
}
