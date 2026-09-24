// Non-TypeScript artefact check: reads Supabase migration SQL as text; there is no module to load for it.
// The migration was run against a scratch Postgres (PGlite) before and after, see
// docs/research/account-deletion-data-map-2026-09-24.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260924120000_account_deletion_leftovers.sql'
);

test('a plan assigned by a former group leader no longer blocks deleting that account', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /ALTER COLUMN assigned_by DROP NOT NULL/);
  assert.match(
    sql,
    /FOREIGN KEY \(assigned_by\) REFERENCES public\.profiles\(id\) ON DELETE SET NULL/
  );
});

test('deleting a profile strips identity from kept feedback and purges backup copies', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const column of [
    'participant_name',
    'participant_id_number',
    'client_ip_hash',
    'audio_response_path',
  ]) {
    assert.match(sql, new RegExp(`${column} = NULL`), column);
  }
  assert.match(sql, /namespace\.nspname = 'backups'/);
  assert.match(sql, /BEFORE DELETE ON public\.profiles/);
});
