// Narrow expression fixtures, not a replacement for GitHub's workflow validator.
// For ==, || and these string/boolean/empty values, JavaScript has the same
// result as the Actions expression. Missing context properties are modeled as
// empty strings, as documented by GitHub. No browser/gameplay execution here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const expression = ci.match(/^  cancel-in-progress: \$\{\{ (.+) \}\}$/m)?.[1];
assert.ok(expression, 'workflow-level cancellation expression is required');
// Only evaluate the reviewed grammar below, never arbitrary repository code.
assert.match(expression, /^github\.event_name == 'pull_request' \|\| inputs\.quick_gate(?: == true)?$/);

function cancelFor(eventName, supplied = {}) {
  const inputs = new Proxy(supplied, {
    get: (object, key) => Object.hasOwn(object, key) ? object[key] : '',
  });
  return runInNewContext(expression, { github: { event_name: eventName }, inputs }, { timeout: 1000 });
}

for (const [name, event, inputs, expected] of [
  ['main push with absent inputs', 'push', {}, false],
  ['manual full run with absent inputs', 'workflow_dispatch', {}, false],
  ['PR quick gate with absent inputs', 'pull_request', {}, true],
  ['release quick gate called from push', 'push', { quick_gate: true }, true],
  ['reusable full gate with typed false', 'push', { quick_gate: false }, false],
  ['manual full gate with typed false', 'workflow_dispatch', { quick_gate: false }, false],
]) {
  test(`cancellation is an explicit boolean: ${name}`, () => {
    const actual = cancelFor(event, inputs);
    assert.equal(typeof actual, 'boolean', `${name}: an empty input must not escape as the cancellation value`);
    assert.equal(actual, expected, name);
  });
}

test('missing input regression cannot be hidden by PR-only coverage', () => {
  assert.equal(cancelFor('pull_request'), true);
  assert.equal(cancelFor('push'), false);
  assert.equal(cancelFor('workflow_dispatch'), false);
  assert.match(expression, /inputs\.quick_gate == true$/);
});
