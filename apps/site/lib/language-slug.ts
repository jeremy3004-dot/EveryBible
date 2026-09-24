/**
 * URL slugs for /languages/<slug>. Kept dependency-free: the atlas client
 * imports it to link a selected record to its page.
 *
 * A slug is the readable name plus a code taken from the record id, so it is
 * unique without a lookup table and stays stable while the id and name do
 * (e.g. `yoruba-yor`, `gane-gane1238`, `o-ung-el-15876f53`).
 */

const MAX_NAME_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LANGUAGES_PATH = '/languages';

/** Apostrophes and click letters (!, ǃ) sit inside words, so they are dropped rather than split. */
export function slugifyLanguageName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`ʼ!ǀǁǂǃ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, '');
}

/** ISO and Glottolog ids are already short codes; Every Language UUIDs keep 8 hex digits. */
export function languageCode({ id }: { id: string }): string {
  const separator = id.indexOf(':');
  const prefix = separator === -1 ? '' : id.slice(0, separator);
  const value = id.slice(separator + 1);
  if (prefix === 'iso' || prefix === 'glottolog') return slugifyLanguageName(value);
  if (prefix === 'el') return `el-${value.replace(/-/g, '').slice(0, 8).toLowerCase()}`;
  return slugifyLanguageName(id);
}

export function languageSlug(record: { id: string; name: string }): string {
  const name = slugifyLanguageName(record.name);
  const code = languageCode(record);
  return name ? `${name}-${code}` : code;
}

/**
 * Every Language's project tracker contains test and retired entries ("Test 6a",
 * "Mangala {Delete}"). They carry no registry code and come from that source
 * alone, so a name pattern cannot hide a real, registry-backed language.
 */
const PLACEHOLDER_NAME =
  /^tests?y?(?:\b|\d)|\{delete\}|\(retired\)$|^mistakes$|^needs verification$|^pray \d+$/i;

export function hasLanguagePage(record: {
  name: string;
  sourceIds: readonly string[];
  iso6393: string | null;
  glottocode: string | null;
  rolvCode: string | null;
}): boolean {
  const trackerOnly =
    record.sourceIds.every((id) => id === 'everylanguage') &&
    !record.iso6393 &&
    !record.glottocode &&
    !record.rolvCode;
  return !(trackerOnly && PLACEHOLDER_NAME.test(record.name.trim()));
}

export function isLanguageSlug(value: string): boolean {
  return value.length > 0 && value.length <= 120 && SLUG_PATTERN.test(value);
}

export function languagePagePath(slug: string): `/languages/${string}` {
  return `${LANGUAGES_PATH}/${slug}`;
}

/** FNV-1a over the slug, which is ASCII by construction. */
export function languageShard(slug: string, shardCount: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < slug.length; index++) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % shardCount;
}
