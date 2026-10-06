// Minimal static server that mounts a directory under a base path (e.g. dist at /warprime/), like GitHub Pages.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export function serveStatic(dir, base = '/', port = 0) {
  const root = normalize(dir);
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!url.startsWith(base)) {
      if (url === base.replace(/\/$/, '')) {
        res.writeHead(301, { Location: base });
        return res.end();
      }
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(existsSync(join(root, '404.html')) ? readFileSync(join(root, '404.html')) : 'not found');
    }
    let file = join(root, url.slice(base.length));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(existsSync(join(root, '404.html')) ? readFileSync(join(root, '404.html')) : 'not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}${base}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'dist';
  const base = process.argv[3] ?? '/warprime/';
  const port = Number(process.argv[4] ?? 4173);
  serveStatic(dir, base, port).then(({ url }) => console.log(`serving ${dir} at ${url}`));
}
