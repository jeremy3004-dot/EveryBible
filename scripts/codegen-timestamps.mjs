#!/usr/bin/env node
/**
 * codegen-timestamps.mjs
 *
 * Packs the per-chapter timestamp files in assets/timestamps/<TRANSLATION>/ into one
 * bundled table per translation (src/data/verseTimestamps.<translation>.generated.json)
 * and rewrites the BUNDLED_TIMESTAMP_TABLES loader map in
 * src/services/bible/verseTimestamps.ts.
 *
 * Why one table per translation: Metro turns every required JSON file into its own
 * module. Requiring the 2,378 chapter files directly added 2,378 module registrations
 * to every cold start and ~0.7 MB of object-literal JS to the bundle. A table maps
 * `<BOOK>_<CHAPTER_PADDED>` to the chapter's verse start times in seconds, comma-separated
 * from verse 1, with an empty slot for a verse that has no timestamp:
 *   "ACT_008": "2.02,17.68,…,235.3,,243.78"   (verse 37 has none)
 *
 * The per-chapter JSON files stay the source of truth (scripts/batch_timestamps.py
 * writes them); they are no longer bundled themselves.
 *
 * Run after generating timestamps:
 *   npm run generate-timestamps -- --translation web
 *   npm run codegen-timestamps
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TIMESTAMPS_DIR = path.join(ROOT, 'assets', 'timestamps');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const TARGET_FILE = path.join(ROOT, 'src', 'services', 'bible', 'verseTimestamps.ts');
const CHAPTER_FILE = /^([1-3]?[A-Z]+)_(\d{3})\.json$/;

/** Packs one chapter's `{ "1": 2.2, "2": 9.22 }` into "2.2,9.22". */
export function packChapterTimestamps(chapter) {
  const slots = [];
  for (const [key, seconds] of Object.entries(chapter)) {
    const verse = Number(key);
    if (!Number.isInteger(verse) || verse < 1 || typeof seconds !== 'number') {
      throw new Error(`Unexpected timestamp entry ${JSON.stringify(key)}: ${seconds}`);
    }
    slots[verse - 1] = String(seconds);
  }
  return Array.from(slots, (slot) => slot ?? '').join(',');
}

async function collectTables() {
  const tables = new Map();
  if (!existsSync(TIMESTAMPS_DIR)) {
    return tables;
  }

  for (const translation of (await readdir(TIMESTAMPS_DIR)).sort()) {
    const translationDir = path.join(TIMESTAMPS_DIR, translation);
    let files;
    try {
      files = await readdir(translationDir);
    } catch {
      continue;
    }

    const table = {};
    for (const file of files.sort()) {
      const match = CHAPTER_FILE.exec(file);
      if (!match) continue;
      const chapter = JSON.parse(await readFile(path.join(translationDir, file), 'utf8'));
      table[`${match[1]}_${match[2]}`] = packChapterTimestamps(chapter);
    }
    if (Object.keys(table).length > 0) {
      tables.set(translation, table);
    }
  }

  return tables;
}

function tableFileName(translation) {
  return `verseTimestamps.${translation.toLowerCase()}.generated.json`;
}

function buildLoaderBlock(translations) {
  const lines = ['const BUNDLED_TIMESTAMP_TABLES: Record<string, BundledTimestampTableLoader> = {'];
  for (const translation of translations) {
    lines.push(
      `  ${translation}: () => require('../../data/${tableFileName(translation)}') as BundledTimestampTable,`
    );
  }
  lines.push('};');
  return lines.join('\n');
}

function replaceBlock(source, startMarker, newBlock) {
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Could not find ${startMarker} in ${TARGET_FILE}`);
  }
  const endIdx = source.indexOf('\n};', startIdx);
  if (endIdx === -1) {
    throw new Error(`Could not find the end of ${startMarker}`);
  }
  return source.slice(0, startIdx) + newBlock + source.slice(endIdx + 3);
}

async function run() {
  const tables = await collectTables();
  let chapters = 0;
  for (const [translation, table] of tables) {
    chapters += Object.keys(table).length;
    await writeFile(
      path.join(DATA_DIR, tableFileName(translation)),
      `${JSON.stringify(table)}\n`,
      'utf8'
    );
  }

  const source = await readFile(TARGET_FILE, 'utf8');
  const updated = replaceBlock(
    source,
    'const BUNDLED_TIMESTAMP_TABLES: Record<string, BundledTimestampTableLoader> = {',
    buildLoaderBlock([...tables.keys()])
  );
  await writeFile(TARGET_FILE, updated, 'utf8');

  console.log(
    `Packed ${chapters} chapter(s) into ${tables.size} table(s): ${[...tables.keys()].map(tableFileName).join(', ')}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
