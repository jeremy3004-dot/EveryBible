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
  const identityMigrationPath =
    'supabase/migrations/20260328180000_add_chapter_feedback_identity.sql';

  assert.equal(
    existsSync(resolveRepoPath(migrationPath)),
    true,
    'Expected a dedicated migration for the chapter feedback pipeline'
  );
  assert.equal(
    existsSync(resolveRepoPath(identityMigrationPath)),
    true,
    'Expected a follow-up migration for the chapter feedback identity fields'
  );

  const migration = readRepoFile(migrationPath);
  const identityMigration = readRepoFile(identityMigrationPath);

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
  assert.match(
    identityMigration,
    /ADD COLUMN IF NOT EXISTS chapter_feedback_name TEXT/,
    'Expected user_preferences to store the reviewer name'
  );
  assert.match(
    identityMigration,
    /ADD COLUMN IF NOT EXISTS chapter_feedback_role TEXT/,
    'Expected user_preferences to store the reviewer role'
  );
  assert.match(
    identityMigration,
    /ADD COLUMN IF NOT EXISTS participant_name TEXT/,
    'Expected chapter_feedback_submissions to store the reviewer name'
  );
  assert.match(
    identityMigration,
    /ADD COLUMN IF NOT EXISTS participant_role TEXT/,
    'Expected chapter_feedback_submissions to store the reviewer role'
  );
  assert.match(
    identityMigration,
    /ADD COLUMN IF NOT EXISTS participant_id_number TEXT/,
    'Expected chapter_feedback_submissions to store the reviewer id number'
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
  assert.match(
    syncService,
    /chapterFeedbackName|chapterFeedbackRole/,
    'Expected syncPreferences to preserve the chapter feedback reviewer name and role fields'
  );
  assert.doesNotMatch(
    syncService,
    /chapter_feedback_id_number|chapterFeedbackIdNumber/,
    'Expected syncPreferences to stop persisting a manual feedback ID number field'
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
    /participant_name/,
    'Expected the Edge Function to persist the reviewer name'
  );
  assert.match(
    functionSource,
    /participant_role/,
    'Expected the Edge Function to persist the reviewer role'
  );
  assert.match(
    functionSource,
    /participant_id_number/,
    'Expected the Edge Function to persist the reviewer id number'
  );
  assert.match(
    functionSource,
    /participant_id_number:\s*user\.id/,
    'Expected the Edge Function to derive the reviewer id number from the authenticated Supabase UUID'
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
  assert.match(
    docs,
    /UUID|authenticated user/i,
    'Expected the ops doc to explain that participant_id_number is sourced from the authenticated user UUID'
  );
});
