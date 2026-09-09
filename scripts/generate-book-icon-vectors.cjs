// Offline authoring only. Conversion dependencies never enter the mobile bundle.
// Usage: node scripts/generate-book-icon-vectors.cjs <tools-dir> <production-dir>
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sharp = require('sharp');

async function main() {
  const [toolsDir, productionDir] = process.argv.slice(2);
  if (!toolsDir || !productionDir)
    throw new Error('Expected tools directory and production directory');
  const toolRequire = createRequire(path.resolve(toolsDir, 'package.json'));
  const { trace } = toolRequire('potrace');
  const { optimize } = toolRequire('svgo');
  const catalog = JSON.parse(fs.readFileSync(path.join(productionDir, 'catalog.json'), 'utf8'));
  const destination = path.resolve('assets/book-icons-vector');
  fs.mkdirSync(destination, { recursive: true });
  const report = [];

  for (const [id, name, subject] of catalog) {
    if (subject.startsWith('@')) continue;
    const source = path.join(productionDir, 'sources', `${id}.png`);
    if (!fs.existsSync(source)) throw new Error(`${id}: missing source image`);
    const { data, info } = await sharp(source)
      .flatten({ background: '#fff' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let left = info.width,
      top = info.height,
      right = -1,
      bottom = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[y * info.width + x] < 128) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left) throw new Error(`${id}: empty artwork`);
    // Normalize visual scale without distorting the drawing; retain 8% padding.
    const normalized = await sharp(source)
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .resize(648, 648, { fit: 'contain', background: '#fff' })
      .extend({ top: 60, bottom: 60, left: 60, right: 60, background: '#fff' })
      .flatten({ background: '#fff' })
      .greyscale()
      .png()
      .toBuffer();
    const traced = await new Promise((resolve, reject) =>
      trace(
        normalized,
        {
          threshold: 128,
          turdSize: 8,
          alphaMax: 1,
          optTolerance: 0.6,
          color: 'currentColor',
          background: 'transparent',
        },
        (error, svg) => (error ? reject(error) : resolve(svg))
      )
    );
    const svg = optimize(traced, {
      multipass: true,
      floatPrecision: 1,
      plugins: [{ name: 'preset-default' }, 'removeDimensions'],
    }).data;
    if (/image|base64|filter|mask|gradient|<rect/i.test(svg))
      throw new Error(`${id}: non-vector content`);
    const bytes = Buffer.byteLength(svg + '\n');
    if (bytes > 20000) throw new Error(`${id}: exceeds 20 KB budget (${bytes})`);
    fs.writeFileSync(path.join(destination, `${id.toLowerCase()}.svg`), svg + '\n');
    report.push({ id, name, bytes, paths: (svg.match(/<path\b/g) || []).length });
  }
  fs.writeFileSync(
    path.join(productionDir, 'size-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(
    JSON.stringify({
      icons: report.length,
      bytes: report.reduce((sum, row) => sum + row.bytes, 0),
      largest: [...report].sort((a, b) => b.bytes - a.bytes).slice(0, 3),
    })
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
