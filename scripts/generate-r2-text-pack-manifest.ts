import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { getBibleMediaClient, getBibleMediaEnv } from '../apps/site/lib/bible-media';
import {
  buildTextPackManifestItem,
  parseTextPackObjectKey,
  type TextPackManifestItem,
} from '../apps/site/lib/r2TextPackManifestModel';

const execFileAsync = promisify(execFile);
const TRANSLATIONS_CSV_URL = 'https://ebible.org/Scriptures/translations.csv';
const MANIFEST_PATH = path.resolve('apps/site/lib/r2-text-pack-manifest.json');
const VERSION_SUFFIX = 'v1';

type ExistingManifestFile = {
  generatedAt?: string;
  items?: TextPackManifestItem[];
  version?: string;
};

type ExistingManifestSeed = Pick<TextPackManifestItem, 'abbreviation' | 'name' | 'sourceTranslationId'>;

type TranslationCsvRow = {
  abbreviation: string;
  languageCode: string;
  ntBooks: number;
  otBooks: number;
  redistributable: boolean;
  downloadable: boolean;
  shortTitle: string;
  translationId: string;
};

type TextObjectRecord = {
  fileName: string;
  key: string;
  lastModified: string;
  translationId: string;
};

const SOURCE_OVERRIDES: Record<
  string,
  {
    abbreviation: string;
    name: string;
    sourceTranslationId: string;
  }
> = {
  kjv: {
    abbreviation: 'KJV',
    name: 'King James Version',
    sourceTranslationId: 'eng-kjv',
  },
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

function parseTranslationsCsv(csvText: string): TranslationCsvRow[] {
  return parseCsv(csvText)
    .map((row) => ({
      abbreviation: row.shortTitle ?? row.title ?? row.translationId ?? '',
      languageCode: row.languageCode ?? row.Language ?? '',
      ntBooks: parseInt(row.NTbooks ?? row.NT ?? '0', 10),
      otBooks: parseInt(row.OTbooks ?? row.OT ?? '0', 10),
      redistributable: (row.Redistributable ?? '').toLowerCase() === 'true',
      downloadable: (row.downloadable ?? '').toLowerCase() === 'true',
      shortTitle: row.shortTitle ?? row.title ?? '',
      translationId: row.translationId ?? '',
    }))
    .filter((row) => row.translationId.length > 0);
}

function filterEligibleTranslations(rows: TranslationCsvRow[]): TranslationCsvRow[] {
  return rows.filter(
    (row) => row.otBooks === 39 && row.ntBooks === 27 && row.redistributable && row.downloadable
  );
}

async function fetchTranslationCsvMap(): Promise<Map<string, TranslationCsvRow>> {
  const response = await fetch(TRANSLATIONS_CSV_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load eBible translation feed (${response.status})`);
  }

  const rows = filterEligibleTranslations(parseTranslationsCsv(await response.text()));
  return new Map(rows.map((row) => [row.translationId, row]));
}

async function loadExistingManifestSeed(): Promise<Map<string, ExistingManifestSeed>> {
  try {
    const parsed = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as ExistingManifestFile;
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return new Map(
      items.map((item) => [
        item.translationId,
        {
          abbreviation: item.abbreviation,
          name: item.name,
          sourceTranslationId: item.sourceTranslationId,
        },
      ])
    );
  } catch {
    return new Map();
  }
}

async function listLatestTextObjects(): Promise<TextObjectRecord[]> {
  const env = getBibleMediaEnv();
  const client = getBibleMediaClient(env);
  const objectsByTranslation = new Map<string, TextObjectRecord>();
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: env.bucket,
        ContinuationToken: continuationToken,
        Prefix: 'text/',
      })
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key || !object.LastModified) {
        continue;
      }

      const parsed = parseTextPackObjectKey(object.Key);
      if (!parsed) {
        continue;
      }

      const candidate: TextObjectRecord = {
        fileName: parsed.fileName,
        key: object.Key,
        lastModified: object.LastModified.toISOString(),
        translationId: parsed.translationId,
      };

      const existing = objectsByTranslation.get(parsed.translationId);
      if (!existing || existing.lastModified < candidate.lastModified) {
        objectsByTranslation.set(parsed.translationId, candidate);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return Array.from(objectsByTranslation.values()).sort((left, right) =>
    left.translationId.localeCompare(right.translationId)
  );
}

async function downloadTextObjectToTemp(objectKey: string): Promise<{ filePath: string; sha256: string }> {
  const env = getBibleMediaEnv();
  const client = getBibleMediaClient(env);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: objectKey,
    })
  );

  const body = response.Body;
  if (!body || typeof (body as NodeJS.ReadableStream).pipe !== 'function') {
    throw new Error(`Unable to stream R2 object ${objectKey}.`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'everybible-r2-text-pack-'));
  const filePath = path.join(tempDir, path.basename(objectKey));
  const hash = createHash('sha256');
  const writeStream = createWriteStream(filePath);
  const readable = body as NodeJS.ReadableStream;

  readable.on('data', (chunk) => {
    hash.update(chunk as Buffer);
  });

  await pipeline(readable, writeStream);

  return {
    filePath,
    sha256: hash.digest('hex'),
  };
}

async function queryVerseCount(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('/usr/bin/sqlite3', [filePath, 'SELECT COUNT(*) FROM verses;']);
  const verseCount = Number.parseInt(stdout.trim(), 10);

  if (!Number.isFinite(verseCount) || verseCount <= 0) {
    throw new Error(`Unable to determine verse count for ${filePath}.`);
  }

  return verseCount;
}

function resolveTextPackSeed(
  translationId: string,
  translationMap: Map<string, TranslationCsvRow>,
  existingSeedMap: Map<string, ExistingManifestSeed>
): ExistingManifestSeed {
  const override = SOURCE_OVERRIDES[translationId];
  if (override) {
    return override;
  }

  const existing = existingSeedMap.get(translationId);
  if (existing) {
    return existing;
  }

  const csvRow = translationMap.get(translationId);
  if (csvRow) {
    return {
      abbreviation: csvRow.shortTitle || translationId.toUpperCase(),
      name: csvRow.shortTitle || translationId,
      sourceTranslationId: translationId,
    };
  }

  return {
    abbreviation: translationId.toUpperCase(),
    name: translationId,
    sourceTranslationId: translationId,
  };
}

export async function generateR2TextPackManifest(outputPath = MANIFEST_PATH): Promise<{
  generatedAt: string;
  items: TextPackManifestItem[];
  outputPath: string;
  version: string;
}> {
  const translationMap = await fetchTranslationCsvMap();
  const existingSeedMap = await loadExistingManifestSeed();
  const textObjects = await listLatestTextObjects();
  const items: TextPackManifestItem[] = [];

  for (const object of textObjects) {
    const { filePath, sha256 } = await downloadTextObjectToTemp(object.key);

    try {
      const verseCount = await queryVerseCount(filePath);
      const seed = resolveTextPackSeed(object.translationId, translationMap, existingSeedMap);

      items.push(
        buildTextPackManifestItem({
          abbreviation: seed.abbreviation,
          fileName: object.fileName,
          lastModified: object.lastModified,
          name: seed.name,
          objectKey: object.key,
          sha256,
          sourceTranslationId: seed.sourceTranslationId,
          translationId: object.translationId,
          verseCount,
        })
      );
    } finally {
      await rm(path.dirname(filePath), { force: true, recursive: true });
    }
  }

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const version = `${generatedAt.slice(0, 10).replaceAll('-', '.')}-${VERSION_SUFFIX}`;
  const payload = {
    generatedAt,
    items,
    version,
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  return {
    generatedAt,
    items,
    outputPath,
    version,
  };
}

async function main(): Promise<void> {
  const result = await generateR2TextPackManifest();
  console.log(
    JSON.stringify(
      {
        generatedAt: result.generatedAt,
        itemCount: result.items.length,
        outputPath: result.outputPath,
        version: result.version,
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
