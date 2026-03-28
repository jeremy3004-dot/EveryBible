import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const resolveRepoPath = (relativePath: string): string => path.join(REPO_ROOT, relativePath);

const readRepoFile = (relativePath: string): string =>
  readFileSync(resolveRepoPath(relativePath), 'utf8');

test('chapter feedback backend migration creates the durable preference flag and submission table', () => {
  const migrationPath = 'supabase/migrations/20260327190000_create_chapter_feedback_pipeline.sql';

  assert.equal(
    existsSync(resolveRepoPath(migrationPath)),
    true,
    'Expected a dedicated migration for the chapter feedback pipeline'
  );

  const migration = readRepoFile(migrationPath);

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS chapter_feedback_enabled BOOLEAN NOT NULL DEFAULT FALSE/,
    'Expected user_preferences to gain an off-by-default chapter_feedback_enabled column'
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.chapter_feedback_submissions/,
    'Expected the migration to create the chapter_feedback_submissions table'
  );
  assert.match(
    migration,
    /CHECK \(sentiment IN \('up', 'down'\)\)/,
    'Expected the migration to lock sentiment to thumbs up or thumbs down'
  );
  assert.match(
    migration,
    /CHECK \(export_status IN \('pending', 'exported', 'failed'\)\)/,
    'Expected the migration to track export_status for spreadsheet delivery'
  );
});

test('chapter feedback backend contract is wired into Supabase types and synced preferences', () => {
  const supabaseTypes = readRepoFile('src/services/supabase/types.ts');
  const syncService = readRepoFile('src/services/sync/syncService.ts');

  assert.match(
    supabaseTypes,
    /chapter_feedback_enabled/,
    'Expected Supabase user preference types to include chapter_feedback_enabled'
  );
  assert.match(
    supabaseTypes,
    /export interface ChapterFeedbackSubmission/,
    'Expected Supabase types to expose a ChapterFeedbackSubmission record'
  );
  assert.match(
    syncService,
    /chapter_feedback_enabled/,
    'Expected syncPreferences to read and write the chapter feedback flag'
  );
});

test('chapter feedback function and ops doc preserve the Supabase-first export contract', () => {
  const functionPath = 'supabase/functions/submit-chapter-feedback/index.ts';
  const docsPath = 'docs/chapter-feedback-ops.md';

  assert.equal(
    existsSync(resolveRepoPath(functionPath)),
    true,
    'Expected a submit-chapter-feedback Edge Function implementation'
  );
  assert.equal(
    existsSync(resolveRepoPath(docsPath)),
    true,
    'Expected an operator runbook for the chapter feedback pipeline'
  );

  const functionSource = readRepoFile(functionPath);
  const docs = readRepoFile(docsPath);

  assert.match(
    functionSource,
    /chapter_feedback_submissions/,
    'Expected the Edge Function to insert into chapter_feedback_submissions before export'
  );
  assert.match(
    functionSource,
    /GOOGLE_SHEETS_SPREADSHEET_ID/,
    'Expected the Edge Function to read the Google Sheets spreadsheet ID from secrets'
  );
  assert.match(
    functionSource,
    /export_status/,
    'Expected the Edge Function to update export_status after attempting spreadsheet export'
  );
  assert.match(
    docs,
    /GOOGLE_SHEETS_SPREADSHEET_ID/,
    'Expected the ops doc to list the required Google Sheets secrets'
  );
  assert.match(
    docs,
    /export_status='failed'|export_status = 'failed'/,
    'Expected the ops doc to describe how operators find failed exports'
  );
});
test('chapter feedback function defers spreadsheet secret lookup until after the feedback row is saved', () => {
  const functionSource = readRepoFile('supabase/functions/submit-chapter-feedback/index.ts');
  const spreadsheetSecretLookup = functionSource.indexOf(
    "getRequiredSecret('GOOGLE_SHEETS_SPREADSHEET_ID')"
  );
  const insertStart = functionSource.indexOf(".from('chapter_feedback_submissions')");

  assert.notEqual(
    spreadsheetSecretLookup,
    -1,
    'Expected the Edge Function to resolve GOOGLE_SHEETS_SPREADSHEET_ID during export'
  );
  assert.notEqual(
    insertStart,
    -1,
    'Expected the Edge Function to insert into chapter_feedback_submissions'
  );
  assert.ok(
    spreadsheetSecretLookup > insertStart,
    'Spreadsheet export secrets should be resolved only after the feedback row is durably saved'
  );
});
