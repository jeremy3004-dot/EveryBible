/**
 * Import eBible.org VPL translations into the Supabase bible_verses table.
 *
 * Usage:
 *   npx tsx scripts/import-ebible-translations.ts --translations engwebp,spaRV1909
 *   npx tsx scripts/import-ebible-translations.ts --languages eng,spa,hin,npi
 *   npx tsx scripts/import-ebible-translations.ts --all
 *   npx tsx scripts/import-ebible-translations.ts --dry-run --languages eng
 *
 * Required env vars:
 *   SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service_role key bypasses RLS — needed for inserts)
 *
 * The script is idempotent: it uses upsert on (translation_id, book_id, chapter, verse)
 * and is safe to re-run. Each run processes translations one at a time and logs progress.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import https from 'node:https';
import http from 'node:http';

import { EBIBLE_BOOK_MAP } from './ebible-book-map.js';

// Use any-typed Supabase client because this script runs outside the app's
// generated database types context (no supabase/types.ts available here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranslationCsvRow {
  translationId: string;
  shortTitle: string;
  languageCode: string;
  languageNameInEnglish: string;
  otBooks: number;
  ntBooks: number;
  redistributable: boolean;
  downloadable: boolean;
  textDirection: string;
  copyright: string;
}

interface VerseRow {
  translation_id: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
  heading: string | null;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  translationIds: string[] | null;
  languageCodes: string[] | null;
  all: boolean;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let translationIds: string[] | null = null;
  let languageCodes: string[] | null = null;
  let all = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--translations' && args[i + 1]) {
      translationIds = args[++i].split(',').map((s) => s.trim());
    } else if (args[i] === '--languages' && args[i + 1]) {
      languageCodes = args[++i].split(',').map((s) => s.trim());
    } else if (args[i] === '--all') {
      all = true;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!translationIds && !languageCodes && !all) {
    console.error('Error: Provide --translations <ids>, --languages <codes>, or --all');
    console.error('Add --dry-run to list translations without importing.');
    process.exit(1);
  }

  return { translationIds, languageCodes, all, dryRun };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, (response) => {
      // Follow redirects
      if (
        (response.statusCode === 301 || response.statusCode === 302) &&
        response.headers.location
      ) {
        fetchUrl(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(60000, () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

// ---------------------------------------------------------------------------
// CSV parsing (eBible.org translations.csv)
// ---------------------------------------------------------------------------

const TRANSLATIONS_CSV_URL = 'https://ebible.org/Scriptures/translations.csv';

/**
 * Single-pass RFC-4180 CSV parser. Handles quoted fields with embedded
 * commas, newlines, and escaped quotes. Strips UTF-8 BOM if present.
 */
function parseCsv(raw: string): Record<string, string>[] {
  // Strip BOM
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQuote && raw[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] ?? '').trim();
    });
    return obj;
  });
}

function parseTranslationsCsv(csvText: string): TranslationCsvRow[] {
  const rows = parseCsv(csvText);
  return rows
    .map((row) => ({
      translationId: row['translationId'] ?? '',
      shortTitle: row['shortTitle'] ?? row['title'] ?? '',
      languageCode: row['languageCode'] ?? row['Language'] ?? '',
      languageNameInEnglish: row['languageNameInEnglish'] ?? row['LanguageName'] ?? '',
      otBooks: parseInt(row['OTbooks'] ?? row['OT'] ?? '0', 10),
      ntBooks: parseInt(row['NTbooks'] ?? row['NT'] ?? '0', 10),
      redistributable: (row['Redistributable'] ?? '').toLowerCase() === 'true',
      downloadable: (row['downloadable'] ?? '').toLowerCase() === 'true',
      textDirection: row['textDirection'] ?? 'ltr',
      copyright: row['Copyright'] ?? row['copyright'] ?? '',
    }))
    .filter((r) => r.translationId !== '');
}

function filterFullBibles(rows: TranslationCsvRow[]): TranslationCsvRow[] {
  return rows.filter(
    (r) => r.otBooks === 39 && r.ntBooks === 27 && r.redistributable && r.downloadable,
  );
}

// ---------------------------------------------------------------------------
// VPL XML parsing
// ---------------------------------------------------------------------------

/**
 * Parse eBible.org VPL XML format.
 * Each verse element: <v b="GEN" c="1" v="1">verse text here</v>
 * Heading elements (optional): <h>Heading Text</h> before verses in a section.
 *
 * Returns an array of VerseRow objects (book IDs not in EBIBLE_BOOK_MAP are skipped).
 */
function parseVplXml(xml: string, translationId: string): VerseRow[] {
  const verses: VerseRow[] = [];
  let lastHeading: string | null = null;

  // Match heading tags: <h>...</h>
  const headingPattern = /<h>([^<]*)<\/h>/g;

  // Match verse tags: <v b="..." c="..." v="...">...</v>
  // Using a pattern that handles multi-line text (though VPL is typically one verse per line)
  const versePattern = /<v\s+b="([^"]+)"\s+c="([^"]+)"\s+v="([^"]+)"[^>]*>([\s\S]*?)<\/v>/g;

  // We need to process in document order to associate headings with verses.
  // Walk through combined matches by position.
  const allMatches: Array<{ index: number; type: 'heading' | 'verse'; match: RegExpExecArray }> =
    [];

  let m: RegExpExecArray | null;
  const xmlForScan = xml;

  const headingRe = /<h>([^<]*)<\/h>/g;
  while ((m = headingRe.exec(xmlForScan)) !== null) {
    allMatches.push({ index: m.index, type: 'heading', match: m });
  }

  const verseRe = /<v\s+b="([^"]+)"\s+c="([^"]+)"\s+v="([^"]+)"[^>]*>([\s\S]*?)<\/v>/g;
  while ((m = verseRe.exec(xmlForScan)) !== null) {
    allMatches.push({ index: m.index, type: 'verse', match: m });
  }

  allMatches.sort((a, b) => a.index - b.index);

  for (const item of allMatches) {
    if (item.type === 'heading') {
      lastHeading = item.match[1].trim() || null;
    } else {
      const bookCode = item.match[1].trim();
      const appBookId = EBIBLE_BOOK_MAP[bookCode];
      if (!appBookId) {
        // Deuterocanonical or unknown book — skip silently
        continue;
      }
      const chapter = parseInt(item.match[2], 10);
      const verse = parseInt(item.match[3], 10);
      // Strip any nested XML tags from verse text (some editions include <nd>, <wj>, etc.)
      const text = item.match[4].replace(/<[^>]+>/g, '').trim();

      verses.push({
        translation_id: translationId,
        book_id: appBookId,
        chapter,
        verse,
        text,
        heading: lastHeading,
      });
      // Heading applies only to the first verse in the section; reset after use
      lastHeading = null;
    }
  }

  return verses;
}

// ---------------------------------------------------------------------------
// Supabase upsert helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

async function upsertCatalogRow(
  supabase: AnySupabaseClient,
  translation: TranslationCsvRow,
): Promise<void> {
  const abbreviation = translation.shortTitle.split(/\s+/)[0] ?? translation.translationId;
  const { error } = await supabase.from('translation_catalog').upsert(
    {
      translation_id: translation.translationId,
      name: translation.shortTitle,
      abbreviation,
      language_code: translation.languageCode,
      language_name: translation.languageNameInEnglish,
      license_type: translation.copyright
        ? translation.copyright.toLowerCase().includes('public domain')
          ? 'public-domain'
          : 'restricted'
        : null,
      source_url: `https://ebible.org/Scriptures/${translation.translationId}`,
      has_text: true,
      has_audio: false,
      is_bundled: false,
      is_available: true,
      text_direction: translation.textDirection || 'ltr',
    },
    { onConflict: 'translation_id' },
  );
  if (error) throw new Error(`catalog upsert failed for ${translation.translationId}: ${error.message}`);
}

async function upsertVersesBatch(
  supabase: AnySupabaseClient,
  batch: VerseRow[],
  translationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('bible_verses')
    .upsert(batch, { onConflict: 'translation_id,book_id,chapter,verse' });
  if (error) throw new Error(`verses upsert failed for ${translationId}: ${error.message}`);
}

async function upsertVersionRow(
  supabase: AnySupabaseClient,
  translationId: string,
  totalVerses: number,
): Promise<void> {
  const { error } = await supabase.from('translation_versions').upsert(
    {
      translation_id: translationId,
      version_number: 1,
      is_current: true,
      total_verses: totalVerses,
    },
    { onConflict: 'translation_id,version_number' },
  );
  if (error) throw new Error(`versions upsert failed for ${translationId}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Per-translation import
// ---------------------------------------------------------------------------

async function importTranslation(
  supabase: AnySupabaseClient,
  translation: TranslationCsvRow,
): Promise<void> {
  const { translationId } = translation;
  console.log(
    `[import] Importing ${translationId} (${translation.languageNameInEnglish} — ${translation.shortTitle})...`,
  );

  // 1. Upsert catalog row
  await upsertCatalogRow(supabase, translation);

  // 2. Download VPL zip
  const zipUrl = `https://ebible.org/Scriptures/${translationId}_vpl.zip`;
  let zipBuffer: Buffer;
  try {
    zipBuffer = await fetchUrl(zipUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[import] WARNING: Could not download ${zipUrl} — ${msg}. Skipping.`);
    return;
  }

  // 3. Extract VPL XML (or txt fallback)
  let vplContent: string;
  try {
    const zip = new AdmZip(zipBuffer);
    const xmlEntry = zip.getEntry(`${translationId}_vpl.xml`);
    const txtEntry = zip.getEntry(`${translationId}_vpl.txt`);
    const entry = xmlEntry ?? txtEntry;
    if (!entry) {
      // List entries for debugging
      const entryNames = zip.getEntries().map((e) => e.entryName);
      console.warn(
        `[import] WARNING: No VPL XML/TXT found in zip for ${translationId}. Entries: ${entryNames.join(', ')}. Skipping.`,
      );
      return;
    }
    vplContent = entry.getData().toString('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[import] WARNING: Failed to extract zip for ${translationId} — ${msg}. Skipping.`);
    return;
  }

  // 4. Parse VPL XML into verse rows
  const verseRows = parseVplXml(vplContent, translationId);
  if (verseRows.length === 0) {
    console.warn(`[import] WARNING: No verses parsed for ${translationId}. Skipping upsert.`);
    return;
  }

  // 5. Bulk upsert in batches of BATCH_SIZE
  let inserted = 0;
  for (let i = 0; i < verseRows.length; i += BATCH_SIZE) {
    const batch = verseRows.slice(i, i + BATCH_SIZE);
    await upsertVersesBatch(supabase, batch, translationId);
    inserted += batch.length;
    process.stdout.write(`\r[import]   ${inserted}/${verseRows.length} verses upserted...`);
  }
  process.stdout.write('\n');

  // 6. Upsert translation_versions row
  await upsertVersionRow(supabase, translationId, verseRows.length);

  console.log(`[import] ${translationId}: ${verseRows.length} verses imported successfully.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { translationIds, languageCodes, all, dryRun } = parseArgs();

  // Resolve Supabase credentials
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!dryRun) {
    if (!supabaseUrl) {
      console.error('Error: Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
      process.exit(1);
    }
    if (!serviceRoleKey) {
      console.error('Error: Set SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
  }

  // Fetch and parse translations.csv
  console.log('[import] Fetching translations catalog from eBible.org...');
  let csvBuffer: Buffer;
  try {
    csvBuffer = await fetchUrl(TRANSLATIONS_CSV_URL);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[import] Failed to fetch translations.csv: ${msg}`);
    process.exit(1);
  }
  const csvText = csvBuffer.toString('utf8');
  const allTranslations = parseTranslationsCsv(csvText);
  const fullBibles = filterFullBibles(allTranslations);

  console.log(
    `[import] Found ${fullBibles.length} redistributable full Bibles (OT=39, NT=27) out of ${allTranslations.length} total.`,
  );

  // Filter to requested translations
  let selected: TranslationCsvRow[];
  if (all) {
    selected = fullBibles;
  } else if (translationIds) {
    const idSet = new Set(translationIds);
    selected = fullBibles.filter((t) => idSet.has(t.translationId));
    const found = new Set(selected.map((t) => t.translationId));
    const missing = translationIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      console.warn(
        `[import] WARNING: These translation IDs were not found in filtered catalog: ${missing.join(', ')}`,
      );
    }
  } else if (languageCodes) {
    const codeSet = new Set(languageCodes);
    selected = fullBibles.filter((t) => codeSet.has(t.languageCode));
  } else {
    selected = [];
  }

  if (selected.length === 0) {
    console.log('[import] No matching translations found. Nothing to import.');
    process.exit(0);
  }

  // Dry-run: list and exit
  if (dryRun) {
    console.log(`\n[dry-run] Would import ${selected.length} translation(s):\n`);
    for (const t of selected) {
      console.log(
        `  ${t.translationId.padEnd(20)} ${t.languageCode.padEnd(8)} ${t.languageNameInEnglish.padEnd(30)} ${t.shortTitle}`,
      );
    }
    console.log('\n[dry-run] No data was downloaded or inserted.');
    process.exit(0);
  }

  // Full import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any, any, any>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let successCount = 0;
  let failCount = 0;

  for (const translation of selected) {
    try {
      await importTranslation(supabase, translation);
      successCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[import] ERROR: Failed to import ${translation.translationId}: ${msg}`);
      failCount++;
    }
  }

  console.log(
    `\n[import] Complete. ${successCount} succeeded, ${failCount} failed out of ${selected.length} translations.`,
  );
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[import] Unhandled error:', err);
  process.exit(1);
});
