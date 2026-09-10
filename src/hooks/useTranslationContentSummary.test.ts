/**
 * `useTranslationContentSummary` decides whether the Bible browser shows a
 * translation's coarse catalog coverage or the exact per-chapter coverage
 * resolved from an Every Language signed manifest.
 *
 * There is no renderer in this workspace, so `react` is replaced with a tiny
 * hook runtime: `useState` slots that survive a re-render, `useMemo` with real
 * dependency comparison, and `useEffect` queued until `commit()` runs it
 * (with the previous cleanup). That keeps the async manifest resolution, the
 * unmount guard, and the re-fetch-on-change behaviour observable exactly as
 * React would sequence them.
 */
import test, { before, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';
import type { ElAudioManifest } from '../services/elMedia/elManifestModel';
import type { BibleTranslation } from '../types';

// ---------------------------------------------------------------------------
// Minimal React hook runtime
// ---------------------------------------------------------------------------

type Deps = readonly unknown[] | undefined;

interface EffectSlot {
  deps: Deps;
  cleanup?: (() => void) | void;
}

interface MemoSlot {
  deps: Deps;
  value: unknown;
}

const stateSlots: unknown[] = [];
const memoSlots: (MemoSlot | undefined)[] = [];
const effectSlots: (EffectSlot | undefined)[] = [];
let pendingEffects: { index: number; run: () => (() => void) | void; deps: Deps }[] = [];
let stateCursor = 0;
let memoCursor = 0;
let effectCursor = 0;
let renderCount = 0;

function depsChanged(previous: Deps, next: Deps): boolean {
  if (!previous || !next || previous.length !== next.length) {
    return true;
  }
  return previous.some((value, index) => !Object.is(value, next[index]));
}

const react = {
  useState<S>(initial: S | (() => S)): [S, (next: S | ((current: S) => S)) => void] {
    const index = stateCursor++;
    if (!(index in stateSlots)) {
      stateSlots[index] = typeof initial === 'function' ? (initial as () => S)() : initial;
    }
    const setState = (next: S | ((current: S) => S)) => {
      stateSlots[index] =
        typeof next === 'function' ? (next as (current: S) => S)(stateSlots[index] as S) : next;
    };
    return [stateSlots[index] as S, setState];
  },
  useMemo<T>(factory: () => T, deps: Deps): T {
    const index = memoCursor++;
    const slot = memoSlots[index];
    if (!slot || depsChanged(slot.deps, deps)) {
      memoSlots[index] = { deps, value: factory() };
    }
    return memoSlots[index]!.value as T;
  },
  useEffect(run: () => (() => void) | void, deps: Deps): void {
    const index = effectCursor++;
    const slot = effectSlots[index];
    if (!slot || depsChanged(slot.deps, deps)) {
      pendingEffects.push({ index, run, deps });
    }
  },
};

mockModule(mock, 'react', { ...react, default: react });

/** Run the hook once, as one React render pass. Effects stay queued until flushed. */
function render(translation: BibleTranslation | undefined) {
  stateCursor = 0;
  memoCursor = 0;
  effectCursor = 0;
  renderCount += 1;
  return hook(translation);
}

/** Let queued microtasks — including the hook's dynamic import — run to completion. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Commit the effects queued by the last render, tearing down superseded ones
 * first, then drain microtasks: the hook reaches the manifest service through a
 * lazy `import()`, so the request is made a tick after the effect body runs.
 */
async function commit(): Promise<void> {
  const queued = pendingEffects;
  pendingEffects = [];
  for (const effect of queued) {
    effectSlots[effect.index]?.cleanup?.();
    effectSlots[effect.index] = { deps: effect.deps, cleanup: effect.run() };
  }
  await tick();
}

/** Tear the component down, as React does when the screen unmounts. */
function unmount(): void {
  for (const slot of effectSlots) {
    slot?.cleanup?.();
  }
  effectSlots.length = 0;
  stateSlots.length = 0;
  memoSlots.length = 0;
  pendingEffects = [];
}

function resetHookRuntime(): void {
  effectSlots.length = 0;
  stateSlots.length = 0;
  memoSlots.length = 0;
  pendingEffects = [];
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

  render(makeElTranslation());
  await commit();
  unmount();
  deliver(makeManifest({ PSA: [117] }));
  await tick();

  assert.deepEqual(stateSlots, [], 'no state may be written after the cleanup ran');
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
