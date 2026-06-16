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

test('submit-chapter-feedback stores optional reviewer identity and derives user columns only when authenticated', () => {
  const source = readFileSync(FUNCTION_PATH, 'utf8');

  assert.equal(
    source.includes('participantIdNumber?:'),
    false,
    'submit-chapter-feedback should not accept a manual participantIdNumber from the client payload'
  );
  assert.match(
    source,
    /participant_id_number:\s*userId/,
    'submit-chapter-feedback should source participant_id_number from the Supabase user UUID when available'
  );
  assert.doesNotMatch(
    source,
    /participantIdNumber are required|participantIdNumber\)|participantName, and participantRole are required/,
    'submit-chapter-feedback should not require reviewer-entered identity fields'
  );
  assert.match(
    source,
    /let userId:\s*string \| null = null/,
    'submit-chapter-feedback should allow anonymous feedback rows'
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

test('submit-chapter-feedback disables the legacy edge JWT gate and only enriches auth when present', () => {
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
    /Missing bearer token|Not authenticated/,
    'Expected submit-chapter-feedback not to block anonymous feedback submissions'
  );
});
