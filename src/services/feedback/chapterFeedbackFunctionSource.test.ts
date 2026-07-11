import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FUNCTION_PATH = path.join(REPO_ROOT, 'supabase/functions/submit-chapter-feedback/index.ts');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

test('submit-chapter-feedback stores feedback in Supabase without Google Sheets export', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.match(
    source,
    /\.from\('chapter_feedback_submissions'\)[\s\S]*\.insert\(insertPayload\)/,
    'Expected the feedback edge function to insert into chapter_feedback_submissions'
  );
  assert.doesNotMatch(
    source,
    /GOOGLE_|Sheets|spreadsheet|appendSheetRow/,
    'Expected the feedback edge function to avoid the retired Google Sheets export path'
  );
});

test('submit-chapter-feedback accepts any participant with a name and project role', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.equal(
    source.includes('participantIdNumber?:'),
    false,
    'submit-chapter-feedback should not accept a manual participantIdNumber from the client payload'
  );
  assert.doesNotMatch(
    source,
    /if \(!userId\)[\s\S]*jsonResponse\(401/,
    'submit-chapter-feedback should not require an authenticated account'
  );
  assert.doesNotMatch(
    source,
    /\.from\('user_preferences'\)/,
    'submit-chapter-feedback should not gate feedback on an account preference'
  );
  assert.match(
    source,
    /participantName and participantRole are required/,
    'submit-chapter-feedback should require the participant name and project role'
  );
  assert.match(
    source,
    /participant_name:\s*participantName/,
    'submit-chapter-feedback should persist the validated participant name'
  );
  assert.match(
    source,
    /participant_role:\s*participantRole/,
    'submit-chapter-feedback should persist the validated participant role'
  );
});

test('submit-chapter-feedback validates the book and chapter against the canon and rate-limits', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.match(
    source,
    /BOOK_CHAPTER_COUNTS/,
    'submit-chapter-feedback should validate book_id against the canonical book list (S6)'
  );
  assert.match(
    source,
    /chapter is out of range for this book/,
    "submit-chapter-feedback should reject chapters beyond a book's chapter count (S6)"
  );
  assert.match(
    source,
    /SUBMISSION_RATE_LIMIT_PER_HOUR/,
    'submit-chapter-feedback should throttle submissions'
  );
  assert.match(
    source,
    /participant_name[\s\S]*participant_role/,
    'submit-chapter-feedback should also throttle anonymous submissions by their required identity'
  );
  assert.match(
    source,
    /\.storage\.from\('chapter-feedback-audio'\)\.remove\(\[uploadedAudioPath\]\)/,
    'submit-chapter-feedback should delete orphaned audio when the row insert fails (S7)'
  );
});

test('submit-chapter-feedback accepts audio upload data through service-role storage upload', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.match(source, /interface ChapterFeedbackAudioRequest/);
  assert.doesNotMatch(source, /audio responses require an authenticated user/);
  assert.match(source, /base64Data\?: string/);
  assert.match(source, /audio responses must include upload data/);
  assert.match(source, /\.storage[\s\S]*\.from\('chapter-feedback-audio'\)[\s\S]*\.upload/);
  assert.match(source, /audioResponse\.bucket !== 'chapter-feedback-audio'/);
  assert.match(source, /buildStoredAudioPath\(body,\s*userId\)/);
  assert.equal(source.includes('preuploadedAudioPath.startsWith(`${userId}/`)'), true);
  assert.match(source, /AUDIO_RESPONSE_MIME_TYPE = 'audio\/mp4'/);
  assert.match(source, /audioResponse\.mimeType !== AUDIO_RESPONSE_MIME_TYPE/);
  assert.match(source, /audio_response_duration_ms/);
});

test('submit-chapter-feedback bounds anonymous audio before service-role upload', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.match(
    source,
    /AUDIO_RESPONSE_MAX_DURATION_MS = 60000/,
    'Expected the Edge Function to cap audio responses at 60 seconds'
  );
  assert.match(
    source,
    /AUDIO_RESPONSE_MAX_SIZE_BYTES = 5 \* 1024 \* 1024/,
    'Expected the Edge Function to cap decoded audio responses at 5 MB'
  );
  assert.match(
    source,
    /AUDIO_RESPONSE_MAX_BASE64_LENGTH/,
    'Expected the Edge Function to reject oversized base64 before decoding'
  );
  assert.match(
    source,
    /decodedSizeBytes == null \|\| decodedSizeBytes > AUDIO_RESPONSE_MAX_SIZE_BYTES/,
    'Expected invalid or oversized base64 payloads to fail before upload'
  );
});

test('submit-chapter-feedback disables the legacy edge JWT gate and enriches auth only when present', () => {
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
    'Expected submit-chapter-feedback to load the anon key for optional request-scoped auth lookup'
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
  assert.doesNotMatch(
    source,
    /Sign in to send chapter feedback/,
    'Expected submit-chapter-feedback not to block participants who do not have an account'
  );
});
