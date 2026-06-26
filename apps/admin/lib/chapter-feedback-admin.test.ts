import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin backend exposes chapter feedback submissions', async () => {
  const [adminData, navigation, page, actions, overview] = await Promise.all([
    readFile(path.join(repoRoot, 'apps/admin/lib/admin-data.ts'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/lib/admin-navigation.ts'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/feedback/page.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/feedback/actions.ts'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/page.tsx'), 'utf8'),
  ]);

  assert.match(adminData, /listChapterFeedback/);
  assert.match(adminData, /getChapterFeedbackReviewModel/);
  assert.match(adminData, /from\('chapter_feedback_submissions'\)/);
  assert.match(adminData, /translation_language/);
  assert.match(adminData, /book_id/);
  assert.match(adminData, /chapter/);
  assert.match(adminData, /audio_response_path/);
  assert.match(adminData, /scripture_council_fixed_at/);
  assert.match(adminData, /translationCoverage/);
  assert.match(adminData, /createSignedUrl/);
  assert.match(adminData, /feedbackCount/);
  assert.match(navigation, /label:\s*'Chapter Feedback'/);
  assert.match(navigation, /href:\s*'\/feedback'/);
  assert.match(overview, /href="\/feedback"/);
  assert.match(overview, /summary\.feedbackCount/);
  assert.match(page, /getChapterFeedbackReviewModel/);
  assert.match(page, /name="language"/);
  assert.match(page, /name="bookId"/);
  assert.match(page, /name="chapter"/);
  assert.match(page, /Feedback by language/);
  assert.match(page, /Feedback by translation/);
  assert.match(page, /fixStatus/);
  assert.match(page, /Open needs-work fixes/);
  assert.match(page, /Mark fixed/);
  assert.match(page, /Confirmed accurate/);
  assert.match(page, /Chapter feedback/);
  assert.match(page, /<audio/);
  assert.match(actions, /markChapterFeedbackScriptureCouncilFixedAction/);
  assert.match(actions, /scripture_council_fixed_at/);
  assert.match(actions, /chapter_feedback\.scripture_council_fix\.mark_fixed/);
});
