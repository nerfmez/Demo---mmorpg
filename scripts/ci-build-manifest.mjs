// Bind the bytes tested by browsers to source, build configuration and runner.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
export function payload(directory, excluded = ['ci-build.json', 'ci-release.json', 'ci-evidence.json']) {
  const files = {};
  function walk(path = '') {
    for (const name of readdirSync(join(directory, path)).sort()) {
      const relative = path ? `${path}/${name}` : name;
      if (excluded.includes(relative)) continue;
      const stat = lstatSync(join(directory, relative));
      assert.ok(!stat.isSymbolicLink(), `Symlink in artifact: ${relative}`);
      if (stat.isDirectory()) walk(relative);
      else { assert.ok(stat.isFile()); files[relative] = sha256(readFileSync(join(directory, relative))); }
    }
  }
  walk();
  assert.ok(files['index.html'], 'Missing entrypoint');
  return files;
}
export function buildConfiguration() {
  return Object.fromEntries(['package.json', 'package-lock.json', 'vite.config.js', '.github/workflows/ci.yml']
    .map(path => [path, sha256(readFileSync(path))]));
}
export function writeBuild(directory = 'dist') {
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Build checkout is dirty');
  const manifest = { version: 1, source: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    node: process.versions.node, configuration: buildConfiguration(), files: payload(directory) };
  writeFileSync(join(directory, 'ci-build.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function verifyBuild(directory = 'dist', { source = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}') } = {}) {
  const manifest = JSON.parse(readFileSync(join(directory, 'ci-build.json')));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.source, source, 'Build source differs');
  assert.equal(manifest.tree, tree, 'Build source tree differs');
  assert.match(manifest.node, /^22\./, 'Expected Node 22 build');
  assert.deepEqual(manifest.configuration, buildConfiguration(), 'Build configuration differs');
  assert.deepEqual(payload(directory), manifest.files, 'Artifact payload changed after build');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'write') writeBuild();
  else if (process.argv[2] === 'verify') verifyBuild();
  else throw Error('Use write or verify');
}
