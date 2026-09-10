/**
 * `useTranslationContentSummary` decides whether the Bible browser shows a
 * translation's coarse catalog coverage or the exact per-chapter coverage
 * resolved from an Every Language signed manifest.
 *
 * There is no renderer in this workspace, so `react` is the shared hook runtime
 * from `src/testing/reactHookRuntime.ts`: `useState` slots that survive a
 * re-render, `useMemo` with real dependency comparison, and `useEffect` queued
 * until `commit()` runs it (with the previous cleanup) and drains microtasks.
 * That keeps the async manifest resolution, the unmount guard, and the
 * re-fetch-on-change behaviour observable exactly as React would sequence them.
 */
import test, { before, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime, type MountedHook } from '../testing/reactHookRuntime';
import type { ElAudioManifest } from '../services/elMedia/elManifestModel';
import type { BibleTranslation } from '../types';

// ---------------------------------------------------------------------------
// React hook runtime
// ---------------------------------------------------------------------------

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);

type Summary = ReturnType<
  typeof import('./useTranslationContentSummary').useTranslationContentSummary
>;

let view: MountedHook<[BibleTranslation | undefined], Summary> | null = null;
let renderCount = 0;

/** Run the hook once, as one React render pass. Effects stay queued until committed. */
function render(translation: BibleTranslation | undefined): Summary {
  renderCount += 1;
  if (!view) {
    view = runtime.mount(hook, translation);
    return view.result;
  }
  return view.rerender(translation);
}

/** Let queued microtasks — including the hook's dynamic import — run to completion. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Commit the effects queued by the last render, tearing down superseded ones
 * first, then drain microtasks: the hook reaches the manifest service through a
 * lazy `import()`, so the request is made a tick after the effect body runs.
 */
async function commit(): Promise<void> {
  await view!.commit();
}

/** Tear the component down, as React does when the screen unmounts. */
function unmount(): void {
  runtime.unmountAll();
}

function resetHookRuntime(): void {
  runtime.unmountAll();
  view = null;
  renderCount = 0;
}

// ---------------------------------------------------------------------------
// Manifest service double
// ---------------------------------------------------------------------------

interface ManifestRef {
  translationId: string;
  manifestUrl: string;
  audioVersion: string;
  catalogBaseUrl: string;
}

const manifestCalls: ManifestRef[] = [];
let respondWithManifest: (ref: ManifestRef) => Promise<ElAudioManifest | null> = async () => null;

mockModule(mock, sourcePath('services/elMedia/elManifestService.ts'), {
  getElManifestForAudioCatalog: (ref: ManifestRef) => {
    manifestCalls.push(ref);
    return respondWithManifest(ref);
  },
});

let hook: typeof import('./useTranslationContentSummary').useTranslationContentSummary;

before(async () => {
  ({ useTranslationContentSummary: hook } = await import('./useTranslationContentSummary'));
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChapter(chapter: number) {
  return { chapter, path: `/${chapter}.mp3`, bytes: 10, sha256: 'a'.repeat(64) };
}

function makeManifest(books: Record<string, number[]>): ElAudioManifest {
  return {
    schema: 'everybible-audio-manifest/v1',
    translationId: 'el-bhujel',
    audioVersion: '2026-01-01',
    deliveryMode: 'chapter',
    baseUrl: 'https://media.everybible.app',
    fileExt: 'mp3',
    mimeType: 'audio/mpeg',
    books: Object.fromEntries(
      Object.entries(books).map(([bookId, chapters]) => [bookId, chapters.map(makeChapter)])
    ),
  };
}

function makeTranslation(overrides: Partial<BibleTranslation> = {}): BibleTranslation {
  return {
    id: 'el-bhujel',
    name: 'Bhujel',
    abbreviation: 'BHJ',
    language: 'bhj',
    description: '',
    copyright: '',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 0,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    ...overrides,
  };
}

function makeElTranslation(overrides: Partial<BibleTranslation> = {}): BibleTranslation {
  return makeTranslation({
    catalog: {
      version: '1',
      updatedAt: '2026-01-01',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: '/manifests/bhujel.json',
        audioVersion: '2026-01-01',
        catalogBaseUrl: 'https://catalog.everylanguage.org',
      },
    },
    ...overrides,
  });
}

/** Render, commit effects, let the manifest promise chain settle, render again. */
async function settle(translation: BibleTranslation | undefined) {
  render(translation);
  await commit();
  await tick();
  return render(translation);
}

beforeEach(() => {
  resetHookRuntime();
  manifestCalls.length = 0;
  respondWithManifest = async () => null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('no translation yields no summary', () => {
  assert.equal(render(undefined), undefined);
});

test('no manifest is fetched while the translation is still unknown', async () => {
  render(undefined);
  await commit();

  assert.deepEqual(manifestCalls, []);
});

test('a translation without an Every Language manifest is passed straight through', async () => {
  const translation = makeTranslation();

  assert.equal(await settle(translation), translation);
});

test('a stream-template audio strategy never reaches the manifest service', async () => {
  await settle(
    makeTranslation({
      catalog: {
        version: '1',
        updatedAt: '2026-01-01',
        audio: { strategy: 'stream-template', baseUrl: 'https://media.everybible.app' },
      },
    })
  );

  assert.deepEqual(manifestCalls, []);
});

test('an el-manifest entry missing its manifest URL is treated as having no manifest', async () => {
  const translation = makeElTranslation({
    catalog: {
      version: '1',
      updatedAt: '2026-01-01',
      audio: {
        strategy: 'el-manifest',
        audioVersion: '2026-01-01',
        catalogBaseUrl: 'https://catalog.everylanguage.org',
      },
    },
  });

  assert.equal(await settle(translation), translation);
  assert.deepEqual(manifestCalls, []);
});

test('an el-manifest entry missing its audio version is treated as having no manifest', async () => {
  await settle(
    makeElTranslation({
      catalog: {
        version: '1',
        updatedAt: '2026-01-01',
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/bhujel.json',
          catalogBaseUrl: 'https://catalog.everylanguage.org',
        },
      },
    })
  );

  assert.deepEqual(manifestCalls, []);
});

test('an el-manifest entry missing its catalog base URL is treated as having no manifest', async () => {
  await settle(
    makeElTranslation({
      catalog: {
        version: '1',
        updatedAt: '2026-01-01',
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/bhujel.json',
          audioVersion: '2026-01-01',
        },
      },
    })
  );

  assert.deepEqual(manifestCalls, []);
});

test('the manifest is requested with the catalog coordinates of the translation', async () => {
  render(makeElTranslation());
  await commit();

  assert.deepEqual(manifestCalls, [
    {
      translationId: 'el-bhujel',
      manifestUrl: '/manifests/bhujel.json',
      audioVersion: '2026-01-01',
      catalogBaseUrl: 'https://catalog.everylanguage.org',
    },
  ]);
});

test('the plain translation is returned while the manifest is still resolving', async () => {
  const translation = makeElTranslation();
  respondWithManifest = () => new Promise(() => {});

  render(translation);
  await commit();

  assert.equal(render(translation), translation);
});

test('a resolved manifest becomes the exact per-chapter audio coverage', async () => {
  respondWithManifest = async () => makeManifest({ PSA: [117], MRK: [1, 2, 3] });

  const summary = await settle(makeElTranslation());

  assert.deepEqual(summary?.audioChapters, { PSA: [117], MRK: [1, 2, 3] });
});

test('the resolved summary keeps every other field of the translation', async () => {
  const translation = makeElTranslation();
  respondWithManifest = async () => makeManifest({ PSA: [117] });

  const summary = await settle(translation);

  assert.deepEqual(
    { ...summary, audioChapters: undefined },
    {
      ...translation,
      audioChapters: undefined,
    }
  );
});

test('duplicate manifest chapters collapse into one sorted chapter list', async () => {
  respondWithManifest = async () => ({
    ...makeManifest({}),
    books: { LUK: [makeChapter(3), makeChapter(1), makeChapter(3)] },
  });

  const summary = await settle(makeElTranslation());

  assert.deepEqual(summary?.audioChapters, { LUK: [1, 3] });
});

test('a manifest that resolves to nothing leaves the translation optimistic', async () => {
  const translation = makeElTranslation();
  respondWithManifest = async () => null;

  const summary = await settle(translation);

  assert.equal(summary, translation);
});

test('a failing manifest lookup leaves the translation optimistic', async () => {
  const translation = makeElTranslation();
  respondWithManifest = async () => {
    throw new Error('offline');
  };

  const summary = await settle(translation);

  assert.equal(summary, translation);
});

test('a manifest that arrives after unmount is discarded', async () => {
  let deliver: (manifest: ElAudioManifest) => void = () => {};
  respondWithManifest = () =>
    new Promise((resolve) => {
      deliver = resolve;
    });

  const translation = makeElTranslation();
  const beforeUnmount = render(translation);
  await commit();
  unmount();
  deliver(makeManifest({ PSA: [117] }));
  await tick();

  // A state write after the cleanup would change the memo's inputs, so an
  // identical summary on the next pass is proof nothing was written.
  assert.equal(
    view!.rerender(translation),
    beforeUnmount,
    'no state may be written after the cleanup ran'
  );
});

test('switching translation re-requests the manifest for the new one', async () => {
  respondWithManifest = async () => makeManifest({ PSA: [117] });
  await settle(makeElTranslation());

  const other = makeElTranslation({
    id: 'el-magar',
    catalog: {
      version: '1',
      updatedAt: '2026-01-01',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: '/manifests/magar.json',
        audioVersion: '2026-02-01',
        catalogBaseUrl: 'https://catalog.everylanguage.org',
      },
    },
  });
  render(other);
  await commit();

  assert.deepEqual(
    manifestCalls.map((call) => call.translationId),
    ['el-bhujel', 'el-magar']
  );
});

test('a new audio version for the same translation re-requests the manifest', async () => {
  respondWithManifest = async () => makeManifest({ PSA: [117] });
  await settle(makeElTranslation());

  render(
    makeElTranslation({
      catalog: {
        version: '2',
        updatedAt: '2026-02-01',
        audio: {
          strategy: 'el-manifest',
          manifestUrl: '/manifests/bhujel.json',
          audioVersion: '2026-02-01',
          catalogBaseUrl: 'https://catalog.everylanguage.org',
        },
      },
    })
  );
  await commit();

  assert.deepEqual(
    manifestCalls.map((call) => call.audioVersion),
    ['2026-01-01', '2026-02-01']
  );
});

test('re-rendering an unchanged translation does not re-request the manifest', async () => {
  const translation = makeElTranslation();
  respondWithManifest = async () => makeManifest({ PSA: [117] });

  await settle(translation);
  render(translation);
  await commit();

  assert.equal(manifestCalls.length, 1);
});

test('coverage resolved for the previous translation is not applied to the next one', async () => {
  respondWithManifest = async () => makeManifest({ PSA: [117] });
  await settle(makeElTranslation());

  const other = makeElTranslation({
    id: 'el-magar',
    catalog: {
      version: '1',
      updatedAt: '2026-01-01',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: '/manifests/magar.json',
        audioVersion: '2026-02-01',
        catalogBaseUrl: 'https://catalog.everylanguage.org',
      },
    },
  });
  respondWithManifest = () => new Promise(() => {});
  const summary = render(other);
  await commit();

  assert.equal(summary?.audioChapters, undefined);
});

test('the summary is recomputed only when its inputs change', async () => {
  const translation = makeElTranslation();
  respondWithManifest = async () => makeManifest({ PSA: [117] });

  const first = await settle(translation);
  const second = render(translation);

  assert.equal(second, first, 'a re-render with the same inputs reuses the memoised summary');
  assert.ok(renderCount > 1);
});
