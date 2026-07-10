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
  const audioMigrationPath =
    'supabase/migrations/20260521120000_add_chapter_feedback_audio_responses.sql';
  const councilFixMigrationPath =
    'supabase/migrations/20260522164000_add_chapter_feedback_scripture_council_fix_status.sql';
  const reviewSummaryMigrationPath =
    'supabase/migrations/20260523051500_add_chapter_feedback_review_summary_index.sql';

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
  assert.equal(
    existsSync(resolveRepoPath(audioMigrationPath)),
    true,
    'Expected a follow-up migration for chapter feedback audio responses'
  );
  assert.equal(
    existsSync(resolveRepoPath(councilFixMigrationPath)),
    true,
    'Expected a follow-up migration for Scripture Council fix tracking'
  );
  assert.equal(
    existsSync(resolveRepoPath(reviewSummaryMigrationPath)),
    true,
    'Expected a follow-up migration for translator feedback summary review'
  );

  const migration = readRepoFile(migrationPath);
  const identityMigration = readRepoFile(identityMigrationPath);
  const audioMigration = readRepoFile(audioMigrationPath);
  const councilFixMigration = readRepoFile(councilFixMigrationPath);
  const reviewSummaryMigration = readRepoFile(reviewSummaryMigrationPath);

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
    'Expected the legacy migration to keep export_status compatible with existing databases'
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
  assert.match(
    audioMigration,
    /chapter-feedback-audio/,
    'Expected a private storage bucket for chapter feedback audio responses'
  );
  assert.match(
    audioMigration,
    /audio_response_path/,
    'Expected chapter_feedback_submissions to store the audio storage path'
  );
  assert.match(
    audioMigration,
    /audio_response_duration_ms/,
    'Expected chapter_feedback_submissions to store the audio duration'
  );
  assert.match(
    councilFixMigration,
    /scripture_council_fixed_at/,
    'Expected chapter feedback rows to store when a translator marks council feedback fixed'
  );
  assert.match(
    councilFixMigration,
    /scripture_council_fixed_by/,
    'Expected chapter feedback rows to store who marked council feedback fixed'
  );
  assert.match(
    reviewSummaryMigration,
    /translation_id, book_id, chapter, created_at DESC/,
    'Expected translator review summaries to have an index for book and chapter badges'
  );
});

test('review-chapter-feedback returns server-computed unresolved counts per chapter', () => {
  const reviewFunction = readRepoFile('supabase/functions/review-chapter-feedback/index.ts');

  assert.match(
    reviewFunction,
    /ChapterFeedbackSummaryRow/,
    'Expected the translator review function to model summary rows'
  );
  assert.match(
    reviewFunction,
    /chapters: Array\.from\(summaryByChapter\.values\(\)\)/,
    'Expected the translator review function to return grouped chapter summaries'
  );
  assert.match(
    reviewFunction,
    /unresolvedDown/,
    'Expected chapter summaries to expose unresolved counts computed from server resolution state'
  );
});

test('review-chapter-feedback persists translator resolutions server-side', () => {
  const reviewFunction = readRepoFile('supabase/functions/review-chapter-feedback/index.ts');

  assert.match(
    reviewFunction,
    /action === 'resolve'/,
    'Expected the review function to accept a resolve action'
  );
  assert.match(
    reviewFunction,
    /action === 'reopen'/,
    'Expected the review function to accept a reopen action'
  );
  assert.match(
    reviewFunction,
    /scripture_council_resolution/,
    'Expected resolutions to write the scripture_council_resolution column'
  );
  assert.match(
    reviewFunction,
    /scripture_council_fixed_at/,
    'Expected resolutions to stamp scripture_council_fixed_at server-side'
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
    supabaseTypes,
    /audio_response_path/,
    'Expected Supabase feedback types to expose audio response metadata'
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

test('chapter feedback function and ops doc preserve the Supabase admin review contract', () => {
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
    /participant_id_number:\s*trimOptionalText\(prefs\.chapter_feedback_id_number\)/,
    'Expected the Edge Function to source the reviewer id number from server preferences, not the auth UUID (S4)'
  );
  assert.match(
    functionSource,
    /audio_response_path/,
    'Expected the Edge Function to persist audio response metadata'
  );
  assert.match(
    functionSource,
    /audio responses must include upload data/,
    'Expected audio submissions to upload through the Edge Function'
  );
  assert.match(
    functionSource,
    /export_status:\s*'exported'/,
    'Expected the Edge Function to mark database-saved feedback as ready for admin review'
  );
  assert.doesNotMatch(
    functionSource,
    /GOOGLE_SHEETS_SPREADSHEET_ID|createGoogleAccessToken|appendSheetRow/,
    'Expected the Edge Function to avoid the retired Google Sheets export path'
  );
  assert.doesNotMatch(
    docs,
    /GOOGLE_SHEETS_SPREADSHEET_ID|GOOGLE_SERVICE_ACCOUNT/,
    'Expected the ops doc to stop requiring Google Sheets secrets'
  );
  assert.match(
    docs,
    /admin backend|admin/i,
    'Expected the ops doc to describe admin backend review'
  );
  assert.match(
    docs,
    /UUID|authenticated user|anonymous/i,
    'Expected the ops doc to explain reviewer identity for authenticated or anonymous submissions'
  );
  assert.match(
    docs,
    /chapter-feedback-audio|audio-message/i,
    'Expected the ops doc to describe audio response storage and review'
  );
});
