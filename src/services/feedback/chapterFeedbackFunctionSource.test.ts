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
