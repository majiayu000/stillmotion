// Minimal static file server used by the exporter. ES modules cannot load from file://,
// so pages are served over http from `root`. Requests that resolve outside `root` are rejected.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

export function resolveInside(root, urlPath) {
  const file = path.resolve(root, `.${decodeURIComponent(urlPath)}`);
  const rel = path.relative(root, file);
  return rel.startsWith('..') || path.isAbsolute(rel) ? null : file;
}

// Resolves to { server, origin } once listening on a random free port
export async function startStaticServer(root) {
  const base = path.resolve(root);
  const server = createServer(async (req, res) => {
    const file = resolveInside(base, new URL(req.url, 'http://local').pathname);
    if (!file) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
