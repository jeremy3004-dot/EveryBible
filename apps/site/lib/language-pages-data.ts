/**
 * Server-side reads of the generated /languages data. A page render reads the
 * small meta file and one ~30 KB shard, never the whole atlas; parsed files
 * stay cached for the life of the server instance.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

import {
  LANGUAGE_PAGES_INDEX_FILE,
  LANGUAGE_PAGES_META_FILE,
  LANGUAGE_PAGES_MOVED_FILE,
  languageShardFile,
  type LanguageIndexEntry,
  type LanguagePage,
  type LanguagePagesMeta,
} from './language-pages';
import { isLanguageSlug, languageShard } from './language-slug';

/** Traced into the /languages/[slug] function by next.config.mjs. */
export const LANGUAGE_PAGES_DIRECTORY = 'data/language-atlas/pages';

const cache = new Map<string, Promise<unknown>>();

function readJson<T>(name: string, root: string): Promise<T> {
  const file = path.join(root, LANGUAGE_PAGES_DIRECTORY, name);
  let value = cache.get(file);
  if (!value) {
    value = readFile(file).then((bytes) =>
      JSON.parse((name.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString())
    );
    // A failed read is retried on the next request rather than cached.
    value.catch(() => cache.delete(file));
    cache.set(file, value);
  }
  return value as Promise<T>;
}

export function getLanguagePagesMeta(root = process.cwd()): Promise<LanguagePagesMeta> {
  return readJson<LanguagePagesMeta>(LANGUAGE_PAGES_META_FILE, root);
}

export async function getLanguageIndex(root = process.cwd()): Promise<LanguageIndexEntry[]> {
  return (await readJson<{ languages: LanguageIndexEntry[] }>(LANGUAGE_PAGES_INDEX_FILE, root))
    .languages;
}

export async function getLanguagePage(
  slug: string,
  root = process.cwd()
): Promise<LanguagePage | null> {
  if (!isLanguageSlug(slug)) return null;
  const { shardCount } = await getLanguagePagesMeta(root);
  const shard = await readJson<Record<string, LanguagePage>>(
    languageShardFile(languageShard(slug, shardCount)),
    root
  );
  return Object.hasOwn(shard, slug) ? shard[slug] : null;
}

/**
 * The surviving page for a language that was merged into another. Slugs end in
 * the record's code (`ruthenian-el-dc83872a`, `noakhali-noak1234`), and codes
 * are one to three hyphen-separated parts, so the tail is matched against the
 * moved codes without needing the old name.
 */
export async function getMovedLanguageSlug(
  slug: string,
  root = process.cwd()
): Promise<string | null> {
  if (!isLanguageSlug(slug)) return null;
  const moved = await readJson<Record<string, string>>(LANGUAGE_PAGES_MOVED_FILE, root);
  const parts = slug.split('-');
  for (let length = 1; length <= Math.min(3, parts.length); length++) {
    const code = parts.slice(-length).join('-');
    if (Object.hasOwn(moved, code)) return moved[code];
  }
  return null;
}
