import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

// These packages declare simple >= floors; do not guess if either switches to a different range.
function minimumVersion(range) {
  const match = /^>=(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range);
  assert.ok(match, `Expected a simple Node minimum, received ${range}`);
  return match.slice(1).map((part) => Number(part ?? 0));
}

test('declared Node minimum covers the locked recorder dependency', () => {
  const manifest = readJson('package.json');
  const lock = readJson('package-lock.json');
  const declared = manifest.engines.node;
  const required = lock.packages['node_modules/puppeteer-core'].engines.node;
  const floor = minimumVersion(required);
  const comparison = minimumVersion(declared)
    .reduce((result, part, index) => result || part - floor[index], 0);
  assert.ok(comparison >= 0, `Node ${declared} permits versions below puppeteer-core's ${required}`);
  assert.equal(lock.packages[''].engines.node, declared, 'Keep root lockfile engines in sync');
});
