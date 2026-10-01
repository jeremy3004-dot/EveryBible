import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Size budgets for bundled raster images. Every byte ships in the binary and
 * every pixel is decoded to 4 bytes of memory when shown, so each role gets a
 * cap near its optimised size (pngquant + oxipng; covers resized to 1200x900,
 * about 2.8x their largest on-screen width). Raise a budget only with a reason.
 */
const ROOT = path.resolve(__dirname, '../..');
const KB = 1024;

interface Role {
  dir: string;
  extensions: string[];
  maxBytes: number;
  maxWidth: number;
}

const ROLES: Role[] = [
  { dir: 'assets/plans/covers', extensions: ['.png'], maxBytes: 170 * KB, maxWidth: 1200 },
  { dir: 'assets/icons/gather', extensions: ['.png'], maxBytes: 40 * KB, maxWidth: 512 },
  {
    dir: 'assets/home/verse-backgrounds',
    extensions: ['.jpg'],
    maxBytes: 340 * KB,
    maxWidth: 1200,
  },
  { dir: 'assets/audio', extensions: ['.png'], maxBytes: 40 * KB, maxWidth: 300 },
];

// A PNG's width is the big-endian uint32 right after the 8-byte signature and IHDR header.
const pngWidth = (file: string): number => readFileSync(file).readUInt32BE(16);

test('bundled images stay inside their role size budgets', () => {
  for (const role of ROLES) {
    const dir = path.join(ROOT, role.dir);
    const files = readdirSync(dir).filter((f) => role.extensions.includes(path.extname(f)));
    assert.ok(files.length > 0, `${role.dir} has no images`);
    for (const name of files) {
      const file = path.join(dir, name);
      const size = statSync(file).size;
      assert.ok(
        size <= role.maxBytes,
        `${role.dir}/${name} is ${size} B (budget ${role.maxBytes})`
      );
      if (name.endsWith('.png')) {
        assert.ok(
          pngWidth(file) <= role.maxWidth,
          `${role.dir}/${name} is wider than ${role.maxWidth}px`
        );
      }
    }
  }
});

test('every raster image required from src exists and is at most 1 MB', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'testing' ? [] : walk(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  const pattern = /require\(\s*'([^']+\.(?:png|jpe?g|webp))'\s*\)/g;
  let seen = 0;
  for (const source of walk(path.join(ROOT, 'src'))) {
    const text = readFileSync(source, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const file = path.resolve(path.dirname(source), match[1] as string);
      assert.ok(existsSync(file), `${path.relative(ROOT, source)} requires missing ${match[1]}`);
      assert.ok(statSync(file).size <= 1024 * KB, `${path.relative(ROOT, file)} exceeds 1 MB`);
      seen += 1;
    }
  }
  assert.ok(seen > 50, 'expected to find the bundled image requires');
});
