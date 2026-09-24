// Non-TypeScript artefact check: reads the Supabase migration SQL as text; there is no module to load for it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { sharedPasscodeRequestKind } from './translatorAccess';

const MIGRATION = fileURLToPath(
  new URL('../../migrations/20260924150000_translator_shared_passcode_switch.sql', import.meta.url)
);
const sql = readFileSync(MIGRATION, 'utf8')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const checkList = (constraint: string): string[] => {
  const match = new RegExp(`${constraint} check \\(\\w+ in \\(([^)]*)\\)\\)`).exec(sql);
  assert.ok(match, `${constraint} not found`);
  return match[1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''));
};

test('every request kind the function records is allowed by the table check', () => {
  const produced = new Set(
    [
      { validateOnly: true },
      {},
      { action: 'resolve' },
      { action: 'reopen' },
      { action: 'audioUrl' },
      { action: 'positivePreview' },
      { action: 'reviewPositiveIds' },
    ].map(sharedPasscodeRequestKind)
  );
  assert.deepEqual(
    [...produced].sort(),
    checkList('translator_shared_passcode_uses_request_kind_check').sort()
  );
  assert.deepEqual(checkList('translator_shared_passcode_uses_outcome_check').sort(), [
    'allowed',
    'refused',
  ]);
});

test('applying the migration leaves the shared passcode allowed', () => {
  assert.match(sql, /shared_passcode_enabled boolean not null default true/);
  assert.match(
    sql,
    /insert into public\.translator_access_settings \(id, shared_passcode_enabled\) values \(true, true\) on conflict \(id\) do nothing/
  );
});

test('both tables are service-role only', () => {
  for (const table of ['translator_access_settings', 'translator_shared_passcode_uses']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`)
    );
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
    assert.doesNotMatch(sql, new RegExp(`create policy [^;]* on public\\.${table}`));
  }
});

test('the usage table has no column for a passcode, address or user', () => {
  const columns =
    /create table if not exists public\.translator_shared_passcode_uses \((.*?)\);/.exec(sql)?.[1];
  assert.ok(columns);
  const names = [
    ...columns.matchAll(/(?:^ ?|, )(\w+) (?:uuid|timestamptz|text|inet|bigint)\b/g),
  ].map((match) => match[1]);
  assert.deepEqual(names, ['id', 'used_at', 'translation_id', 'request_kind', 'outcome']);
});
