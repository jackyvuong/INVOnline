import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const assets = path.join(dist, 'assets');

if (!fs.existsSync(dist)) {
  console.error('ERROR: dist/ not found');
  process.exit(1);
}

const files = fs.existsSync(assets) ? fs.readdirSync(assets) : [];
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));

console.log('dist/assets:', files.join(', ') || '(empty)');

if (js.length === 0) {
  console.error('ERROR: no .js bundle in dist/assets — abort deploy');
  process.exit(1);
}

if (css.length === 0) {
  console.error('ERROR: no .css bundle in dist/assets — abort deploy');
  process.exit(1);
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const file of [...js, ...css]) {
  if (!html.includes(file)) {
    console.error(`ERROR: index.html does not reference ${file}`);
    process.exit(1);
  }
}

console.log('OK: dist verified');
