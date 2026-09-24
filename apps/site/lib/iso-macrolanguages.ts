/**
 * ISO 639-3 macrolanguage mapping, as the language page generator reads it.
 *
 * SIL's code tables are not committed: their terms of use make
 * iso639-3.sil.org the only authorized distribution site, so
 * `npm run atlas:pages:build` downloads the table at generation time into a
 * gitignored cache and only the derived per-page facts (a macrolanguage's
 * members with pages, a member's macrolanguages) reach the committed data.
 */
import type { MacrolanguageMap } from './language-pages';

export const ISO_MACROLANGUAGES_URL =
  'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3-macrolanguages.tab';

/**
 * Parses SIL's tab-delimited `iso-639-3-macrolanguages.tab` (header
 * `M_Id  I_Id  I_Status`) into macrolanguage → active member codes. Retired
 * (`R`) members are dropped.
 */
export function parseMacrolanguageTable(text: string): MacrolanguageMap {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines[0]?.split('\t').map((column) => column.trim());
  const [macro, member, status] = ['M_Id', 'I_Id', 'I_Status'].map((name) =>
    header ? header.indexOf(name) : -1
  );
  if (macro < 0 || member < 0 || status < 0)
    throw new Error(`Unexpected ISO 639-3 macrolanguage header: ${lines[0] ?? '(empty)'}`);
  const map: Record<string, string[]> = {};
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((cell) => cell.trim());
    if (cells[status] !== 'A') continue;
    if (!/^[a-z]{3}$/.test(cells[macro]) || !/^[a-z]{3}$/.test(cells[member]))
      throw new Error(`Unexpected ISO 639-3 macrolanguage row: ${line}`);
    (map[cells[macro]] ??= []).push(cells[member]);
  }
  if (!Object.keys(map).length) throw new Error('The ISO 639-3 macrolanguage table has no rows');
  return map;
}

interface PageMembership {
  slug: string;
  iso6393: string | null;
  members: readonly { slug: string }[];
}

/**
 * Recovers, from already generated pages, the part of the mapping those pages
 * use: each macrolanguage page's code → its member pages' codes. Rebuilding
 * with it reproduces the same pages, so the generator can check or rebuild
 * offline; languages that joined the atlas since need the SIL table.
 */
export function macrolanguageMapFromPages(
  pages: Readonly<Record<string, PageMembership>>
): MacrolanguageMap {
  const map: Record<string, string[]> = {};
  for (const page of Object.values(pages)) {
    if (!page.iso6393 || !page.members.length) continue;
    const codes = new Set(map[page.iso6393]);
    for (const member of page.members) {
      const code = pages[member.slug]?.iso6393;
      if (!code) throw new Error(`Member ${member.slug} of ${page.slug} has no ISO 639-3 code`);
      codes.add(code);
    }
    map[page.iso6393] = [...codes].sort();
  }
  return map;
}
