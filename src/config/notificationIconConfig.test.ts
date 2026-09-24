// Non-TypeScript artefact check: reads app.json and the notification icon PNG that the
// expo-notifications config plugin turns into Android's reminder and push small icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();

type PluginEntry = string | [string, Record<string, unknown>];

const notificationsPluginProps = (): Record<string, unknown> => {
  const appJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')) as {
    expo: { plugins: PluginEntry[] };
  };
  const entry = appJson.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications'
  );
  assert.ok(Array.isArray(entry), 'expo-notifications is configured with props');
  return entry[1];
};

/** Decodes an 8-bit, non-interlaced RGBA PNG into its pixels. */
function readRgbaPng(file: string): { width: number; height: number; pixels: Buffer } {
  const data = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], '8-bit RGBA, not interlaced');
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const [dl, du, dul] = [left, up, upLeft].map((v) => Math.abs(estimate - v));
        predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

// Discreet mode keeps the reminder's text neutral, but Android also shows the small icon
// in the status bar and on the lock screen. expo-notifications has one icon and one
// colour for every notification (no per-notification or per-channel icon), so they are
// neutral for everyone: a plain bell, untinted, instead of the book-and-cross glyph on
// the brand red.
test('reminders and pushes use the neutral bell, not the branded book glyph', () => {
  const props = notificationsPluginProps();

  assert.equal(props.icon, './assets/notification-icon-neutral.png');
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'assets/notification-icon.png')), false);
});

test('notifications carry no brand colour', () => {
  assert.equal('color' in notificationsPluginProps(), false);
});

test('the neutral icon is a white silhouette on transparency, as status-bar icons must be', () => {
  const { width, height, pixels } = readRgbaPng(
    path.join(REPO_ROOT, 'assets/notification-icon-neutral.png')
  );
  assert.equal(width, height);
  assert.ok(width >= 96, 'large enough for xxxhdpi');

  let opaque = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    opaque += 1;
    assert.deepEqual(
      [pixels[index], pixels[index + 1], pixels[index + 2]],
      [255, 255, 255],
      'only white pixels'
    );
  }
  const coverage = opaque / (width * height);
  assert.ok(coverage > 0.1 && coverage < 0.6, `a glyph, not a blank or a square (${coverage})`);
});
