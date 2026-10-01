import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The old red store screenshots (maroon background, "READ THE BIBLE OFFLINE")
// were re-uploaded to App Store version 1.0.11 because the repo still held them
// and still named them as the sets to upload. They were deleted on 2026-09-29;
// these tests keep them, and the scripts that rebuilt them, from coming back.

const repoRoot = process.cwd();
const screenshotRoot = path.join(repoRoot, 'store-metadata', 'screenshots');

const RETIRED_PATHS = [
  'store-metadata/screenshots/final',
  'store-metadata/screenshots/google-play',
  'store-metadata/screenshots/ios/iphone-67-2026-04-03',
  'store-metadata/screenshots/ios/iphone-65-2026-04-03',
  'store-metadata/screenshots/ios/iphone-67-2026-03-31',
  'store-metadata/screenshots/ios/ipad-pro-129-2026-04-03',
  'scripts/export_store_screenshot_variants.mjs',
  'scripts/generate_ios_app_store_scaffolds.mjs',
  'scripts/generate_ios_ipad_app_store_scaffolds.mjs',
];

// Every red-set file was named after one of these headlines.
const RETIRED_NAME =
  /read[-_]offline|track[-_]habit|highlight[-_]verses|share[-_]verse[-_]cards|save[-_]notes|grow[-_]foundations|find[-_]wisdom|listen[-_]audio|track[-_]streak|highlight[-_]notes|four[-_]fields/i;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

test('the retired red screenshot sets and their generators stay deleted', () => {
  for (const retired of RETIRED_PATHS) {
    assert.equal(existsSync(path.join(repoRoot, retired)), false, `${retired} is back`);
  }
});

test('no store screenshot carries a retired red-set file name', () => {
  const offenders = listFiles(screenshotRoot)
    .map((file) => path.relative(repoRoot, file))
    .filter((file) => RETIRED_NAME.test(path.basename(file)));
  assert.deepEqual(offenders, []);
});

test('every folder AUTHORITATIVE.md tells you to upload exists with its listed files', () => {
  const guide = readFileSync(path.join(screenshotRoot, 'AUTHORITATIVE.md'), 'utf8');
  const uploadSection = guide.split('## Retired')[0] ?? '';
  const folders = [
    ...new Set(uploadSection.match(/`((?:ios\/)?[a-z0-9.-]+-\d{4}-\d{2}-\d{2})\/`/g)),
  ].map((quoted) => quoted.slice(1, -2));
  assert.deepEqual(folders.sort(), [
    'google-play-2026-09-29',
    'ios/ipad-129-2026-09-09',
    'ios/iphone-65-2026-09-29',
    'ios/iphone-69-2026-09-29',
  ]);

  const iphone = [
    '01-begin.jpg',
    '02-light-dark.jpg',
    '03-plans.jpg',
    '04-highlight.jpg',
    '05-gather.jpg',
    '06-language.jpg',
    '07-listen.jpg',
  ];
  const expected: Record<string, string[]> = {
    'ios/iphone-69-2026-09-29': iphone,
    'ios/iphone-65-2026-09-29': iphone,
    'google-play-2026-09-29': [...iphone, 'feature-graphic.png'].sort(),
    'ios/ipad-129-2026-09-09': ['01-home.png', '02-bible.png', '03-gather.png', '04-plans.png'],
  };
  for (const folder of folders) {
    assert.deepEqual(
      readdirSync(path.join(screenshotRoot, folder)).sort(),
      expected[folder],
      folder
    );
  }
});
