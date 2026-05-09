import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  authorizeAppsmithOpsRequest,
  buildMediaHealthIssues,
  getAppsmithOpsApiKey,
} from './appsmith-ops-utils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const opsSource = readRepoFile('apps/admin/lib/appsmith-ops.ts');
const opsUtilsSource = readRepoFile('apps/admin/lib/appsmith-ops-utils.ts');
const translationRoute = readRepoFile('apps/admin/app/api/ops/appsmith/translations/route.ts');
const mediaRoute = readRepoFile('apps/admin/app/api/ops/appsmith/media-health/route.ts');
const feedbackRoute = readRepoFile('apps/admin/app/api/ops/appsmith/feedback/route.ts');

test('Appsmith ops API uses a dedicated optional API key, not the Supabase service role key', () => {
  assert.match(opsUtilsSource, /APPSMITH_OPS_API_KEY/);
  assert.match(opsUtilsSource, /timingSafeEqual/);
  assert.doesNotMatch(opsSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(opsUtilsSource, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Appsmith ops auth accepts only the dedicated API key', () => {
  const env = {
    APPSMITH_OPS_API_KEY: 'ops-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  };

  assert.equal(getAppsmithOpsApiKey(env), 'ops-secret');
  assert.deepEqual(authorizeAppsmithOpsRequest(new Request('https://example.test'), env), {
    ok: false,
    reason: 'unauthorized',
  });
  assert.deepEqual(
    authorizeAppsmithOpsRequest(
      new Request('https://example.test', {
        headers: { authorization: 'Bearer service-role-secret' },
      }),
      env
    ),
    { ok: false, reason: 'unauthorized' }
  );
  assert.deepEqual(
    authorizeAppsmithOpsRequest(
      new Request('https://example.test', {
        headers: { 'x-api-key': 'ops-secret' },
      }),
      env
    ),
    { ok: true }
  );
});

test('Appsmith ops auth fails closed when the dedicated API key is missing', () => {
  assert.deepEqual(authorizeAppsmithOpsRequest(new Request('https://example.test'), {}), {
    ok: false,
    reason: 'missing_key',
  });
});

test('Appsmith ops routes authorize before loading service-role-backed data', () => {
  for (const source of [translationRoute, mediaRoute, feedbackRoute]) {
    assert.match(source, /authorizeAppsmithOpsRequest\(request\)/);
    assert.match(source, /status: auth\.reason === 'missing_key' \? 503 : 401/);
    assert.match(source, /Cache-Control.+no-store, max-age=0/s);
    assert.match(source, /fetchCache = 'force-no-store'/);
    assert.match(source, /revalidate = 0/);
  }
});

test('Appsmith ops routes expose GET handlers only', () => {
  for (const source of [translationRoute, mediaRoute, feedbackRoute]) {
    assert.match(source, /export async function GET\(request: Request\)/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)\(/);
  }
});

test('Appsmith ops data access is read-only', () => {
  assert.match(opsSource, /\.select\(/);
  assert.doesNotMatch(opsSource, /\.(insert|upsert|update|delete|rpc)\(/);
});

test('Appsmith ops responses omit raw internal notes and media delivery values', () => {
  assert.doesNotMatch(opsSource, /adminNotes/);
  assert.doesNotMatch(opsSource, /textDownloadUrl:/);
  assert.doesNotMatch(opsSource, /textSha256:/);
  assert.doesNotMatch(opsSource, /audioBaseUrl:/);
  assert.doesNotMatch(opsSource, /audioDeliveryReference:/);
  assert.match(opsSource, /hasTextDownloadUrl/);
  assert.match(opsSource, /hasAudioDeliveryReference/);
});

test('Appsmith ops feedback endpoint returns triage data without raw user identifiers', () => {
  assert.match(opsSource, /participant_name/);
  assert.match(opsSource, /commentPreview/);
  assert.doesNotMatch(opsSource, /participant_id_number/);
  assert.doesNotMatch(opsSource, /user_id/);
});

test('Appsmith ops media health encodes manifest-policy issue names', () => {
  assert.match(opsUtilsSource, /missing_text_download_url/);
  assert.match(opsUtilsSource, /missing_audio_delivery_reference/);
  assert.match(opsUtilsSource, /available_without_text_or_audio/);
});

test('Appsmith ops media health reducer reports issues without needing Supabase', () => {
  assert.deepEqual(
    buildMediaHealthIssues({
      abbreviation: 'TST',
      catalog: {},
      distribution_state: 'published',
      has_audio: true,
      has_text: true,
      is_available: true,
      language_name: 'Test',
      name: 'Test',
      translation_id: 'test',
      updated_at: '2026-05-09T00:00:00.000Z',
    }),
    [
      'missing_text_download_url',
      'missing_text_sha256',
      'missing_audio_strategy',
      'missing_audio_delivery_reference',
      'missing_audio_file_extension',
      'missing_audio_mime_type',
    ]
  );
});
