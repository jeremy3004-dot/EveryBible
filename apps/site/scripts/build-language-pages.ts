/**
 * Regenerates apps/site/data/language-atlas/pages/ from the public atlas
 * snapshot, the project summary and SIL's ISO 639-3 macrolanguage mapping.
 * Run after build_public_atlas.py:
 *
 *   npm run atlas:pages:build                 # write
 *   npm run atlas:pages:check                 # fail if the committed files are stale
 *   npm run atlas:pages:build -- --refresh    # re-download the SIL table first
 *
 * The SIL table is never committed (iso639-3.sil.org is its only authorized
 * distribution site). It is downloaded into the gitignored .cache/ at the repo
 * root; without it and without network, the mapping the committed pages
 * already use is recovered from them, so offline runs still work. The site
 * build reads only the committed pages and never contacts SIL.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { AtlasIndex } from '../../admin/lib/language-atlas/types';
import projectSnapshot from '../data/language-atlas/projects.json';
import {
  ISO_MACROLANGUAGES_URL,
  macrolanguageMapFromPages,
  parseMacrolanguageTable,
} from '../lib/iso-macrolanguages';
import {
  buildLanguagePages,
  LANGUAGE_PAGE_SHARD_COUNT,
  languagePageFiles,
  type LanguagePage,
  type MacrolanguageMap,
} from '../lib/language-pages';

const data = new URL('../data/language-atlas/', import.meta.url);
const directory = new URL('pages/', data);
const cache = new URL('../../../.cache/language-atlas/', import.meta.url);
const cachedTable = new URL('iso-639-3-macrolanguages.tab', cache);
const check = process.argv.includes('--check');
const refresh = process.argv.includes('--refresh');

function encode(name: string, value: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(value));
  return name.endsWith('.gz') ? gzipSync(json, { level: 9 }) : json;
}

function decode(name: string, bytes: Buffer): unknown {
  return JSON.parse((name.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
}

const existing = (() => {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
})();

async function downloadTable(): Promise<string> {
  const response = await fetch(ISO_MACROLANGUAGES_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  parseMacrolanguageTable(text);
  mkdirSync(cache, { recursive: true });
  writeFileSync(cachedTable, text);
  return text;
}

async function macrolanguages(): Promise<{ map: MacrolanguageMap; source: string }> {
  if (!refresh && existsSync(cachedTable))
    return {
      map: parseMacrolanguageTable(readFileSync(cachedTable, 'utf8')),
      source: 'cached SIL table',
    };
  try {
    return {
      map: parseMacrolanguageTable(await downloadTable()),
      source: 'SIL table (downloaded)',
    };
  } catch (error) {
    if (refresh) throw error;
    console.warn(
      `Could not download ${ISO_MACROLANGUAGES_URL} (${(error as Error).message}); ` +
        'reusing the macrolanguage membership in the committed pages. Languages new to the ' +
        'atlas are not linked to their macrolanguage until the table can be downloaded.'
    );
    const pages: Record<string, LanguagePage> = Object.assign(
      {},
      ...existing
        .filter((name) => name.startsWith('shard-'))
        .map((name) => decode(name, readFileSync(new URL(name, directory))))
    );
    return { map: macrolanguageMapFromPages(pages), source: 'committed pages (offline)' };
  }
}

const index = JSON.parse(
  gunzipSync(readFileSync(new URL('index.json.gz', data))).toString()
) as AtlasIndex;
const mapping = await macrolanguages();
const build = buildLanguagePages(
  index,
  projectSnapshot.projects,
  LANGUAGE_PAGE_SHARD_COUNT,
  mapping.map
);
const files = languagePageFiles(build);

if (check) {
  const stale = [
    ...existing.filter((name) => !(name in files)),
    ...Object.entries(files)
      .filter(([name, value]) => {
        if (!existing.includes(name)) return true;
        return (
          JSON.stringify(decode(name, readFileSync(new URL(name, directory)))) !==
          JSON.stringify(value)
        );
      })
      .map(([name]) => name),
  ];
  if (stale.length) {
    console.error(`Language pages are stale (${stale.join(', ')}); run npm run atlas:pages:build`);
    process.exit(1);
  }
} else {
  mkdirSync(directory, { recursive: true });
  for (const name of existing) if (!(name in files)) rmSync(new URL(name, directory));
  for (const [name, value] of Object.entries(files))
    writeFileSync(new URL(name, directory), encode(name, value));
}

const bytes = Object.entries(files).reduce(
  (total, [name, value]) => total + encode(name, value).byteLength,
  0
);
console.log(
  `Language pages: ${build.meta.languageCount.toLocaleString('en')} languages in ` +
    `${build.shards.length} shards; ${bytes.toLocaleString('en')} bytes; ` +
    `macrolanguages from ${mapping.source}; ${check ? 'verified' : 'written'}`
);
