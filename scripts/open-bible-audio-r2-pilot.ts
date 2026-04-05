import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';

import { bibleBooks } from '../src/constants/books';
import {
  normalizeOpenBibleAudioEntryName,
  parseOpenBibleTimingText,
  normalizeOpenBibleTimingEntryName,
} from '../src/services/bible/openBibleAudioImportModel';
import {
  buildOpenBiblePilotAudioManifest,
  buildOpenBiblePilotAudioChapterPath,
  buildOpenBiblePilotCatalog,
  buildOpenBiblePilotCatalogRow,
  buildOpenBiblePilotTimingChapterPath,
  shouldPublishOpenBiblePilotTiming,
  type OpenBiblePilotManifestBook,
  type OpenBiblePilotRegistry,
  type OpenBiblePilotRegistryTranslation,
  type OpenBiblePilotTextCatalogSeed,
} from '../src/services/bible/openBiblePilotModel';

type OpenBibleManifestArtifact = {
  fileName: string;
  id: string;
};

type OpenBibleManifestRow = {
  audio_artifacts: OpenBibleManifestArtifact[];
  dir_name: string;
  ext_id: string;
  title: string;
  timing_artifacts: OpenBibleManifestArtifact[];
};

type TextPackManifestItem = {
  downloadUrl: string;
  sha256: string;
  translationId: string;
  version: string;
};

type ParsedArgs = {
  chapterSampleLimit: number | null;
  clean: boolean;
  dryRun: boolean;
  openBibleRoot: string | null;
  prepareStage: boolean;
  publish: boolean;
  skipRegistryUpdate: boolean;
  useStaged: boolean;
  registryPath: string;
  repoRoot: string;
  stageRoot: string;
  textManifestPath: string;
  translationIds: string[] | null;
  upsertCatalog: boolean;
  version: string | null;
};

type MutableBookSummary = {
  chapters: Map<number, number>;
  timingChapters: Set<number>;
  totalBytes: number;
};

type TranslationStageSummary = {
  catalog: ReturnType<typeof buildOpenBiblePilotCatalog>;
  catalogRow: ReturnType<typeof buildOpenBiblePilotCatalogRow>;
  manifest: ReturnType<typeof buildOpenBiblePilotAudioManifest>;
  publishOperations: PublishOperation[];
  sampled: boolean;
  stageDir: string;
  textSeed: OpenBiblePilotTextCatalogSeed | null;
  totalAudioChapters: number;
  totalTimingChapters: number;
  translation: OpenBiblePilotRegistryTranslation;
  version: string;
};

type PublishOperation = {
  cacheControl: string;
  contentType: string;
  destination: string;
  recursive: boolean;
  source: string;
};

const DEFAULT_REGISTRY_PATH = path.resolve(
  'docs',
  'open-bible-audio-r2-pilot-registry.json'
);
const DEFAULT_STAGE_ROOT = path.resolve('tmp', 'open-bible-r2-pilot');
const DEFAULT_TEXT_MANIFEST_PATH = path.resolve(
  'apps',
  'site',
  'lib',
  'r2-text-pack-manifest.json'
);
const CANONICAL_BOOK_ORDER = bibleBooks.map((book) => book.id);
const CANONICAL_BOOK_INDEX = new Map(
  CANONICAL_BOOK_ORDER.map((bookId, index) => [bookId, index])
);

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let registryPath = DEFAULT_REGISTRY_PATH;
  let stageRoot = DEFAULT_STAGE_ROOT;
  let textManifestPath = DEFAULT_TEXT_MANIFEST_PATH;
  let translationIds: string[] | null = null;
  let openBibleRoot: string | null = null;
  let version: string | null = null;
  let chapterSampleLimit: number | null = null;
  let clean = false;
  let dryRun = false;
  let prepareStage = false;
  let publish = false;
  let skipRegistryUpdate = false;
  let useStaged = false;
  let upsertCatalog = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--registry' && args[index + 1]) {
      registryPath = path.resolve(args[index + 1]!);
      index += 1;
      continue;
    }

    if (arg === '--stage-root' && args[index + 1]) {
      stageRoot = path.resolve(args[index + 1]!);
      index += 1;
      continue;
    }

    if (arg === '--text-manifest' && args[index + 1]) {
      textManifestPath = path.resolve(args[index + 1]!);
      index += 1;
      continue;
    }

    if (arg === '--translation' && args[index + 1]) {
      translationIds = args[index + 1]!
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
      index += 1;
      continue;
    }

    if (arg === '--open-bible-root' && args[index + 1]) {
      openBibleRoot = path.resolve(args[index + 1]!);
      index += 1;
      continue;
    }

    if (arg === '--version' && args[index + 1]) {
      version = args[index + 1]!.trim();
      index += 1;
      continue;
    }

    if (arg === '--chapter-sample-limit' && args[index + 1]) {
      const parsed = Number(args[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        chapterSampleLimit = Math.floor(parsed);
      }
      index += 1;
      continue;
    }

    if (arg === '--clean') {
      clean = true;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--prepare-stage') {
      prepareStage = true;
      continue;
    }

    if (arg === '--publish') {
      publish = true;
      continue;
    }

    if (arg === '--skip-registry-update') {
      skipRegistryUpdate = true;
      continue;
    }

    if (arg === '--use-staged') {
      useStaged = true;
      continue;
    }

    if (arg === '--upsert-catalog') {
      upsertCatalog = true;
      continue;
    }
  }

  return {
    chapterSampleLimit,
    clean,
    dryRun,
    openBibleRoot,
    prepareStage,
    publish,
    skipRegistryUpdate,
    useStaged,
    registryPath,
    repoRoot: path.resolve(path.dirname(process.argv[1] ?? '.'), '..'),
    stageRoot,
    textManifestPath,
    translationIds,
    upsertCatalog,
    version,
  };
}

async function loadLocalEnvFile(repoRoot: string): Promise<void> {
  const envPath = path.join(repoRoot, '.env');

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
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env file and let explicit env vars win.
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function buildDefaultVersion(generatedAt: string): string {
  return `${generatedAt.slice(0, 10).replaceAll('-', '.')}-open-bible-audio-v1`;
}

function selectTranslations(
  registry: OpenBiblePilotRegistry,
  translationIds: string[] | null
): OpenBiblePilotRegistryTranslation[] {
  const explicit = translationIds ? new Set(translationIds) : null;

  return registry.translations.filter((translation) => {
    if (explicit) {
      return explicit.has(translation.translationId);
    }

    return (
      translation.selected &&
      translation.status !== 'published' &&
      translation.status !== 'verified'
    );
  });
}

function buildTextSeedMap(
  items: Array<{
    downloadUrl: string;
    sha256: string;
    translationId: string;
    version: string;
  }>
): Map<string, OpenBiblePilotTextCatalogSeed> {
  return new Map(
    items.map((item) => [
      item.translationId.toLowerCase(),
      {
        downloadUrl: item.downloadUrl,
        sha256: item.sha256,
        version: item.version,
      },
    ])
  );
}

function compareBookIds(left: string, right: string): number {
  return (
    (CANONICAL_BOOK_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (CANONICAL_BOOK_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    left.localeCompare(right)
  );
}

function compareArtifacts(left: OpenBibleManifestArtifact, right: OpenBibleManifestArtifact): number {
  return left.fileName.localeCompare(right.fileName);
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeUpdatedRegistry(options: {
  generatedAt: string;
  registry: OpenBiblePilotRegistry;
  registryPath: string;
  status: 'staged' | 'published';
  summaries: TranslationStageSummary[];
}): Promise<void> {
  const versionByTranslationId = new Map(
    options.summaries.map((summary) => [summary.translation.translationId, summary.version])
  );

  const nextRegistry: OpenBiblePilotRegistry = {
    ...options.registry,
    updatedAt: options.generatedAt,
    translations: options.registry.translations.map((translation) => {
      const version = versionByTranslationId.get(translation.translationId);
      if (!version) {
        return translation;
      }

      return {
        ...translation,
        status: options.status,
        lastActionAt: options.generatedAt,
        ...(options.status === 'published'
          ? { lastPublishedVersion: version }
          : { lastStagedVersion: version }),
      };
    }),
  };

  await writeJsonFile(options.registryPath, nextRegistry);
}

function buildStagePaths(
  stageRoot: string,
  translationId: string,
  version: string
): {
  audioDir: string;
  catalogFile: string;
  catalogRowFile: string;
  manifestFile: string;
  publishPlanFile: string;
  stageDir: string;
  timingDir: string;
} {
  const stageDir = path.join(stageRoot, translationId, version);
  return {
    stageDir,
    audioDir: path.join(stageDir, 'audio'),
    timingDir: path.join(stageDir, 'timing'),
    catalogFile: path.join(stageDir, 'catalog.json'),
    catalogRowFile: path.join(stageDir, 'translation-catalog-row.json'),
    manifestFile: path.join(stageDir, 'manifest.audio.json'),
    publishPlanFile: path.join(stageDir, 'publish-plan.json'),
  };
}

function buildPublishOperations(paths: ReturnType<typeof buildStagePaths>, summary: TranslationStageSummary): PublishOperation[] {
  const operations: PublishOperation[] = [
    {
      source: paths.audioDir,
      destination: `${summary.catalog.audio?.baseUrl ?? ''}/`,
      recursive: true,
      contentType: 'audio/mpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    {
      source: paths.manifestFile,
      destination: `manifests/audio/${summary.translation.translationId}/${summary.version}.json`,
      recursive: false,
      contentType: 'application/json',
      cacheControl: 'public, max-age=300, stale-while-revalidate=60',
    },
    {
      source: paths.catalogFile,
      destination: `catalog/audio/${summary.translation.translationId}/${summary.version}.json`,
      recursive: false,
      contentType: 'application/json',
      cacheControl: 'public, max-age=300, stale-while-revalidate=60',
    },
  ];

  if (summary.catalog.timing) {
    operations.push({
      source: paths.timingDir,
      destination: `${summary.catalog.timing.baseUrl}/`,
      recursive: true,
      contentType: 'application/json',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  }

  return operations;
}

function runRcloneCommand(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('rclone', args, {
      env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`rclone ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function runRcloneJsonCommand(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn('rclone', args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf8'));
        return;
      }

      reject(
        new Error(
          `rclone ${args.join(' ')} exited with code ${code ?? 'unknown'}: ${Buffer.concat(
            stderrChunks
          )
            .toString('utf8')
            .trim()}`
        )
      );
    });
  });
}

function buildRcloneS3Remote(
  bucket: string,
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string
): string {
  const normalizedEndpoint = endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `:s3,provider=Cloudflare,region=auto,access_key_id=${accessKeyId},secret_access_key=${secretAccessKey},endpoint=${normalizedEndpoint}:${bucket}`;
}

async function upsertCatalogRow(row: ReturnType<typeof buildOpenBiblePilotCatalogRow>): Promise<void> {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ??
    '';

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL.');
  }

  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase
    .from('translation_catalog')
    .upsert(row, { onConflict: 'translation_id' });

  if (error) {
    throw new Error(`Failed to upsert translation_catalog row for ${row.translation_id}: ${error.message}`);
  }
}

function getFirstPublishedChapter(summary: TranslationStageSummary): {
  bookId: string;
  chapter: number;
} {
  const firstBook = Object.entries(summary.manifest.books)
    .sort(([left], [right]) => compareBookIds(left, right))
    .find(([, book]) => book.chapters.length > 0);

  if (!firstBook) {
    throw new Error(`No staged audio chapters found for ${summary.translation.translationId}.`);
  }

  const [bookId, book] = firstBook;
  return {
    bookId,
    chapter: book.chapters[0]!.chapter,
  };
}

async function assertRemoteObjectExists(
  rcloneRemote: string,
  objectPath: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const output = await runRcloneJsonCommand(
    ['lsjson', `${rcloneRemote}/${objectPath.replace(/^\/+/, '')}`],
    env
  );
  const parsed = JSON.parse(output) as Array<{ IsDir?: boolean }>;

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed[0]?.IsDir) {
    throw new Error(`Expected published R2 object missing: ${objectPath}`);
  }
}

async function assertPublishedCatalogAssets(summary: TranslationStageSummary): Promise<void> {
  await loadLocalEnvFile(path.resolve('.'));
  const bucket = requireEnv('R2_BUCKET');
  const endpoint = requireEnv('R2_ENDPOINT');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  const rcloneRemote = buildRcloneS3Remote(bucket, endpoint, accessKeyId, secretAccessKey);
  const firstChapter = getFirstPublishedChapter(summary);

  if (!summary.catalog.audio?.baseUrl) {
    throw new Error(`Catalog audio baseUrl missing for ${summary.translation.translationId}.`);
  }

  await assertRemoteObjectExists(
    rcloneRemote,
    `${summary.catalog.audio.baseUrl}/${buildOpenBiblePilotAudioChapterPath(
      firstChapter.bookId,
      firstChapter.chapter
    )}`,
    awsEnv
  );

  if (summary.catalog.timing?.baseUrl) {
    await assertRemoteObjectExists(
      rcloneRemote,
      `${summary.catalog.timing.baseUrl}/${buildOpenBiblePilotTimingChapterPath(
        firstChapter.bookId,
        firstChapter.chapter
      )}`,
      awsEnv
    );
  }

  if (summary.catalog.text?.downloadUrl) {
    await assertRemoteObjectExists(rcloneRemote, summary.catalog.text.downloadUrl, awsEnv);
  }
}

function summarizeBookStats(bookSummaries: Map<string, MutableBookSummary>): {
  audioBooks: Record<string, { totalBytes: number; totalChapters: number }>;
  manifestBooks: Record<string, OpenBiblePilotManifestBook>;
  totalAudioBytes: number;
  totalAudioChapters: number;
  totalTimingChapters: number;
} {
  let totalAudioBytes = 0;
  let totalAudioChapters = 0;
  let totalTimingChapters = 0;

  const audioBooks: Record<string, { totalBytes: number; totalChapters: number }> = {};
  const manifestBooks: Record<string, OpenBiblePilotManifestBook> = {};

  for (const [bookId, summary] of [...bookSummaries.entries()].sort(([left], [right]) =>
    compareBookIds(left, right)
  )) {
    const chapters = [...summary.chapters.entries()]
      .sort(([left], [right]) => left - right)
      .map(([chapter, bytes]) => ({
        chapter,
        bytes,
        path: buildOpenBiblePilotAudioChapterPath(bookId, chapter),
      }));

    audioBooks[bookId] = {
      totalBytes: summary.totalBytes,
      totalChapters: chapters.length,
    };
    manifestBooks[bookId] = {
      totalBytes: summary.totalBytes,
      totalChapters: chapters.length,
      chapters,
    };

    totalAudioBytes += summary.totalBytes;
    totalAudioChapters += chapters.length;
    totalTimingChapters += summary.timingChapters.size;
  }

  return {
    audioBooks,
    manifestBooks,
    totalAudioBytes,
    totalAudioChapters,
    totalTimingChapters,
  };
}

async function stageTranslation(args: {
  chapterSampleLimit: number | null;
  clean: boolean;
  generatedAt: string;
  openBibleRoot: string;
  prepareStage: boolean;
  stageRoot: string;
  textSeedMap: Map<string, OpenBiblePilotTextCatalogSeed>;
  translation: OpenBiblePilotRegistryTranslation;
  version: string;
  manifestByExtId: Map<string, OpenBibleManifestRow>;
}): Promise<TranslationStageSummary> {
  const {
    chapterSampleLimit,
    clean,
    generatedAt,
    openBibleRoot,
    prepareStage,
    stageRoot,
    textSeedMap,
    translation,
    version,
    manifestByExtId,
  } = args;
  const stagePaths = buildStagePaths(stageRoot, translation.translationId, version);

  if (clean && prepareStage) {
    await rm(stagePaths.stageDir, { recursive: true, force: true });
  }

  if (prepareStage) {
    await mkdir(stagePaths.audioDir, { recursive: true });
    await mkdir(stagePaths.timingDir, { recursive: true });
  }

  const selectedAudioKeys = new Set<string>();
  const bookSummaries = new Map<string, MutableBookSummary>();

  for (const sourceExtId of translation.sourceExtIds) {
    const source = manifestByExtId.get(sourceExtId);
    if (!source) {
      throw new Error(
        `OpenBible manifest row ${sourceExtId} is missing for ${translation.translationId}.`
      );
    }

    const translationRoot = path.join(openBibleRoot, source.dir_name);
    const audioArtifacts = [...source.audio_artifacts].sort(compareArtifacts);

    for (const artifact of audioArtifacts) {
      const zipPath = path.join(translationRoot, 'audio', artifact.fileName);
      const zip = new AdmZip(zipPath);
      let sawAudioEntry = false;

      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) {
          continue;
        }

        const fileName = path.posix.basename(entry.entryName);
        if (!fileName.toLowerCase().endsWith('.mp3')) {
          continue;
        }

        const normalized = normalizeOpenBibleAudioEntryName(fileName);
        if (!normalized) {
          throw new Error(
            `Unsupported audio entry ${entry.entryName} in ${artifact.fileName} for ${translation.translationId}.`
          );
        }

        sawAudioEntry = true;

        const chapterKey = `${normalized.bookId}:${normalized.chapter}`;
        if (!selectedAudioKeys.has(chapterKey)) {
          if (
            chapterSampleLimit !== null &&
            selectedAudioKeys.size >= chapterSampleLimit
          ) {
            continue;
          }

          selectedAudioKeys.add(chapterKey);
        }

        if (!selectedAudioKeys.has(chapterKey)) {
          continue;
        }

        const bytes =
          typeof entry.header.size === 'number' && entry.header.size > 0
            ? entry.header.size
            : entry.getData().length;

        const existing = bookSummaries.get(normalized.bookId) ?? {
          chapters: new Map<number, number>(),
          timingChapters: new Set<number>(),
          totalBytes: 0,
        };

        if (existing.chapters.has(normalized.chapter)) {
          throw new Error(
            `Duplicate audio chapter ${chapterKey} found while staging ${translation.translationId}.`
          );
        }

        existing.chapters.set(normalized.chapter, bytes);
        existing.totalBytes += bytes;
        bookSummaries.set(normalized.bookId, existing);

        if (prepareStage) {
          const buffer = entry.getData();
          const targetPath = path.join(
            stagePaths.audioDir,
            buildOpenBiblePilotAudioChapterPath(normalized.bookId, normalized.chapter)
          );
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, buffer);
        }
      }

      if (!sawAudioEntry) {
        throw new Error(
          `No chapter MP3 entries were found in ${artifact.fileName} for ${translation.translationId}.`
        );
      }

      if (
        chapterSampleLimit !== null &&
        selectedAudioKeys.size >= chapterSampleLimit
      ) {
        break;
      }
    }

    if (translation.timingMode !== 'none') {
      const timingArtifacts = [...source.timing_artifacts].sort(compareArtifacts);

      for (const artifact of timingArtifacts) {
        const zipPath = path.join(translationRoot, 'timing', artifact.fileName);
        const zip = new AdmZip(zipPath);

        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) {
            continue;
          }

          const fileName = path.posix.basename(entry.entryName);
          if (!fileName.toLowerCase().endsWith('.txt')) {
            continue;
          }

          const normalized = normalizeOpenBibleTimingEntryName(fileName);
          if (!normalized) {
            throw new Error(
              `Unsupported timing entry ${entry.entryName} in ${artifact.fileName} for ${translation.translationId}.`
            );
          }

          const chapterKey = `${normalized.bookId}:${normalized.chapter}`;
          if (!selectedAudioKeys.has(chapterKey)) {
            continue;
          }

          const existing = bookSummaries.get(normalized.bookId);
          if (!existing || !existing.chapters.has(normalized.chapter)) {
            continue;
          }

          if (existing.timingChapters.has(normalized.chapter)) {
            continue;
          }

          const parsedTiming = parseOpenBibleTimingText(entry.getData().toString('utf8'));
          if (Object.keys(parsedTiming).length === 0) {
            throw new Error(
              `Timing entry ${entry.entryName} in ${artifact.fileName} did not contain any verse rows for ${translation.translationId}.`
            );
          }

          existing.timingChapters.add(normalized.chapter);

          if (prepareStage) {
            const targetPath = path.join(
              stagePaths.timingDir,
              buildOpenBiblePilotTimingChapterPath(normalized.bookId, normalized.chapter)
            );
            await mkdir(path.dirname(targetPath), { recursive: true });
            await writeFile(targetPath, `${JSON.stringify(parsedTiming)}\n`);
          }
        }

        if (
          chapterSampleLimit !== null &&
          [...bookSummaries.values()].every(
            (summary) => summary.timingChapters.size >= summary.chapters.size
          )
        ) {
          break;
        }
      }
    }

    if (
      chapterSampleLimit !== null &&
      selectedAudioKeys.size >= chapterSampleLimit &&
      (translation.timingMode === 'none' ||
        [...bookSummaries.values()].every(
          (summary) => summary.timingChapters.size >= summary.chapters.size
        ))
    ) {
      break;
    }
  }

  const {
    audioBooks,
    manifestBooks,
    totalAudioBytes,
    totalAudioChapters,
    totalTimingChapters,
  } = summarizeBookStats(bookSummaries);
  const textSeed =
    translation.hasTextPack && translation.textPackTranslationId
      ? textSeedMap.get(translation.textPackTranslationId.toLowerCase()) ?? null
      : null;
  const catalog = buildOpenBiblePilotCatalog({
    translation,
    version,
    updatedAt: generatedAt,
    audioBooks,
    totalAudioChapters,
    totalTimingChapters,
    textCatalog: textSeed,
  });
  const manifest = buildOpenBiblePilotAudioManifest({
    translation,
    version,
    updatedAt: generatedAt,
    books: manifestBooks,
    totalAudioBytes,
    totalAudioChapters,
    totalTimingChapters,
  });
  const catalogRow = buildOpenBiblePilotCatalogRow({
    translation,
    catalog,
  });

  const summary: TranslationStageSummary = {
    catalog,
    catalogRow,
    manifest,
    publishOperations: [],
    sampled: chapterSampleLimit !== null,
    stageDir: stagePaths.stageDir,
    textSeed,
    totalAudioChapters,
    totalTimingChapters,
    translation,
    version,
  };
  summary.publishOperations = buildPublishOperations(stagePaths, summary);

  if (prepareStage) {
    await writeJsonFile(stagePaths.catalogFile, catalog);
    await writeJsonFile(stagePaths.catalogRowFile, catalogRow);
    await writeJsonFile(stagePaths.manifestFile, manifest);
    await writeJsonFile(stagePaths.publishPlanFile, {
      translationId: translation.translationId,
      version,
      sampled: summary.sampled,
      publishTiming: shouldPublishOpenBiblePilotTiming(
        translation,
        totalAudioChapters,
        totalTimingChapters
      ),
      operations: summary.publishOperations,
    });
  }

  return summary;
}

async function loadStagedSummary(args: {
  stageRoot: string;
  translation: OpenBiblePilotRegistryTranslation;
  version: string;
}): Promise<TranslationStageSummary> {
  const stagePaths = buildStagePaths(
    args.stageRoot,
    args.translation.translationId,
    args.version
  );
  const [catalog, catalogRow, manifest, publishPlan] = await Promise.all([
    readJsonFile<ReturnType<typeof buildOpenBiblePilotCatalog>>(stagePaths.catalogFile),
    readJsonFile<ReturnType<typeof buildOpenBiblePilotCatalogRow>>(
      stagePaths.catalogRowFile
    ),
    readJsonFile<ReturnType<typeof buildOpenBiblePilotAudioManifest>>(
      stagePaths.manifestFile
    ),
    readJsonFile<{
      operations: PublishOperation[];
      publishTiming: boolean;
      sampled: boolean;
    }>(stagePaths.publishPlanFile),
  ]);

  return {
    catalog,
    catalogRow,
    manifest,
    publishOperations: publishPlan.operations,
    sampled: publishPlan.sampled,
    stageDir: stagePaths.stageDir,
    textSeed: catalog.text
      ? {
          downloadUrl: catalog.text.downloadUrl,
          sha256: catalog.text.sha256,
          version: catalog.text.version,
        }
      : null,
    totalAudioChapters: manifest.totalChapters,
    totalTimingChapters: publishPlan.publishTiming ? manifest.totalChapters : 0,
    translation: args.translation,
    version: args.version,
  };
}

async function publishTranslation(summary: TranslationStageSummary): Promise<void> {
  await loadLocalEnvFile(path.resolve('.'));
  const bucket = requireEnv('R2_BUCKET');
  const endpoint = requireEnv('R2_ENDPOINT');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const awsEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_DEFAULT_REGION: 'auto',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  const rcloneRemote = buildRcloneS3Remote(bucket, endpoint, accessKeyId, secretAccessKey);

  for (const operation of summary.publishOperations) {
    const destination = `${rcloneRemote}/${operation.destination.replace(/^\/+/, '')}`;

    if (operation.recursive) {
      await runRcloneCommand(
        [
          'copy',
          operation.source,
          destination,
          '--s3-no-check-bucket',
          '--s3-disable-checksum',
          '--exclude',
          '.DS_Store',
          '--exclude',
          '*/.DS_Store',
          '--exclude',
          '._*',
          '--header-upload',
          `Cache-Control: ${operation.cacheControl}`,
          '--transfers',
          '16',
          '--checkers',
          '32',
          '--s3-upload-concurrency',
          '8',
          '--s3-chunk-size',
          '16M',
        ],
        awsEnv
      );
      continue;
    }

    await runRcloneCommand(
      [
        'copyto',
        operation.source,
        destination,
        '--s3-no-check-bucket',
        '--s3-disable-checksum',
        '--header-upload',
        `Cache-Control: ${operation.cacheControl}`,
      ],
      awsEnv
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const registry = await readJsonFile<OpenBiblePilotRegistry>(args.registryPath);
  const openBibleRoot = args.openBibleRoot ?? registry.openBibleRoot;
  const generatedAt = new Date().toISOString();
  const version = args.version ?? buildDefaultVersion(generatedAt);
  const pilotTranslations = selectTranslations(registry, args.translationIds);

  if (pilotTranslations.length === 0) {
    throw new Error('No pilot translations matched the current selection.');
  }

  const summaries: TranslationStageSummary[] = [];

  if (args.useStaged) {
    for (const translation of pilotTranslations) {
      summaries.push(
        await loadStagedSummary({
          stageRoot: args.stageRoot,
          translation,
          version,
        })
      );
    }
  } else {
    const manifestRows = await readJsonFile<OpenBibleManifestRow[]>(
      path.join(openBibleRoot, 'manifest.json')
    );
    const manifestByExtId = new Map(manifestRows.map((row) => [row.ext_id, row]));
    const textManifest = await readJsonFile<{ items: TextPackManifestItem[] }>(
      args.textManifestPath
    );
    const textSeedMap = buildTextSeedMap(textManifest.items ?? []);

    for (const translation of pilotTranslations) {
      summaries.push(
        await stageTranslation({
          chapterSampleLimit: args.chapterSampleLimit,
          clean: args.clean,
          generatedAt,
          openBibleRoot,
          prepareStage: args.prepareStage,
          stageRoot: args.stageRoot,
          textSeedMap,
          translation,
          version,
          manifestByExtId,
        })
      );
    }
  }

  if (args.publish) {
    if (args.chapterSampleLimit !== null) {
      throw new Error('Refusing to publish a sampled pilot stage. Remove --chapter-sample-limit first.');
    }

    for (const summary of summaries) {
      await publishTranslation(summary);
    }
  }

  if (args.upsertCatalog) {
    if (args.chapterSampleLimit !== null) {
      throw new Error('Refusing to upsert sampled catalog rows. Remove --chapter-sample-limit first.');
    }

    await loadLocalEnvFile(args.repoRoot);
    for (const summary of summaries) {
      await assertPublishedCatalogAssets(summary);
      await upsertCatalogRow(summary.catalogRow);
    }
  }

  if (
    !args.dryRun &&
    args.chapterSampleLimit === null &&
    !args.skipRegistryUpdate
  ) {
    if (args.publish) {
      await writeUpdatedRegistry({
        generatedAt,
        registry,
        registryPath: args.registryPath,
        status: 'published',
        summaries,
      });
    } else if (args.prepareStage) {
      await writeUpdatedRegistry({
        generatedAt,
        registry,
        registryPath: args.registryPath,
        status: 'staged',
        summaries,
      });
    }
  }

  const output = {
    generatedAt,
    openBibleRoot,
    selectedTranslations: pilotTranslations.map((translation) => translation.translationId),
    stageRoot: args.stageRoot,
    textManifestPath: args.textManifestPath,
    version,
    translations: summaries.map((summary) => ({
      translationId: summary.translation.translationId,
      sampled: summary.sampled,
      stageDir: summary.stageDir,
      hasTextSeed: Boolean(summary.textSeed),
      totalAudioChapters: summary.totalAudioChapters,
      totalTimingChapters: summary.totalTimingChapters,
      catalog: summary.catalog,
      catalogRow: summary.catalogRow,
      manifest: summary.manifest,
      publishOperations: summary.publishOperations,
    })),
  };

  await writeJsonFile(
    path.join(args.stageRoot, 'last-run-summary.json'),
    output
  );

  if (args.dryRun || !args.publish) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        publishedTranslations: summaries.map((summary) => summary.translation.translationId),
        version,
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
