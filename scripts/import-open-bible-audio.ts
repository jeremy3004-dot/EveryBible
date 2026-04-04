import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';

import { newTestamentBooks } from '../src/constants/books';
import {
  normalizeOpenBibleAudioEntryName,
  normalizeOpenBibleTimingEntryName,
  parseOpenBibleArtifactManifest,
  parseOpenBibleTimingText,
} from '../src/services/bible/openBibleAudioImportModel';

type ScriptArgs = {
  sourceUrl: string;
  translationId: string;
  stagingRoot: string;
  clean: boolean;
  jobs: number;
};

type CatalogPayload = {
  version: string;
  updatedAt: string;
    audio: {
      strategy: 'stream-template';
      coverage: 'new-testament';
      baseUrl: string;
      chapterPathTemplate: string;
      fileExtension: 'mp3';
      mimeType: 'audio/mpeg';
  };
  timing: {
    strategy: 'stream-template';
    baseUrl: string;
    chapterPathTemplate: string;
    fileExtension: 'json';
    mimeType: 'application/json';
  };
};

type ImportSummary = {
  translationId: string;
  sourceUrl: string;
  apiBaseUrl: string;
  generatedAt: string;
  audioFiles: number;
  timingFiles: number;
  audioBooks: Record<string, number>;
  timingBooks: Record<string, number>;
  catalog: CatalogPayload;
};

const DEFAULT_SOURCE_URL = 'https://open.bible/bibles/nepali-davar-audio-nt/';
const DEFAULT_TRANSLATION_ID = 'npiulb';
const NT_BOOK_IDS = new Set(newTestamentBooks.map((book) => book.id));
const EXPECTED_NT_CHAPTERS = new Map(newTestamentBooks.map((book) => [book.id, book.chapters]));

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  let sourceUrl = DEFAULT_SOURCE_URL;
  let translationId = DEFAULT_TRANSLATION_ID;
  let stagingRoot = path.resolve('tmp', 'open-bible-import', DEFAULT_TRANSLATION_ID);
  let clean = false;
  let jobs = 3;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--source-url' && args[index + 1]) {
      sourceUrl = args[index + 1]!;
      index += 1;
      continue;
    }

    if (arg === '--translation' && args[index + 1]) {
      translationId = args[index + 1]!.toLowerCase();
      stagingRoot = path.resolve('tmp', 'open-bible-import', translationId);
      index += 1;
      continue;
    }

    if (arg === '--staging-root' && args[index + 1]) {
      stagingRoot = path.resolve(args[index + 1]!);
      index += 1;
      continue;
    }

    if (arg === '--clean') {
      clean = true;
      continue;
    }

    if (arg === '--jobs' && args[index + 1]) {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed >= 1) {
        jobs = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
  }

  return {
    sourceUrl,
    translationId,
    stagingRoot,
    clean,
    jobs,
  };
}

function requireSupabaseUrl(): string {
  const value =
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    '';

  if (!value) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL for catalog generation.');
  }

  return value.replace(/\/+$/, '');
}

async function loadLocalEnvFile(): Promise<void> {
  const envPath = path.resolve('.env');

  try {
    const raw = await readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing .env files so explicit shell env still works.
  }
}

function buildCatalogPayload(translationId: string, generatedAt: string): CatalogPayload {
  const supabaseUrl = requireSupabaseUrl();
  const versionStamp = generatedAt.slice(0, 10).replaceAll('-', '.');

  return {
    version: `${versionStamp}-open-bible-nt-media-v1`,
    updatedAt: generatedAt,
    audio: {
      strategy: 'stream-template',
      coverage: 'new-testament',
      baseUrl: `${supabaseUrl}/storage/v1/object/public/bible-audio/${translationId}`,
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
      fileExtension: 'mp3',
      mimeType: 'audio/mpeg',
    },
    timing: {
      strategy: 'stream-template',
      baseUrl: `${supabaseUrl}/storage/v1/object/public/verse-timestamps/${translationId}`,
      chapterPathTemplate: '{bookId}/{chapter}.json',
      fileExtension: 'json',
      mimeType: 'application/json',
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

async function ensureCleanDirectory(root: string, clean: boolean): Promise<void> {
  if (clean) {
    await rm(root, { recursive: true, force: true });
  }

  await mkdir(root, { recursive: true });
}

function artifactUrl(apiBaseUrl: string, artifactId: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/artifactContent/${artifactId}`;
}

async function writeAudioEntry(
  audioRoot: string,
  fileName: string,
  data: Buffer,
  audioCounts: Map<string, number>
): Promise<boolean> {
  const entry = normalizeOpenBibleAudioEntryName(path.basename(fileName));
  if (!entry || !NT_BOOK_IDS.has(entry.bookId)) {
    return false;
  }

  const targetDir = path.join(audioRoot, entry.bookId);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, `${entry.chapter}.mp3`), data);
  audioCounts.set(entry.bookId, (audioCounts.get(entry.bookId) ?? 0) + 1);
  return true;
}

async function writeTimingEntry(
  timingRoot: string,
  fileName: string,
  raw: string,
  timingCounts: Map<string, number>
): Promise<boolean> {
  const entry = normalizeOpenBibleTimingEntryName(path.basename(fileName));
  if (!entry || !NT_BOOK_IDS.has(entry.bookId)) {
    return false;
  }

  const payload = parseOpenBibleTimingText(raw);
  if (Object.keys(payload).length === 0) {
    throw new Error(`Timing file ${fileName} did not contain any verse rows.`);
  }

  const targetDir = path.join(timingRoot, entry.bookId);
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, `${entry.chapter}.json`), `${JSON.stringify(payload)}\n`);
  timingCounts.set(entry.bookId, (timingCounts.get(entry.bookId) ?? 0) + 1);
  return true;
}

function assertExpectedCounts(
  label: string,
  counts: Map<string, number>
): void {
  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const [bookId, expectedChapters] of EXPECTED_NT_CHAPTERS) {
    const actual = counts.get(bookId) ?? 0;
    if (actual === 0) {
      missing.push(bookId);
      continue;
    }

    if (actual !== expectedChapters) {
      mismatched.push(`${bookId} expected ${expectedChapters} got ${actual}`);
    }
  }

  if (missing.length > 0 || mismatched.length > 0) {
    throw new Error(
      `${label} import validation failed. Missing: ${missing.join(', ') || 'none'}. ` +
        `Mismatched: ${mismatched.join(', ') || 'none'}.`
    );
  }
}

function sortedRecord(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right))
  );
}

async function countExistingChapterFiles(
  root: string,
  bookId: string,
  extension: '.mp3' | '.json'
): Promise<number> {
  try {
    const entries = await readdir(path.join(root, bookId), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).length;
  } catch {
    return 0;
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  jobs: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const concurrency = Math.max(1, Math.min(jobs, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const currentIndex = cursor;
        cursor += 1;
        await worker(items[currentIndex]!, currentIndex);
      }
    })
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const generatedAt = new Date().toISOString();
  const audioRoot = path.join(args.stagingRoot, 'audio');
  const timingRoot = path.join(args.stagingRoot, 'timing');

  await loadLocalEnvFile();
  await ensureCleanDirectory(args.stagingRoot, args.clean);
  await mkdir(audioRoot, { recursive: true });
  await mkdir(timingRoot, { recursive: true });

  console.log(`Fetching Open.Bible manifest from ${args.sourceUrl}`);
  const html = await fetchText(args.sourceUrl);
  const manifest = parseOpenBibleArtifactManifest(html);

  const audioArtifacts = manifest.artifacts
    .filter((artifact) => artifact.bookCode && NT_BOOK_IDS.has(artifact.bookCode))
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
  const timingArtifact = manifest.artifacts.find((artifact) => {
    const normalizedFileName = artifact.fileName.toLowerCase();
    return (
      artifact.bookCode === null &&
      (normalizedFileName.includes('timing') || normalizedFileName.endsWith('.zip'))
    );
  });

  if (audioArtifacts.length !== newTestamentBooks.length) {
    throw new Error(
      `Expected ${newTestamentBooks.length} NT audio artifacts but found ${audioArtifacts.length}.`
    );
  }

  if (!timingArtifact) {
    throw new Error('Open.Bible timing artifact was not present in the manifest.');
  }

  const audioCounts = new Map<string, number>();
  const timingCounts = new Map<string, number>();

  await runWithConcurrency(audioArtifacts, args.jobs, async (artifact, index) => {
    const bookId = artifact.bookCode;
    if (!bookId) {
      return;
    }

    const existingCount = await countExistingChapterFiles(audioRoot, bookId, '.mp3');
    if (existingCount === (EXPECTED_NT_CHAPTERS.get(bookId) ?? 0)) {
      audioCounts.set(bookId, existingCount);
      console.log(`[${index + 1}/${audioArtifacts.length}] Reusing existing ${bookId} audio`);
      return;
    }

    const url = artifactUrl(manifest.apiBaseUrl, artifact.id);
    const label = bookId;
    console.log(`[${index + 1}/${audioArtifacts.length}] Downloading ${label} audio from ${url}`);
    const zipBuffer = await fetchBuffer(url);
    const zip = new AdmZip(zipBuffer);

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) {
        continue;
      }

      await writeAudioEntry(audioRoot, entry.entryName, entry.getData(), audioCounts);
    }

    console.log(`[${index + 1}/${audioArtifacts.length}] Finished ${label}`);
  });

  const timingUrl = artifactUrl(manifest.apiBaseUrl, timingArtifact.id);
  let reuseAllTiming = true;
  for (const [bookId, chapters] of EXPECTED_NT_CHAPTERS) {
    const existingCount = await countExistingChapterFiles(timingRoot, bookId, '.json');
    if (existingCount === chapters) {
      timingCounts.set(bookId, existingCount);
      continue;
    }

    reuseAllTiming = false;
    break;
  }

  if (reuseAllTiming) {
    console.log('Reusing existing timing JSON files');
  } else {
    console.log(`Downloading timing archive from ${timingUrl}`);
    const timingZipBuffer = await fetchBuffer(timingUrl);
    const timingZip = new AdmZip(timingZipBuffer);

    for (const entry of timingZip.getEntries()) {
      if (entry.isDirectory) {
        continue;
      }

      await writeTimingEntry(
        timingRoot,
        entry.entryName,
        entry.getData().toString('utf8'),
        timingCounts
      );
    }
  }

  assertExpectedCounts('Audio', audioCounts);
  assertExpectedCounts('Timing', timingCounts);

  const catalog = buildCatalogPayload(args.translationId, generatedAt);
  const summary: ImportSummary = {
    translationId: args.translationId,
    sourceUrl: args.sourceUrl,
    apiBaseUrl: manifest.apiBaseUrl,
    generatedAt,
    audioFiles: Array.from(audioCounts.values()).reduce((sum, count) => sum + count, 0),
    timingFiles: Array.from(timingCounts.values()).reduce((sum, count) => sum + count, 0),
    audioBooks: sortedRecord(audioCounts),
    timingBooks: sortedRecord(timingCounts),
    catalog,
  };

  await writeFile(
    path.join(args.stagingRoot, 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`
  );
  await writeFile(
    path.join(args.stagingRoot, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );

  console.log(
    JSON.stringify(
      {
        stagingRoot: args.stagingRoot,
        audioRoot,
        timingRoot,
        catalogFile: path.join(args.stagingRoot, 'catalog.json'),
        summaryFile: path.join(args.stagingRoot, 'summary.json'),
        audioFiles: summary.audioFiles,
        timingFiles: summary.timingFiles,
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
