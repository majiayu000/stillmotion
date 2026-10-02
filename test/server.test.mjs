import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInside, startStaticServer } from '../server.mjs';

test('resolveInside keeps paths inside root', () => {
  assert.equal(resolveInside('/srv/site', '/a/b.html'), path.resolve('/srv/site/a/b.html'));
  assert.equal(resolveInside('/srv/site', '/../etc/passwd'), null);
  assert.equal(resolveInside('/srv/site', '/%2e%2e/etc/passwd'), null);
  // A sibling directory sharing the root's prefix must not count as inside
  assert.equal(resolveInside('/srv/site', '/../site-secrets/key'), null);
});

// Raw request so the client does not normalise "../" before sending
function get(origin, rawPath) {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${rawPath}`, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.path = rawPath;
    req.on('error', reject);
    req.end();
  });
}

test('static server serves files, 404s missing ones and refuses traversal', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'stillmotion-test-'));
  await mkdir(path.join(dir, 'site'));
  await writeFile(path.join(dir, 'site', 'index.html'), '<p>hi</p>');
  await writeFile(path.join(dir, 'secret.txt'), 'nope');
  const { server, origin } = await startStaticServer(path.join(dir, 'site'));
  try {
    const ok = await get(origin, '/index.html');
    assert.equal(ok.status, 200);
    assert.equal(ok.type, 'text/html');
    assert.equal(ok.body, '<p>hi</p>');
    assert.equal((await get(origin, '/missing.js')).status, 404);
    assert.equal((await get(origin, '/..%2fsecret.txt')).status, 403);
  } finally {
    server.close();
  }
});
