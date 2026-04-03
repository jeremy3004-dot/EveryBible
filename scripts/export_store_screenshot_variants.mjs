/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const screenshotRoot = path.join(projectRoot, 'store-metadata', 'screenshots');
const ios67Root = path.join(screenshotRoot, 'ios', 'iphone-67-2026-04-03');
const ios65Root = path.join(screenshotRoot, 'ios', 'iphone-65-2026-04-03');
const playRoot = path.join(screenshotRoot, 'google-play');

const iosFiles = [
  '01-read-offline.png',
  '02-track-habit.png',
  '03-highlight-verses.png',
  '04-share-verse-cards.png',
  '05-save-notes.png',
  '06-grow-foundations.png',
  '07-find-wisdom.png',
];

const playMappings = [
  ['01-read-offline.png', '01-read-offline.png'],
  ['02-track-habit.png', '02-track-habit.png'],
  ['03-highlight-verses.png', '03-highlight-verses.png'],
  ['04-share-verse-cards.png', '04-share-verse-cards.png'],
  ['05-save-notes.png', '05-save-notes.png'],
  ['06-grow-foundations.png', '06-grow-foundations.png'],
  ['07-find-wisdom.png', '07-find-wisdom.png'],
];

const legacyPlayFiles = [
  '02-listen-audio.png',
  '03-track-streak.png',
  '04-highlight-notes.png',
  '05-foundation-series.png',
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exportSizedCopy(sourcePath, outputPath, width, height) {
  await sharp(sourcePath).resize(width, height).png().toFile(outputPath);
}

async function writeReadme(filePath, content) {
  await fs.writeFile(filePath, `${content.trim()}\n`);
}

async function removeFiles(root, fileNames) {
  await Promise.all(
    fileNames.map(async (fileName) => {
      try {
        await fs.unlink(path.join(root, fileName));
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          throw error;
        }
      }
    })
  );
}

async function main() {
  await ensureDir(ios65Root);
  await ensureDir(playRoot);
  await removeFiles(playRoot, legacyPlayFiles);

  for (const file of iosFiles) {
    await exportSizedCopy(path.join(ios67Root, file), path.join(ios65Root, file), 1242, 2688);
  }

  for (const [sourceFile, outputFile] of playMappings) {
    await exportSizedCopy(path.join(ios67Root, sourceFile), path.join(playRoot, outputFile), 1290, 2796);
  }

  await writeReadme(
    path.join(ios65Root, 'README.md'),
    `
# iOS 6.5-inch App Store Screenshot Pack

This folder is the 6.5-inch companion export for the EveryBible App Store submission.

## Source of Truth

These files are derived from the polished 6.7-inch master pack in:

- \`store-metadata/screenshots/ios/iphone-67-2026-04-03/\`

## Upload Order

1. \`01-read-offline.png\`
2. \`02-track-habit.png\`
3. \`03-highlight-verses.png\`
4. \`04-share-verse-cards.png\`
5. \`05-save-notes.png\`
6. \`06-grow-foundations.png\`
7. \`07-find-wisdom.png\`

## Dimensions

- Final exports: \`1242 x 2688\`
- Target display: iPhone 6.5-inch App Store screenshots
`
  );

  await writeReadme(
    path.join(playRoot, 'README.md'),
    `
# Google Play Screenshot Pack

This folder is the authoritative Google Play screenshot set for EveryBible.

## Source of Truth

These files mirror the polished iOS 6.7-inch master pack in:

- \`store-metadata/screenshots/ios/iphone-67-2026-04-03/\`

Do not upload older five-shot sets for this release. Use this seven-shot pack.

## Recommended Order

1. \`01-read-offline.png\` - Read the Bible offline
2. \`02-track-habit.png\` - Track your reading habit
3. \`03-highlight-verses.png\` - Highlight key verses fast
4. \`04-share-verse-cards.png\` - Share beautiful verse cards
5. \`05-save-notes.png\` - Save notes as you read
6. \`06-grow-foundations.png\` - Grow with Foundations
7. \`07-find-wisdom.png\` - Find wisdom for real life

## Dimensions

- Final exports: \`1290 x 2796\`
- Suitable for Play Store phone screenshot uploads
`
  );

  console.log('Exported iOS 6.5-inch and Google Play screenshot variants from the 6.7-inch master pack.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
