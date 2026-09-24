/**
 * Regenerates apps/site/data/language-atlas/pages/ from the public atlas
 * snapshot and the project summary. Run after build_public_atlas.py:
 *
 *   npm run atlas:pages:build     # write
 *   npm run atlas:pages:check     # fail if the committed files are stale
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

import type { AtlasIndex } from '../../admin/lib/language-atlas/types';
import projectSnapshot from '../data/language-atlas/projects.json';
import { buildLanguagePages, languagePageFiles } from '../lib/language-pages';

const data = new URL('../data/language-atlas/', import.meta.url);
const directory = new URL('pages/', data);
const check = process.argv.includes('--check');

const index = JSON.parse(
  gunzipSync(readFileSync(new URL('index.json.gz', data))).toString()
) as AtlasIndex;
const build = buildLanguagePages(index, projectSnapshot.projects);
const files = languagePageFiles(build);

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
    `${build.shards.length} shards; ${bytes.toLocaleString('en')} bytes; ${check ? 'verified' : 'written'}`
);
