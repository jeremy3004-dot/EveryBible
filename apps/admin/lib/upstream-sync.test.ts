/**
 * The upstream translation sync (lib/upstream-sync.ts) loaded through the real
 * module loader. Only the Supabase service client (an in-memory table fake),
 * the server env, the network and the clock are replaced.
 */
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';

import { mockModule } from './testing/adminTestHarness';

type Row = Record<string, unknown>;
type Write = { table: string; operation: string; values: Row };
type QueryResult = { data: Row[] | null; error: { message: string } | null };
const now = '2026-09-05T12:00:00.000Z';
const publishedAt = '2024-01-15T12:00:00.000Z';
// Operator-only columns live in translation_catalog_admin, which client roles cannot read.
const ADMIN_ONLY_COLUMNS = [
  'admin_notes',
  'upstream_payload',
  'upstream_external_id',
  'sync_run_id',
];

// An in-memory stand-in for the tables the sync reads and writes.
function createSyncFixture({
  payload,
  catalog = [],
  admin = [],
  versions = [],
  finishError = false,
  beforeCatalogWrite,
}: {
  payload: unknown;
  catalog?: Row[];
  admin?: Row[];
  versions?: Row[];
  finishError?: boolean;
  beforeCatalogWrite?: (rows: Record<string, Row[]>) => void;
}) {
  const rows: Record<string, Row[]> = {
    translation_catalog: structuredClone(catalog),
    translation_catalog_admin: structuredClone(admin),
    translation_versions: structuredClone(versions),
    translation_sync_runs: [],
  };
  const writes: Write[] = [];
  const service = {
    from(table: string) {
      let operation = 'select';
      let values: Row = {};
      let columns = '*';
      let matches = (_row: Row) => true;
      const query = {
        select(selection: string) {
          columns = selection;
          return query;
        },
        in(column: string, items: unknown[]) {
          matches = (row: Row) => items.includes(row[column]);
          return query;
        },
        eq(column: string, value: unknown) {
          matches = (row: Row) => row[column] === value;
          return query;
        },
        insert(value: Row) {
          operation = 'insert';
          values = value;
          return query;
        },
        upsert(value: Row) {
          operation = 'upsert';
          values = value;
          return query;
        },
        update(value: Row) {
          operation = 'update';
          values = value;
          return query;
        },
        async single() {
          assert.equal(table, 'translation_sync_runs');
          assert.equal(operation, 'insert');
          rows[table].push({ ...values, id: 'run-1' });
          return { data: { id: 'run-1' }, error: null };
        },
        then(resolve: (result: QueryResult) => unknown) {
          if (operation === 'select') {
            const selected = rows[table]
              .filter(matches)
              .map((row) =>
                Object.fromEntries(columns.split(',').map((column) => [column, row[column]]))
              );
            return Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve);
          }
          writes.push({ table, operation, values: JSON.parse(JSON.stringify(values)) });
          if (table === 'translation_catalog') beforeCatalogWrite?.(rows);
          if (finishError && table === 'translation_sync_runs' && values.state === 'succeeded') {
            return Promise.resolve({
              data: null,
              error: { message: 'finalization unavailable' },
            }).then(resolve);
          }
          if (operation === 'update') {
            for (const row of rows[table].filter(matches)) Object.assign(row, values);
          } else {
            const existing = rows[table].find(
              (row) =>
                row.translation_id === values.translation_id &&
                (table !== 'translation_versions' || row.version_number === values.version_number)
            );
            if (existing && operation === 'insert') {
              return Promise.resolve({ data: null, error: { message: 'duplicate key' } }).then(
                resolve
              );
            }
            if (existing) Object.assign(existing, values);
            else rows[table].push({ ...values });
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { rows, writes, service, payload };
}

type SyncFixture = ReturnType<typeof createSyncFixture>;
let current: SyncFixture | null = null;
const upstreamRequests: Array<{ url: string; init: RequestInit | undefined }> = [];

mockModule(mock, '@/lib/supabase/service', {
  createAdminServiceClient: () => {
    assert.ok(current, 'a test must install a sync fixture first');
    return current.service;
  },
});
mockModule(mock, '@/lib/env', {
  getAdminServerEnv: () => ({
    upstreamApiBaseUrl: 'https://upstream.example',
    upstreamApiKey: 'test-key',
  }),
});

const { runUpstreamTranslationSync } = await import('./upstream-sync');

beforeEach(() => {
  current = null;
  upstreamRequests.length = 0;
  mock.timers.enable({ apis: ['Date'], now: new Date(now) });
  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    upstreamRequests.push({ url, init });
    assert.ok(current);
    return Response.json(current.payload);
  });
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

function syncFixture(options: Parameters<typeof createSyncFixture>[0]) {
  const fixture = createSyncFixture(options);
  current = fixture;
  return { ...fixture, run: (actor: string | null) => runUpstreamTranslationSync(actor) };
}

for (const distributionState of ['hidden', 'published', 'draft', 'ready']) {
  for (const conflictingControls of [false, true]) {
    test(`sync preserves ${distributionState} operator controls with ${conflictingControls ? 'conflicting' : 'missing'} upstream controls`, async () => {
      const fixture = syncFixture({
        catalog: [
          {
            translation_id: 'eng',
            catalog: null,
            distribution_state: distributionState,
            is_available: false,
          },
        ],
        admin: [{ translation_id: 'eng', admin_notes: 'Local review required' }],
        payload: [
          {
            translation_id: 'eng',
            name: 'Updated upstream name',
            ...(conflictingControls
              ? {
                  distribution_state: 'published',
                  is_available: true,
                  admin_notes: 'Upstream notes',
                }
              : {}),
          },
        ],
      });
      await fixture.run(null);
      const row = fixture.rows.translation_catalog[0];
      assert.equal(row.name, 'Updated upstream name');
      assert.equal(row.distribution_state, distributionState);
      assert.equal(row.is_available, false);
      assert.equal(fixture.rows.translation_catalog_admin[0].admin_notes, 'Local review required');
      const write = fixture.writes.find((entry) => entry.table === 'translation_catalog')!;
      for (const key of ['distribution_state', 'is_available', ...ADMIN_ONLY_COLUMNS]) {
        assert.equal(
          Object.hasOwn(write.values, key),
          false,
          `${key} must be omitted from existing-row catalog writes`
        );
      }
      const adminWrite = fixture.writes.find(
        (entry) => entry.table === 'translation_catalog_admin'
      )!;
      assert.equal(adminWrite.operation, 'upsert');
      assert.equal(
        Object.hasOwn(adminWrite.values, 'admin_notes'),
        false,
        'admin_notes must be omitted from existing-row side-table writes'
      );
    });
  }
}

test('sync preserves operator edits made after the catalog read', async () => {
  const fixture = syncFixture({
    catalog: [
      {
        translation_id: 'eng',
        catalog: {},
        distribution_state: 'ready',
        is_available: true,
      },
    ],
    admin: [{ translation_id: 'eng', admin_notes: null }],
    payload: [{ translation_id: 'eng' }],
    beforeCatalogWrite(rows) {
      Object.assign(rows.translation_catalog[0], {
        distribution_state: 'hidden',
        is_available: false,
      });
      Object.assign(rows.translation_catalog_admin[0], { admin_notes: 'Changed during sync' });
    },
  });
  await fixture.run(null);
  assert.equal(fixture.rows.translation_catalog[0].distribution_state, 'hidden');
  assert.equal(fixture.rows.translation_catalog[0].is_available, false);
  assert.equal(fixture.rows.translation_catalog_admin[0].admin_notes, 'Changed during sync');
});

test('sync records upstream identity, payload and run on the admin-only side table', async () => {
  const fixture = syncFixture({
    catalog: [{ translation_id: 'eng', catalog: {} }],
    admin: [{ translation_id: 'eng', admin_notes: 'Keep', upstream_payload: { stale: true } }],
    payload: [{ translation_id: 'eng', external_id: 'up-7', name: 'English' }],
  });
  await fixture.run(null);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.rows.translation_catalog_admin)), [
    {
      translation_id: 'eng',
      admin_notes: 'Keep',
      upstream_payload: { translation_id: 'eng', external_id: 'up-7', name: 'English' },
      sync_run_id: 'run-1',
      upstream_external_id: 'up-7',
    },
  ]);
  for (const column of ADMIN_ONLY_COLUMNS) {
    assert.equal(Object.hasOwn(fixture.rows.translation_catalog[0], column), false, column);
  }
});

for (const incomingVersions of [undefined, [{ version_number: 1 }]]) {
  test(`sparse sync preserves original version metadata with ${incomingVersions ? 'explicit' : 'implicit'} versions`, async () => {
    const version = {
      translation_id: 'eng',
      version_number: 1,
      published_at: publishedAt,
      changelog: 'Original release',
      data_checksum: 'checksum',
      total_books: 66,
      total_chapters: 1189,
      total_verses: 31102,
      is_current: true,
    };
    const fixture = syncFixture({
      payload: [{ translation_id: 'eng', versions: incomingVersions }],
      catalog: [{ translation_id: 'eng', catalog: {} }],
      versions: [version, { ...version, version_number: 2, is_current: false }],
    });
    await fixture.run(null);
    assert.equal(fixture.rows.translation_versions[0].published_at, publishedAt);
    assert.deepEqual(fixture.rows.translation_versions, [
      version,
      { ...version, version_number: 2, is_current: false },
    ]);
  });
}

test('sync merges partial catalog sections and preserves sections omitted upstream', async () => {
  const fixture = syncFixture({
    catalog: [
      {
        translation_id: 'eng',
        catalog: {
          text: { url: 'text-pack', checksum: 'old' },
          audio: { url: 'audio-pack', format: 'mp3' },
          timing: { url: 'timings' },
          localMetadata: true,
        },
      },
    ],
    payload: [
      {
        translation_id: 'eng',
        catalog: { text: { checksum: 'new' }, audio: { format: 'opus' }, source: 'upstream' },
      },
    ],
  });
  await fixture.run(null);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.rows.translation_catalog[0].catalog)), {
    text: { url: 'text-pack', checksum: 'new' },
    audio: { url: 'audio-pack', format: 'opus' },
    timing: { url: 'timings' },
    localMetadata: true,
    source: 'upstream',
  });
});

test('new catalog rows keep default controls and only new versions receive the sync timestamp', async () => {
  const fixture = syncFixture({
    catalog: [{ translation_id: 'eng', catalog: {} }],
    payload: [
      { translation_id: 'new' },
      { translation_id: 'eng', versions: [{ version_number: 2 }] },
    ],
    versions: [{ translation_id: 'eng', version_number: 1, published_at: publishedAt }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await fixture.run('admin-user'))), {
    insertedCount: 1,
    updatedCount: 1,
    runId: 'run-1',
  });
  const added = fixture.rows.translation_catalog.find((row) => row.translation_id === 'new')!;
  assert.equal(added.distribution_state, 'ready');
  assert.equal(added.is_available, true);
  for (const column of ADMIN_ONLY_COLUMNS) {
    assert.equal(
      Object.hasOwn(added, column),
      false,
      `${column} must not be written to the catalog`
    );
  }
  const addedAdmin = fixture.rows.translation_catalog_admin.find(
    (row) => row.translation_id === 'new'
  )!;
  assert.deepEqual(JSON.parse(JSON.stringify(addedAdmin)), {
    admin_notes: null,
    sync_run_id: 'run-1',
    translation_id: 'new',
    upstream_external_id: null,
    upstream_payload: { translation_id: 'new' },
  });
  assert.deepEqual(
    fixture.rows.translation_versions.map((row) => row.published_at),
    [publishedAt, now, now]
  );
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'succeeded');
  assert.equal(fixture.rows.translation_sync_runs[0].triggered_by, 'admin-user');
  assert.deepEqual(
    upstreamRequests.map(({ url, init }) => [url, init?.cache, init?.headers]),
    [
      [
        'https://upstream.example/translations',
        'no-store',
        {
          Accept: 'application/json',
          Authorization: 'Bearer test-key',
          'x-api-key': 'test-key',
        },
      ],
    ]
  );
});

test('new rows accept initial upstream controls and explicit version publication dates', async () => {
  const fixture = syncFixture({
    payload: [
      {
        translationId: 'new',
        distributionState: 'hidden',
        isAvailable: false,
        adminNotes: 'Initial note',
        versions: [{ publishedAt, versionNumber: 3 }],
      },
    ],
  });
  await fixture.run(null);
  assert.equal(fixture.rows.translation_catalog[0].distribution_state, 'hidden');
  assert.equal(fixture.rows.translation_catalog[0].is_available, false);
  assert.equal(fixture.rows.translation_catalog_admin[0].admin_notes, 'Initial note');
  assert.equal(fixture.rows.translation_versions[0].published_at, publishedAt);
});

test('explicit upstream publication date refreshes an existing version', async () => {
  const fixture = syncFixture({
    catalog: [{ translation_id: 'eng', catalog: {} }],
    versions: [{ translation_id: 'eng', version_number: 1, published_at: publishedAt }],
    payload: [
      {
        translation_id: 'eng',
        versions: [{ version_number: 1, published_at: '2025-02-01T00:00:00.000Z' }],
      },
    ],
  });
  await fixture.run(null);
  assert.equal(fixture.rows.translation_versions[0].published_at, '2025-02-01T00:00:00.000Z');
});

test('sync rejects when recording successful completion fails', async () => {
  const fixture = syncFixture({ payload: [{ translation_id: 'eng' }], finishError: true });
  await assert.rejects(fixture.run(null), /Unable to finish sync run: finalization unavailable/);
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'failed');
  assert.match(String(fixture.rows.translation_sync_runs[0].message), /finalization unavailable/);
});

test('a concurrently created catalog row is not overwritten by initial upstream controls', async () => {
  const fixture = syncFixture({
    payload: [{ translation_id: 'eng', distribution_state: 'published', is_available: true }],
    beforeCatalogWrite(rows) {
      rows.translation_catalog.push({
        translation_id: 'eng',
        distribution_state: 'hidden',
        is_available: false,
      });
      rows.translation_catalog_admin.push({
        translation_id: 'eng',
        admin_notes: 'Created by operator during sync',
      });
    },
  });
  await assert.rejects(fixture.run(null), /Unable to save translation eng: duplicate key/);
  assert.equal(fixture.rows.translation_catalog[0].distribution_state, 'hidden');
  assert.equal(fixture.rows.translation_catalog[0].is_available, false);
  assert.deepEqual(fixture.rows.translation_catalog_admin, [
    { translation_id: 'eng', admin_notes: 'Created by operator during sync' },
  ]);
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'failed');
});
