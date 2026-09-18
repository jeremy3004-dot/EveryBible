/** Integration proof against an isolated local Supabase stack. Never accepts a remote host.
 * Supply FEEDBACK_QA_STATUS_FILE (supabase status -o json), FEEDBACK_QA_TRANSLATOR_CODE,
 * FEEDBACK_QA_COUNCIL_CODE, and optionally FEEDBACK_QA_AUDIO_FILE.
 * Leaves clearly labeled fixtures for simulator interaction. Do not run on a shared local DB.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const status = JSON.parse(readFileSync(process.env.FEEDBACK_QA_STATUS_FILE!, 'utf8'));
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
  const passcode = process.env.FEEDBACK_QA_TRANSLATOR_CODE!;
  const councilPasscode = process.env.FEEDBACK_QA_COUNCIL_CODE!;
  assert.ok(passcode && councilPasscode);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const scope = { translationId: 'bsb', bookId: 'GEN', chapter: 1 };
  const run = `feedback-qa-${Date.now()}`;
  let checks = 0;
  const passed = (label: string) => console.log(`PASS ${++checks}: ${label}`);
  async function edge(name: string, body: object, token?: string) {
    const response = await fetch(`${status.API_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: status.ANON_KEY,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function review(body: object = {}) {
    const result = await edge('review-chapter-feedback', {
      apiVersion: 2,
      passcode,
      ...scope,
      ...body,
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.success, true);
    return result.data;
  }
  const baseSubmission = {
    ...scope,
    translationLanguage: 'en',
    interfaceLanguage: 'en',
    sentiment: 'down',
    comment: 'Please clarify the wording in verse three.',
    participantName: 'QA Contributor',
    participantRole: 'Reader',
    sourceScreen: 'reader',
  };
  const empty = await review({ summaryOnly: true });
  assert.equal(
    empty.chapters.length,
    0,
    'Use a fresh isolated database for this integration proof'
  );
  passed('empty chapter summary');

  const fixtures = Array.from({ length: 320 }, (_, index) => ({
    translation_id: scope.translationId,
    translation_language: 'en',
    interface_language: 'en',
    book_id: scope.bookId,
    chapter: scope.chapter,
    source_screen: run,
    sentiment: index < 240 ? 'down' : 'up',
    comment:
      index < 240 ? `QA concern ${String(index + 1).padStart(3, '0')}: clarify verse three.` : null,
    participant_name: `QA Reader ${String(index + 1).padStart(3, '0')}`,
    participant_role: 'Reader',
    contributor_category: index < 5 ? null : index % 2 ? 'community' : 'scripture_council',
  }));
  const seeded = await admin
    .from('chapter_feedback_submissions')
    .insert(fixtures)
    .select('id, sentiment, contributor_category');
  assert.ifError(seeded.error);
  const rows = seeded.data!;
  assert.equal(rows.length, 320);
  const first = await review();
  assert.equal(first.summary.total, 320);
  assert.equal(first.summary.unresolvedDown, 240);
  assert.equal(first.summary.unresolvedUp, 80);
  assert.equal(first.summary.unattributed, 5);
  assert.equal(first.positiveCount, 80);
  assert.equal(first.feedback.length, 40);
  assert.ok(first.feedback.every((row: { sentiment: string }) => row.sentiment === 'down'));
  passed('320-row full summary and compact positive group');

  const concurrent = await admin
    .from('chapter_feedback_submissions')
    .insert({
      ...fixtures[0],
      participant_name: 'QA Concurrent Concern',
      contributor_category: 'community',
    })
    .select('id')
    .single();
  assert.ifError(concurrent.error);
  let page = first;
  const seen = new Set<string>();
  do {
    for (const row of page.feedback) {
      assert.ok(!seen.has(row.id), 'duplicate page response');
      seen.add(row.id);
    }
    if (!page.nextCursor) break;
    page = await review({ cursor: page.nextCursor });
  } while (true);
  assert.equal(seen.size, 240);
  assert.ok(seen.has(rows[0].id), 'oldest response beyond 200 is reachable');
  assert.ok(!seen.has(concurrent.data!.id), 'concurrent insert excluded from existing snapshot');
  assert.ok(
    (await review()).feedback.some((row: { id: string }) => row.id === concurrent.data!.id)
  );
  passed('stable pagination reaches oldest response beyond 200 despite concurrent insert');

  for (const category of ['community', 'scripture_council']) {
    const result = await review({ category });
    assert.ok(result.feedback.length > 0);
    assert.ok(
      result.feedback.every(
        (row: { contributorCategory: string }) => row.contributorCategory === category
      )
    );
  }
  const positive = await review({ positiveOnly: true });
  assert.equal(positive.feedback.length, 40);
  assert.ok(
    positive.feedback.every(
      (row: { sentiment: string; comment: string | null }) => row.sentiment === 'up' && !row.comment
    )
  );
  passed('category filters and original positive responses');

  const forged = await edge('submit-chapter-feedback', {
    ...baseSubmission,
    contributorCategory: 'scripture_council',
    councilPasscode: 'wrong',
  });
  assert.equal(forged.status, 403);
  const council = await edge('submit-chapter-feedback', {
    ...baseSubmission,
    contributorCategory: 'scripture_council',
    councilPasscode,
  });
  assert.equal(council.status, 200, JSON.stringify(council.data));
  const community = await edge('submit-chapter-feedback', {
    ...baseSubmission,
    contributorCategory: 'community',
    participantName: 'QA Community Reader',
  });
  assert.equal(community.status, 200, JSON.stringify(community.data));
  const submitted = await admin
    .from('chapter_feedback_submissions')
    .select('id, contributor_category, user_id')
    .eq('participant_name', 'QA Contributor');
  assert.ifError(submitted.error);
  assert.equal(submitted.data!.length, 1);
  assert.equal(submitted.data![0].contributor_category, 'scripture_council');
  assert.equal(submitted.data![0].user_id, null);
  const relabel = await admin
    .from('chapter_feedback_submissions')
    .update({ contributor_category: 'community' })
    .eq('id', submitted.data![0].id);
  assert.ok(relabel.error, 'even later server edits cannot relabel attribution');
  const directForge = await anon
    .from('chapter_feedback_submissions')
    .insert({ ...fixtures[0], contributor_category: 'scripture_council' });
  assert.ok(directForge.error);
  passed(
    'anonymous community, verified council, forged category rejection and immutable attribution'
  );

  const concern = rows[0].id;
  const noExplanation = await edge('review-chapter-feedback', {
    apiVersion: 2,
    passcode,
    ...scope,
    action: 'resolve',
    feedbackId: concern,
    resolution: 'fixed',
  });
  assert.equal(noExplanation.status, 400);
  await review({
    action: 'resolve',
    feedbackId: concern,
    resolution: 'fixed',
    note: 'Clarified verse three.',
  });
  assert.equal(
    (await review({ status: 'reviewed' })).feedback[0].resolutionNote,
    'Clarified verse three.'
  );
  await review({ action: 'reopen', feedbackId: concern });
  await review({
    action: 'resolve',
    feedbackId: concern,
    resolution: 'no_change_needed',
    note: 'The wording matches the source.',
  });
  const wrongScope = await edge('review-chapter-feedback', {
    apiVersion: 2,
    passcode,
    ...scope,
    translationId: 'OTHER',
    action: 'reopen',
    feedbackId: concern,
  });
  assert.equal(wrongScope.status, 404);
  passed('addressed and no-change reasons, reopening and translation scope');

  const preview = await review({ action: 'positivePreview' });
  assert.equal(preview.feedbackIds.length, 80);
  const latePositive = await admin
    .from('chapter_feedback_submissions')
    .insert({ ...fixtures[319], participant_name: 'QA New Positive' })
    .select('id')
    .single();
  assert.ifError(latePositive.error);
  const bulk = await review({
    action: 'reviewPositiveIds',
    feedbackIds: [...preview.feedbackIds, rows[1].id],
  });
  assert.equal(bulk.reviewedCount, 80, 'a concern is never included in a positive bulk action');
  assert.equal((await review()).positiveCount, 1);
  const late = await admin
    .from('chapter_feedback_submissions')
    .select('scripture_council_resolution')
    .eq('id', latePositive.data!.id)
    .single();
  assert.equal(late.data!.scripture_council_resolution, null);
  passed('exact-ID positive bulk review excludes concurrent response and concerns');

  const password = `QA-${crypto.randomUUID()}!`;
  const email = `feedback-${Date.now()}@example.test`;
  const createdUser = await anon.auth.signUp({
    email,
    password,
    options: { data: { display_name: 'QA Contributor' } },
  });
  assert.ifError(createdUser.error);
  const member = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  const login = await member.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const owned = await edge(
    'submit-chapter-feedback',
    { ...baseSubmission, participantName: 'QA Signed-in Contributor' },
    login.data.session!.access_token
  );
  assert.equal(owned.status, 200, JSON.stringify(owned.data));
  const history = await member
    .from('chapter_feedback_submissions')
    .select('id, user_id, scripture_council_fixed_note');
  assert.ifError(history.error);
  assert.equal(history.data!.length, 1);
  assert.equal(history.data![0].user_id, createdUser.data.user!.id);
  await review({
    action: 'resolve',
    feedbackId: history.data![0].id,
    resolution: 'fixed',
    note: 'Updated the wording after your feedback.',
  });
  const followedUp = await member
    .from('chapter_feedback_submissions')
    .select('scripture_council_fixed_note')
    .single();
  assert.equal(
    followedUp.data!.scripture_council_fixed_note,
    'Updated the wording after your feedback.'
  );
  const otherUser = await anon.auth.signUp({ email: `other-${email}`, password });
  assert.ifError(otherUser.error);
  const other = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  assert.ifError(
    (await other.auth.signInWithPassword({ email: `other-${email}`, password })).error
  );
  assert.equal((await other.from('chapter_feedback_submissions').select('id')).data!.length, 0);
  const guest = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  assert.equal((await guest.from('chapter_feedback_submissions').select('id')).data!.length, 0);
  passed('contributor history shows explanation and isolates other users and anonymous reads');

  if (process.env.FEEDBACK_QA_AUDIO_FILE) {
    const audio = readFileSync(process.env.FEEDBACK_QA_AUDIO_FILE);
    const audioSubmit = await edge('submit-chapter-feedback', {
      ...baseSubmission,
      participantName: 'QA Audio Contributor',
      audioResponse: {
        bucket: 'chapter-feedback-audio',
        durationMs: 6500,
        mimeType: 'audio/mp4',
        sizeBytes: audio.length,
        base64Data: audio.toString('base64'),
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(audioSubmit.status, 200, JSON.stringify(audioSubmit.data));
    const audioRow = await admin
      .from('chapter_feedback_submissions')
      .select('id')
      .eq('participant_name', 'QA Audio Contributor')
      .single();
    assert.ifError(audioRow.error);
    const audioUrl = await review({ action: 'audioUrl', feedbackId: audioRow.data!.id });
    const playable = await fetch(audioUrl.playbackUrl.replace('http://kong:8000', status.API_URL));
    assert.equal(playable.status, 200);
    assert.equal((await playable.arrayBuffer()).byteLength, audio.length);
    const badScope = await edge('review-chapter-feedback', {
      apiVersion: 2,
      passcode,
      ...scope,
      chapter: 2,
      action: 'audioUrl',
      feedbackId: audioRow.data!.id,
    });
    assert.equal(badScope.status, 404);
    passed('real audio submission, scoped signed URL refresh and byte-for-byte playback asset');
  }

  // A separate chapter proves completion followed by a new response without changing old outcomes.
  const completeRow = await admin
    .from('chapter_feedback_submissions')
    .insert({ ...fixtures[0], chapter: 2 })
    .select('id')
    .single();
  assert.ifError(completeRow.error);
  await review({
    action: 'resolve',
    feedbackId: completeRow.data!.id,
    resolution: 'fixed',
    note: 'Correction complete.',
  });
  assert.equal((await review({ chapter: 2 })).summary.unresolvedDown, 0);
  assert.ifError(
    (await admin.from('chapter_feedback_submissions').insert({ ...fixtures[1], chapter: 2 })).error
  );
  const reopenedChapter = await review({ chapter: 2 });
  assert.equal(reopenedChapter.summary.total, 2);
  assert.equal(reopenedChapter.summary.unresolvedDown, 1);
  assert.equal((await review({ chapter: 2, status: 'reviewed' })).feedback[0].resolution, 'fixed');
  passed('new submission restores pending state while previous outcome persists');

  const deniedRpc = await anon.rpc('chapter_feedback_review_v2', { p_translation: 'BSB' });
  assert.ok(deniedRpc.error);
  const councilCannotReview = await edge('review-chapter-feedback', {
    ...scope,
    apiVersion: 2,
    accessRole: 'scripture_council',
    passcode: councilPasscode,
  });
  assert.equal(councilCannotReview.status, 403);
  passed('aggregate RPC and translator review stay protected');

  const output = process.env.FEEDBACK_QA_CREDENTIALS_FILE;
  if (output)
    writeFileSync(
      output,
      JSON.stringify(
        { email, password, userId: createdUser.data.user!.id, oldestFeedbackId: rows[0].id, run },
        null,
        2
      ),
      { mode: 0o600 }
    );
  console.log(
    `Integration complete: ${checks} checks; fixtures retained for iPhone simulator testing.`
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
