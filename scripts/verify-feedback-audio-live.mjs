// Read-only post-deployment check against the same API used by the mobile reviewer.
// Required env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// (or EXPO_PUBLIC_SUPABASE_ANON_KEY), FEEDBACK_REVIEW_PASSCODE,
// FEEDBACK_AUDIO_CHECKS: JSON array of { feedbackId, translationId, bookId, chapter,
// contributorCategory }. Never print the passcode or signed recording URLs.
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { isFeedbackAudioContainer } from '../supabase/functions/_shared/feedbackAudio.ts';

const { fetch } = globalThis;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const passcode = process.env.FEEDBACK_REVIEW_PASSCODE;
const checks = JSON.parse(process.env.FEEDBACK_AUDIO_CHECKS || '[]');
assert.ok(url && key && passcode, 'Set the API URL, public key, and review passcode');
assert.ok(Array.isArray(checks) && checks.length, 'Supply at least one known recording');

async function review(body) {
  const response = await fetch(`${url}/functions/v1/review-chapter-feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key },
    body: JSON.stringify({ ...body, apiVersion: 2, passcode }),
  });
  assert.equal(response.status, 200, `Review request failed: HTTP ${response.status}`);
  const data = await response.json();
  assert.equal(data.success, true, 'Review request was unsuccessful');
  return data;
}

for (const check of checks) {
  const { feedbackId, translationId, bookId, chapter, contributorCategory } = check;
  const scope = { translationId, bookId, chapter };
  let cursor = null;
  let item;
  do {
    const page = await review({ ...scope, status: 'all', category: 'all', cursor });
    assert.ok(page.summary && Array.isArray(page.feedback), 'Missing v2 review contract');
    item = page.feedback.find((entry) => entry.id === feedbackId);
    cursor = page.nextCursor;
  } while (!item && cursor);
  assert.ok(item?.audioResponse, 'Known recording missing from review response');
  assert.equal(item.contributorCategory, contributorCategory, 'Unexpected attribution');
  const audio = await review({ ...scope, action: 'audioUrl', feedbackId });
  assert.equal(typeof audio.playbackUrl, 'string', 'Server does not support audioUrl');
  const download = await fetch(audio.playbackUrl);
  assert.equal(download.status, 200, 'Signed recording could not be downloaded');
  const bytes = new Uint8Array(await download.arrayBuffer());
  assert.ok(bytes.length > 32, 'Recording is empty or truncated');
  assert.ok(isFeedbackAudioContainer(bytes), 'Downloaded object is not a complete M4A container');
  if (item.audioResponse.sizeBytes) assert.equal(bytes.length, item.audioResponse.sizeBytes);
  console.log(
    `PASS ${translationId}/${bookId}/${chapter}: v2 attribution, fresh URL, ${bytes.length} audio bytes`
  );
}
