// Sanity checks for the production bundle before it is deployed to GitHub Pages (served under /warprime/).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const errors = [];
for (const f of ['index.html', '404.html', 'version.json']) if (!existsSync(join(dist, f))) errors.push(`missing ${f}`);

for (const f of readdirSync(dist).filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(join(dist, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    if (url.startsWith('/') && !url.startsWith('//') && f !== '404.html') errors.push(`${f}: root-absolute URL ${url} breaks under /warprime/`);
    if (url.startsWith('./assets/') && !existsSync(join(dist, url))) errors.push(`${f}: missing ${url}`);
  }
}

let gz = 0;
const sizes = [];
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|json)$/.test(f) && !f.endsWith('.map')) {
      const size = gzipSync(readFileSync(p)).length;
      gz += size;
      sizes.push([p, size]);
    }
  }
}
walk(dist);
sizes.sort((a, b) => b[1] - a[1]);
for (const [p, s] of sizes.slice(0, 6)) console.log(`${(s / 1024).toFixed(1).padStart(8)} KB gz  ${p}`);
console.log(`total ${(gz / 1024).toFixed(1)} KB gz`);
if (gz > 1.5 * 1024 * 1024) console.warn('warning: bundle larger than 1.5 MB gzipped');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('dist ok');
