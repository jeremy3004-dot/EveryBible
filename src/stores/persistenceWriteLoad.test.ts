/**
 * Persistence write load on the JS thread.
 *
 * Zustand `persist` serialises the partialized state and hands it to storage after EVERY
 * `set`, including sets that only touch transient fields. This harness drives each persisted
 * store's realistic hot paths through the real storage adapters (only the native MMKV class is
 * counted) and records, per operation: serialisations (JSON.stringify of the persist envelope,
 * the CPU cost on the JS thread), bytes serialised, and writes/bytes that reached MMKV.
 *
 * The table is printed with `PERSIST_LOAD_TABLE=1`; the assertions pin the budgets.
 */
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';
import {
  flushAsyncWork,
  installBibleStoreDoubles,
  makeRuntimeTranslation,
} from './__tests__/bibleStoreDoubles';

const mmkvFiles = new Map<string, string>();
const mmkvCounters = { writes: 0, bytes: 0 };
class CountingMMKV {
  getString(key: string): string | undefined {
    return mmkvFiles.get(key);
  }
  set(key: string, value: string | number | boolean): void {
    const text = String(value);
    mmkvCounters.writes += 1;
    mmkvCounters.bytes += text.length;
    mmkvFiles.set(key, text);
  }
  delete(key: string): void {
    mmkvFiles.delete(key);
  }
  contains(key: string): boolean {
    return mmkvFiles.has(key);
  }
  getAllKeys(): string[] {
    return Array.from(mmkvFiles.keys());
  }
  clearAll(): void {
    mmkvFiles.clear();
  }
}
mockModule(mock, 'react-native-mmkv', { MMKV: CountingMMKV });
installBibleStoreDoubles(mock);
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: () => Promise.resolve({ success: true }),
});
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null, authGeneration: undefined }) },
});

// Every persist envelope starts with this prefix; counting it measures serialisation work.
const serialised = { count: 0, bytes: 0 };
const realStringify = JSON.stringify;
JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
  const out = realStringify(...args);
  if (typeof out === 'string' && out.startsWith('{"state":')) {
    serialised.count += 1;
    serialised.bytes += out.length;
  }
  return out;
}) as typeof JSON.stringify;

interface Load {
  serialisations: number;
  serialisedBytes: number;
  mmkvWrites: number;
  mmkvBytes: number;
}
const table: Array<[string, Load]> = [];

function measure(label: string, run: () => void): Load {
  const before = { s: { ...serialised }, m: { ...mmkvCounters } };
  run();
  const load = {
    serialisations: serialised.count - before.s.count,
    serialisedBytes: serialised.bytes - before.s.bytes,
    mmkvWrites: mmkvCounters.writes - before.m.writes,
    mmkvBytes: mmkvCounters.bytes - before.m.bytes,
  };
  table.push([label, load]);
  return load;
}

let useAudioStore: typeof import('./audioStore').useAudioStore;
let useProgressStore: typeof import('./progressStore').useProgressStore;
let useBibleStore: typeof import('./bibleStore').useBibleStore;
let useLibraryStore: typeof import('./libraryStore').useLibraryStore;
let useAnnotationStore: typeof import('./annotationStore').useAnnotationStore;
let createReadingPlansStore: typeof import('./readingPlansStore').createReadingPlansStore;

before(async () => {
  ({ useAudioStore } = await import('./audioStore'));
  ({ useProgressStore } = await import('./progressStore'));
  ({ useBibleStore } = await import('./bibleStore'));
  ({ useLibraryStore } = await import('./libraryStore'));
  ({ useAnnotationStore } = await import('./annotationStore'));
  ({ createReadingPlansStore } = await import('./readingPlansStore'));
  await flushAsyncWork();
});

after(() => {
  JSON.stringify = realStringify;
  if (process.env.PERSIST_LOAD_TABLE) {
    console.log('\noperation | serialisations | serialised bytes | mmkv writes | mmkv bytes');
    for (const [label, l] of table) {
      console.log(
        `${label} | ${l.serialisations} | ${l.serialisedBytes} | ${l.mmkvWrites} | ${l.mmkvBytes}`
      );
    }
  }
  mock.reset();
});

beforeEach(() => {
  mmkvCounters.writes = 0;
  mmkvCounters.bytes = 0;
});

test('audio: 60s of 250ms position ticks writes only the 5s resume checkpoints', () => {
  const audio = useAudioStore.getState();
  audio.setCurrentTrack('bsb', 'JHN', 3, 0);
  audio.setStatus('playing');
  audio.setDuration(600_000);
  const load = measure('audio 240 position ticks (60s)', () => {
    for (let i = 1; i <= 240; i += 1) audio.setPosition(i * 250);
  });
  assert.ok(load.serialisations <= 12, `serialisations ${load.serialisations}`);
});

test('progress: no-op streak updates do not serialise', () => {
  const progress = useProgressStore.getState();
  progress.markChapterRead('JHN', 3);
  const load = measure('progress 50 no-op updateStreak', () => {
    for (let i = 0; i < 50; i += 1) progress.updateStreak();
  });
  assert.equal(load.serialisations, 0);
  measure('progress markChapterRead (new chapter)', () => progress.markChapterRead('JHN', 4));
  measure('progress recordListeningTime (30s bank)', () => progress.recordListeningTime(30_000));
});

test('bible: download progress ticks and reader loading flags do not serialise the catalog', () => {
  const runtime = Array.from({ length: 200 }, (_, i) =>
    makeRuntimeTranslation({ id: `rt${i}`, installState: 'remote-only' })
  );
  useBibleStore.getState().applyRuntimeCatalog(runtime);
  useBibleStore.setState({ currentTranslation: 'bsb' });

  const ticks = measure('bible 100 text download progress ticks', () => {
    for (let i = 1; i <= 100; i += 1) {
      useBibleStore.setState({
        downloadProgress: {
          translationId: 'rt1',
          progress: i,
          status: 'downloading',
          bytesDownloaded: i * 1000,
          bytesTotal: 100_000,
        } as never,
      });
    }
  });
  const flags = measure('bible chapter load (setLoading/setVerses/setError)', () => {
    const bible = useBibleStore.getState();
    bible.setLoading(true);
    bible.setVerses([]);
    bible.setError(null);
    bible.setLoading(false);
  });
  measure('bible setCurrentChapter (position change)', () =>
    useBibleStore.getState().setCurrentChapter(5)
  );
  assert.equal(ticks.serialisations, 0);
  assert.equal(flags.serialisations, 0);
});

test('library: recording the same chapter history twice', () => {
  const library = useLibraryStore.getState();
  measure('library recordHistory (new)', () => library.recordHistory('JHN', 3, 0.5));
  measure('library recordHistory (same chapter again)', () => library.recordHistory('JHN', 3, 0.5));
});

test('annotations and reading plans: user-meaningful edits write once each', () => {
  const annotation = measure('annotation upsert (highlight)', () => {
    useAnnotationStore.getState().upsertAnnotation({
      id: '',
      book: 'JHN',
      chapter: 3,
      verse_start: 16,
      verse_end: null,
      type: 'highlight',
      color: 'amber',
      content: null,
      deleted_at: null,
    });
  });
  assert.equal(annotation.mmkvWrites, 1);

  const store = createReadingPlansStore();
  const enroll = measure('plans enrollPlan', () => store.getState().enrollPlan('plan-1'));
  assert.equal(enroll.mmkvWrites, 1);
});
