import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChapterFeedbackSubmission, UserPreferences } from '../supabase/types';

// Migration SQL and the ops runbook are checked as text (non-TS artefacts).
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

// Type-level contract, enforced by `npm run typecheck`: the Supabase row types expose
// the preference flag and the feedback record with its audio metadata.
test('chapter feedback backend contract is wired into the Supabase row types', () => {
  const preference: Pick<UserPreferences, 'chapter_feedback_enabled'> = {
    chapter_feedback_enabled: false,
  };
  const submission: Pick<ChapterFeedbackSubmission, 'audio_response_path'> = {
    audio_response_path: null,
  };
  assert.deepEqual(
    [preference, submission],
    [{ chapter_feedback_enabled: false }, { audio_response_path: null }]
  );
});

// The submit function's behaviour (row shape, required name and role, no manufactured id
// number, audio upload, export_status, no Sheets export) runs on the real function in
// supabase/functions/submit-chapter-feedback/index.test.ts.
test('the chapter feedback ops doc describes the Supabase admin review pipeline', () => {
  const docsPath = 'docs/chapter-feedback-ops.md';

  assert.equal(
    existsSync(resolveRepoPath(docsPath)),
    true,
    'Expected an operator runbook for the chapter feedback pipeline'
  );

  const docs = readRepoFile(docsPath);

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

// Resolutions, translation-scoped mutations and the chapter summary run on the real function
// in supabase/functions/review-chapter-feedback/resolutions.test.ts and teamAccess.test.ts;
// the review payload never carrying the submitter's auth UUID is reviewPayload.test.ts.
