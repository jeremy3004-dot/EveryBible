import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../types';
import { applyElRuntimeCatalog, type ElBootstrapStep } from './runtimeElCatalog';

function makeSupabaseRuntime(id: string): BibleTranslation {
  return {
    id,
    name: `Supabase ${id}`,
    abbreviation: id.toUpperCase(),
    language: 'English',
    description: 'Supabase runtime translation',
    copyright: 'Example License',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4.2,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'runtime',
    installState: 'remote-only',
    catalog: {
      version: '2026.01.01',
      updatedAt: '2026-01-01T00:00:00.000Z',
      text: {
        format: 'sqlite',
        version: '2026.01.01',
        downloadUrl: 'https://cdn.example.com/x.sqlite',
        sha256: 'sha256-x',
      },
    },
  };
}

function makeElRuntime(id: string): BibleTranslation {
  return {
    id,
    name: `EL ${id}`,
    abbreviation: id.toUpperCase(),
    language: 'Test Language',
    description: 'autonym',
    copyright: 'Public Domain audio (CC0 1.0)',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 0,
    sizeInMB: 0,
    hasText: false,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'runtime',
    installState: 'remote-only',
    catalog: {
      version: 'v1',
      updatedAt: '',
      audio: {
        strategy: 'el-manifest',
        manifestUrl: '/m.json',
        audioVersion: 'v1',
        catalogBaseUrl: 'https://lqd-media.example.com',
        fileExtension: 'mp3',
      },
    },
    activeDownloadJob: null,
  };
}

test('flag off / resolver null → zero EL work and the base list is applied unchanged', async () => {
  let elStepInvoked = false;
  const elStep: ElBootstrapStep = async () => {
    elStepInvoked = true;
    return [];
  };

  const applied: BibleTranslation[][] = [];
  const base = [makeSupabaseRuntime('niv')];

  await applyElRuntimeCatalog(base, {
    resolveUrl: () => null, // flag off / unconfigured
    elStep,
    applyRuntimeCatalog: (list) => applied.push(list),
  });

  assert.equal(
    elStepInvoked,
    false,
    'the heavy EL step must not be reached when the resolver is null'
  );
  // Nothing to merge: applyElRuntimeCatalog performs no extra apply (Supabase apply already happened).
  assert.equal(applied.length, 0);
});

test('EL catalog fetched + mapped + applied on success, combined with the base list (both survive)', async () => {
  const base = [makeSupabaseRuntime('niv')];
  const el = [makeElRuntime('lqdtest')];

  let applied: BibleTranslation[] | null = null;
  await applyElRuntimeCatalog(base, {
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => el,
    applyRuntimeCatalog: (list) => {
      applied = list;
    },
  });

  assert.ok(applied, 'a combined apply must occur when EL translations resolve');
  const ids = (applied as BibleTranslation[]).map((t) => t.id).sort();
  assert.deepEqual(
    ids,
    ['lqdtest', 'niv'],
    'both Supabase and EL runtime entries survive the combined apply'
  );
});

test('EL failure leaves the base (Supabase) translations intact and performs no EL apply', async () => {
  const base = [makeSupabaseRuntime('niv')];
  let applyCount = 0;

  await applyElRuntimeCatalog(base, {
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => {
      throw new Error('network exploded');
    },
    applyRuntimeCatalog: () => {
      applyCount += 1;
    },
  });

  assert.equal(
    applyCount,
    0,
    'a thrown EL step must never trigger a re-apply that could disturb the base list'
  );
});

test('EL step returning an empty list performs no re-apply (nothing to add)', async () => {
  const base = [makeSupabaseRuntime('niv')];
  let applyCount = 0;

  await applyElRuntimeCatalog(base, {
    resolveUrl: () => 'https://lqd-media.example.com/catalog.dev.json',
    elStep: async () => [],
    applyRuntimeCatalog: () => {
      applyCount += 1;
    },
  });

  assert.equal(applyCount, 0);
});
