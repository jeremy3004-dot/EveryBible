import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { adminNavigation } from './admin-navigation';

// The feedback data layer and the resolve action run on the real modules in
// admin-data.behavior.test.ts (list filters, QA hiding, signed audio, the review model,
// overview counts) and app/(dashboard)/serverActions.test.ts (mark fixed + audit).

test('the admin navigation links Chapter Feedback to /feedback', () => {
  const entry = adminNavigation.find((item) => item.label === 'Chapter Feedback');
  assert.equal(entry?.href, '/feedback');
});

// UI-only source check: these pages are React server components and the suite has no
// renderer, so their wiring is asserted on the page source.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('the feedback page and the overview card render the review model', async () => {
  const [page, overview] = await Promise.all([
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/feedback/page.tsx'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/page.tsx'), 'utf8'),
  ]);

  assert.match(overview, /href="\/feedback"/);
  assert.match(overview, /summary\.feedbackCount/);
  assert.match(page, /getChapterFeedbackReviewModel/);
  assert.match(page, /name="language"/);
  assert.match(page, /name="bookId"/);
  assert.match(page, /name="chapter"/);
  assert.match(page, /Feedback by language/);
  assert.match(page, /Feedback by translation/);
  assert.match(page, /fixStatus/);
  assert.match(page, /Awaiting resolution/);
  assert.match(page, /Mark addressed/);
  assert.match(page, /Awaiting review/);
  assert.match(page, /Chapter feedback/);
  assert.match(page, /<audio/);
});
