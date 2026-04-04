import { buildBibleMediaUrl } from './bible-media';
import r2TextPackManifestData from './r2-text-pack-manifest.json';

const TRANSLATIONS_CSV_URL = 'https://ebible.org/Scriptures/translations.csv';
const R2_TEXT_PACK_CATALOG_VERSION_SUFFIX = 'r2-text-v1';

interface TranslationCsvRow {
  copyright: string;
  downloadable: boolean;
  languageCode: string;
  languageNameInEnglish: string;
  ntBooks: number;
  otBooks: number;
  redistributable: boolean;
  shortTitle: string;
  textDirection: string;
  translationId: string;
}

interface TextPackManifestItem {
  abbreviation?: string;
  downloadUrl: string;
  name: string;
  sha256: string;
  sourceTranslationId: string;
  translationId: string;
  updatedAt: string;
  verseCount: number;
  version: string;
}

interface TextPackManifestFile {
  generatedAt: string;
  items: TextPackManifestItem[];
  version: string;
}

interface FeedOverride {
  abbreviation: string;
  name: string;
  sourceTranslationId: string;
  translationId: string;
}

export interface UpstreamTranslationRecord {
  abbreviation: string;
  catalog?: {
    minimumAppVersion?: string;
    text?: {
      downloadUrl: string;
      format: 'sqlite';
      sha256: string;
      version: string;
    };
    updatedAt: string;
    version: string;
  };
  hasAudio: boolean;
  hasText: boolean;
  isAvailable: boolean;
  languageCode: string;
  languageName: string;
  licenseType: string | null;
  licenseUrl: string | null;
  name: string;
  sourceUrl: string | null;
  translationId: string;
  versions: Array<{
    changelog: string | null;
    dataChecksum: string | null;
    isCurrent: boolean;
    publishedAt: string;
    totalBooks: number;
    totalChapters: number | null;
    totalVerses: number | null;
    versionNumber: number;
  }>;
}

const FEED_OVERRIDES: FeedOverride[] = [
  {
    abbreviation: 'KJV',
    name: 'King James Version',
    sourceTranslationId: 'eng-kjv',
    translationId: 'kjv',
  },
];

const R2_TEXT_PACK_MANIFEST = r2TextPackManifestData as TextPackManifestFile;

const LANGUAGE_NAME_MAP: Record<string, string> = {
  arb: 'Arabic',
  ben: 'Bengali',
  deu: 'German',
  eng: 'English',
  fra: 'French',
  hin: 'Hindi',
  jpn: 'Japanese',
  kor: 'Korean',
  npi: 'Nepali',
  por: 'Portuguese',
  rus: 'Russian',
  spa: 'Spanish',
  urd: 'Urdu',
  vie: 'Vietnamese',
  zho: 'Chinese',
};

function parseCsv(raw: string): Record<string, string>[] {
  let input = raw;
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (character === '"') {
      if (inQuote && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (character === ',' && !inQuote) {
      row.push(field);
      field = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuote) {
      if (character === '\r' && input[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += character;
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? '').trim();
    });
    return record;
  });
}

function normalizeLanguageName(code: string, raw: string): string {
  if (LANGUAGE_NAME_MAP[code]) {
    return LANGUAGE_NAME_MAP[code];
  }

  const hasNonAscii = Array.from(raw).some((character) => character.charCodeAt(0) > 127);
  if (hasNonAscii) {
    return code || 'Unknown';
  }

  return raw || code || 'Unknown';
}

function parseTranslationsCsv(csvText: string): TranslationCsvRow[] {
  return parseCsv(csvText)
    .map((row) => ({
      copyright: row.Copyright ?? row.copyright ?? '',
      downloadable: (row.downloadable ?? '').toLowerCase() === 'true',
      languageCode: row.languageCode ?? row.Language ?? '',
      languageNameInEnglish: normalizeLanguageName(
        row.languageCode ?? '',
        row.languageNameInEnglish ?? row.LanguageName ?? ''
      ),
      ntBooks: parseInt(row.NTbooks ?? row.NT ?? '0', 10),
      otBooks: parseInt(row.OTbooks ?? row.OT ?? '0', 10),
      redistributable: (row.Redistributable ?? '').toLowerCase() === 'true',
      shortTitle: row.shortTitle ?? row.title ?? '',
      textDirection: row.textDirection ?? 'ltr',
      translationId: row.translationId ?? '',
    }))
    .filter((row) => row.translationId.length > 0);
}

function filterEligibleTranslations(rows: TranslationCsvRow[]): TranslationCsvRow[] {
  return rows.filter(
    (row) => row.otBooks === 39 && row.ntBooks === 27 && row.redistributable && row.downloadable
  );
}

function parseTextPackManifest(raw: string): Map<string, TextPackManifestItem> {
  const parsed = JSON.parse(raw) as Partial<TextPackManifestFile>;
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return new Map(
    items
      .filter(
        (item): item is TextPackManifestItem =>
          typeof item?.translationId === 'string' &&
          item.translationId.trim().length > 0 &&
          typeof item.downloadUrl === 'string' &&
          item.downloadUrl.trim().length > 0 &&
          typeof item.sha256 === 'string' &&
          item.sha256.trim().length > 0 &&
          typeof item.updatedAt === 'string' &&
          item.updatedAt.trim().length > 0 &&
          typeof item.version === 'string' &&
          item.version.trim().length > 0 &&
          typeof item.verseCount === 'number' &&
          Number.isFinite(item.verseCount) &&
          item.verseCount > 0 &&
          typeof item.sourceTranslationId === 'string' &&
          item.sourceTranslationId.trim().length > 0 &&
          typeof item.name === 'string' &&
          item.name.trim().length > 0
      )
      .map((item) => [item.translationId, item])
  );
}

async function loadTextPackManifest(): Promise<Map<string, TextPackManifestItem>> {
  return new Map(
    (Array.isArray(R2_TEXT_PACK_MANIFEST.items) ? R2_TEXT_PACK_MANIFEST.items : [])
      .filter(
        (item): item is TextPackManifestItem =>
          typeof item?.translationId === 'string' &&
          item.translationId.trim().length > 0 &&
          typeof item.downloadUrl === 'string' &&
          item.downloadUrl.trim().length > 0 &&
          typeof item.sha256 === 'string' &&
          item.sha256.trim().length > 0 &&
          typeof item.updatedAt === 'string' &&
          item.updatedAt.trim().length > 0 &&
          typeof item.version === 'string' &&
          item.version.trim().length > 0 &&
          typeof item.verseCount === 'number' &&
          Number.isFinite(item.verseCount) &&
          item.verseCount > 0 &&
          typeof item.sourceTranslationId === 'string' &&
          item.sourceTranslationId.trim().length > 0 &&
          typeof item.name === 'string' &&
          item.name.trim().length > 0
      )
      .map((item) => [item.translationId, item])
  );
}

function buildCatalogPayload(textPack: TextPackManifestItem | null) {
  if (!textPack) {
    return undefined;
  }

  return {
    text: {
      downloadUrl: buildBibleMediaUrl(textPack.downloadUrl),
      format: 'sqlite' as const,
      sha256: textPack.sha256,
      version: textPack.version,
    },
    updatedAt: textPack.updatedAt,
    version: `${textPack.version}-${R2_TEXT_PACK_CATALOG_VERSION_SUFFIX}`,
  };
}

function mapToUpstreamRecord(
  row: TranslationCsvRow,
  textPack: TextPackManifestItem | null,
  override?: FeedOverride
): UpstreamTranslationRecord {
  const title = override?.name ?? textPack?.name ?? (row.shortTitle || row.translationId);
  const translationId = override?.translationId ?? textPack?.translationId ?? row.translationId;

  return {
    abbreviation:
      override?.abbreviation ?? textPack?.abbreviation ?? row.translationId.toUpperCase(),
    catalog: buildCatalogPayload(textPack),
    hasAudio: row.languageCode === 'eng',
    hasText: true,
    isAvailable: Boolean(textPack),
    languageCode: row.languageCode || 'und',
    languageName: row.languageNameInEnglish,
    licenseType: row.copyright ? 'copyright' : 'public-domain',
    licenseUrl: `https://ebible.org/Scriptures/${row.translationId}`,
    name: title,
    sourceUrl: `https://ebible.org/Scriptures/${row.translationId}`,
    translationId,
    versions: [
      {
        changelog: null,
        dataChecksum: textPack?.sha256 ?? null,
        isCurrent: true,
        publishedAt: textPack?.updatedAt ?? new Date().toISOString(),
        totalBooks: row.otBooks + row.ntBooks,
        totalChapters: null,
        totalVerses: textPack?.verseCount ?? null,
        versionNumber: 1,
      },
    ],
  };
}

export async function fetchUpstreamTranslations(): Promise<UpstreamTranslationRecord[]> {
  const response = await fetch(TRANSLATIONS_CSV_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load eBible translation feed (${response.status})`);
  }

  const csvText = await response.text();
  const eligibleRows = filterEligibleTranslations(parseTranslationsCsv(csvText));
  const eligibleById = new Map(eligibleRows.map((row) => [row.translationId, row]));
  const textPackManifest = await loadTextPackManifest();
  const skippedSourceIds = new Set(FEED_OVERRIDES.map((override) => override.sourceTranslationId));

  const records = eligibleRows
    .filter((row) => !skippedSourceIds.has(row.translationId))
    .map((row) => mapToUpstreamRecord(row, textPackManifest.get(row.translationId) ?? null));

  for (const override of FEED_OVERRIDES) {
    const sourceRow = eligibleById.get(override.sourceTranslationId);
    if (!sourceRow) {
      continue;
    }

    records.push(
      mapToUpstreamRecord(
        sourceRow,
        textPackManifest.get(override.translationId) ?? null,
        override
      )
    );
  }

  return records;
}
