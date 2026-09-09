// Compile the SVG paths ahead of time, so phones never parse XML or trace images.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve('assets/book-icons-vector');
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
const icons = {};
const bookToIcon = {};
for (const [id, name, subject] of catalog) {
  bookToIcon[id] = subject.startsWith('@') ? subject.slice(1) : id;
  if (subject.startsWith('@')) continue;
  const svg = fs.readFileSync(path.join(dir, `${id.toLowerCase()}.svg`), 'utf8');
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1]);
  if (!paths.length) throw new Error(`Missing paths: ${name}`);
  icons[id] = { viewBox: svg.match(/viewBox="([^"]+)"/)[1], paths };
}
if (Object.keys(icons).length !== 57 || Object.keys(bookToIcon).length !== 66)
  throw new Error('Incomplete catalog');
fs.writeFileSync(
  'src/constants/bookIconVectors.generated.json',
  JSON.stringify({ icons, bookToIcon }) + '\n'
);
console.log(
  `Compiled ${Object.keys(icons).length} unique icons for ${Object.keys(bookToIcon).length} books`
);
