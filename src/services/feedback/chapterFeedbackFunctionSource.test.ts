import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FUNCTION_PATH = path.join(
  REPO_ROOT,
  'supabase/functions/submit-chapter-feedback/index.ts'
);
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

test('submit-chapter-feedback defers spreadsheet secret lookup until after the Supabase row is saved', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');
  const spreadsheetSecretLookup = source.indexOf(
    "getRequiredSecret('GOOGLE_SHEETS_SPREADSHEET_ID')"
  );
  const insertStart = source.indexOf(".from('chapter_feedback_submissions')");

  assert.notEqual(
    spreadsheetSecretLookup,
    -1,
    'Expected the feedback edge function to require a spreadsheet ID during export'
  );
  assert.notEqual(
    insertStart,
    -1,
    'Expected the feedback edge function to insert into chapter_feedback_submissions'
  );
  assert.ok(
    spreadsheetSecretLookup > insertStart,
    'Spreadsheet export secrets should be resolved only after the feedback row is durably saved'
  );
});

test('submit-chapter-feedback appends reviewer identity columns to the Google Sheet header', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.match(
    source,
    /participant_name[\s\S]*participant_role[\s\S]*participant_id_number[\s\S]*interface_language/s,
    'Expected the Google Sheet header and row append to include reviewer identity columns before interface language'
  );
  assert.match(
    source,
    /A:R/,
    'Expected the exported sheet range to expand for the extra reviewer identity columns'
  );
});

test('submit-chapter-feedback disables the legacy edge JWT gate and authenticates inside the function', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');
  const config = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    config,
    /\[functions\.submit-chapter-feedback\][\s\S]*verify_jwt\s*=\s*false/,
    'Expected submit-chapter-feedback to opt out of the legacy verify_jwt runtime gate'
  );
  assert.match(
    source,
    /getRequiredSecret\('SUPABASE_ANON_KEY'\)/,
    'Expected submit-chapter-feedback to load the anon key for request-scoped auth verification'
  );
  assert.match(
    source,
    /createClient\(supabaseUrl,\s*anonKey/,
    'Expected submit-chapter-feedback to create a dedicated auth client with the anon key'
  );
  assert.match(
    source,
    /createClient\(supabaseUrl,\s*serviceRoleKey/,
    'Expected submit-chapter-feedback to keep a separate service-role client for admin writes'
  );
});
