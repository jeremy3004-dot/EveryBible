const TRANSLATIONS_CSV_URL = 'https://ebible.org/Scriptures/translations.csv';

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

export interface UpstreamTranslationRecord {
  abbreviation: string;
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

function mapToUpstreamRecord(row: TranslationCsvRow): UpstreamTranslationRecord {
  const title = row.shortTitle || row.translationId;

  return {
    abbreviation: row.translationId.toUpperCase(),
    hasAudio: row.languageCode === 'eng',
    hasText: true,
    isAvailable: true,
    languageCode: row.languageCode || 'und',
    languageName: row.languageNameInEnglish,
    licenseType: row.copyright ? 'copyright' : 'public-domain',
    licenseUrl: `https://ebible.org/Scriptures/${row.translationId}`,
    name: title,
    sourceUrl: `https://ebible.org/Scriptures/${row.translationId}`,
    translationId: row.translationId,
    versions: [
      {
        changelog: null,
        dataChecksum: null,
        isCurrent: true,
        publishedAt: new Date().toISOString(),
        totalBooks: row.otBooks + row.ntBooks,
        totalChapters: null,
        totalVerses: null,
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
  return filterEligibleTranslations(parseTranslationsCsv(csvText)).map(mapToUpstreamRecord);
}
