import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Row = Record<string, unknown>;
type Write = { table: string; operation: string; values: Row };
const now = '2026-09-05T12:00:00.000Z';
const publishedAt = '2024-01-15T12:00:00.000Z';

// Run the real sync module with only Supabase, environment, network, and time replaced.
function createSyncFixture({
  payload,
  catalog = [],
  versions = [],
  finishError = false,
  beforeCatalogWrite,
}: {
  payload: unknown;
  catalog?: Row[];
  versions?: Row[];
  finishError?: boolean;
  beforeCatalogWrite?: (rows: Row[]) => void;
}) {
  const rows: Record<string, Row[]> = {
    translation_catalog: structuredClone(catalog),
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
        then(
          resolve: (result: { data: Row[] | null; error: { message: string } | null }) => unknown
        ) {
          if (operation === 'select') {
            const selected = rows[table]
              .filter(matches)
              .map((row) =>
                Object.fromEntries(columns.split(',').map((column) => [column, row[column]]))
              );
            return Promise.resolve({ data: structuredClone(selected), error: null }).then(resolve);
          }
          writes.push({ table, operation, values: JSON.parse(JSON.stringify(values)) });
          if (table === 'translation_catalog') beforeCatalogWrite?.(rows[table]);
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
  const dependencies: Record<string, unknown> = {
    '@/lib/supabase/service': { createAdminServiceClient: () => service },
    '@/lib/env': {
      getAdminServerEnv: () => ({
        upstreamApiBaseUrl: 'https://upstream.example',
        upstreamApiKey: 'test-key',
      }),
    },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL('./upstream-sync.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  );
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    Date: class extends Date {
      constructor(value?: string | number) {
        super(value ?? now);
      }
    },
    fetch: async () => ({ ok: true, json: async () => payload }),
  });
  return {
    rows,
    writes,
    run: (exports as { runUpstreamTranslationSync: (actor: string | null) => Promise<unknown> })
      .runUpstreamTranslationSync,
  };
}

for (const distributionState of ['hidden', 'published', 'draft', 'ready']) {
  for (const conflictingControls of [false, true]) {
    test(`sync preserves ${distributionState} operator controls with ${conflictingControls ? 'conflicting' : 'missing'} upstream controls`, async () => {
      const fixture = createSyncFixture({
        catalog: [
          {
            translation_id: 'eng',
            catalog: null,
            distribution_state: distributionState,
            is_available: false,
            admin_notes: 'Local review required',
          },
        ],
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
      assert.equal(row.admin_notes, 'Local review required');
      const write = fixture.writes.find((entry) => entry.table === 'translation_catalog')!;
      for (const key of ['distribution_state', 'is_available', 'admin_notes']) {
        assert.equal(
          Object.hasOwn(write.values, key),
          false,
          `${key} must be omitted from existing-row writes`
        );
      }
    });
  }
}

test('sync preserves operator edits made after the catalog read', async () => {
  const fixture = createSyncFixture({
    catalog: [
      {
        translation_id: 'eng',
        catalog: {},
        distribution_state: 'ready',
        is_available: true,
        admin_notes: null,
      },
    ],
    payload: [{ translation_id: 'eng' }],
    beforeCatalogWrite(rows) {
      Object.assign(rows[0], {
        distribution_state: 'hidden',
        is_available: false,
        admin_notes: 'Changed during sync',
      });
    },
  });
  await fixture.run(null);
  assert.equal(fixture.rows.translation_catalog[0].distribution_state, 'hidden');
  assert.equal(fixture.rows.translation_catalog[0].is_available, false);
  assert.equal(fixture.rows.translation_catalog[0].admin_notes, 'Changed during sync');
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
    const fixture = createSyncFixture({
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
  const fixture = createSyncFixture({
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
  const fixture = createSyncFixture({
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
  assert.equal(added.admin_notes, null);
  assert.deepEqual(
    fixture.rows.translation_versions.map((row) => row.published_at),
    [publishedAt, now, now]
  );
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'succeeded');
  assert.equal(fixture.rows.translation_sync_runs[0].triggered_by, 'admin-user');
});

test('new rows accept initial upstream controls and explicit version publication dates', async () => {
  const fixture = createSyncFixture({
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
  assert.equal(fixture.rows.translation_catalog[0].admin_notes, 'Initial note');
  assert.equal(fixture.rows.translation_versions[0].published_at, publishedAt);
});

test('explicit upstream publication date refreshes an existing version', async () => {
  const fixture = createSyncFixture({
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
  const fixture = createSyncFixture({ payload: [{ translation_id: 'eng' }], finishError: true });
  await assert.rejects(fixture.run(null), /Unable to finish sync run: finalization unavailable/);
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'failed');
  assert.match(String(fixture.rows.translation_sync_runs[0].message), /finalization unavailable/);
});

test('a concurrently created catalog row is not overwritten by initial upstream controls', async () => {
  const fixture = createSyncFixture({
    payload: [{ translation_id: 'eng', distribution_state: 'published', is_available: true }],
    beforeCatalogWrite(rows) {
      rows.push({
        translation_id: 'eng',
        distribution_state: 'hidden',
        is_available: false,
        admin_notes: 'Created by operator during sync',
      });
    },
  });
  await assert.rejects(fixture.run(null), /Unable to save translation eng: duplicate key/);
  assert.equal(fixture.rows.translation_catalog[0].distribution_state, 'hidden');
  assert.equal(fixture.rows.translation_catalog[0].is_available, false);
  assert.equal(fixture.rows.translation_catalog[0].admin_notes, 'Created by operator during sync');
  assert.equal(fixture.rows.translation_sync_runs[0].state, 'failed');
});
