import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('admin backend exposes chapter feedback submissions', async () => {
  const [adminData, navigation, page] = await Promise.all([
    readFile(path.join(repoRoot, 'apps/admin/lib/admin-data.ts'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/lib/admin-navigation.ts'), 'utf8'),
    readFile(path.join(repoRoot, 'apps/admin/app/(dashboard)/feedback/page.tsx'), 'utf8'),
  ]);

  assert.match(adminData, /listChapterFeedback/);
  assert.match(adminData, /from\('chapter_feedback_submissions'\)/);
  assert.match(navigation, /href:\s*'\/feedback'/);
  assert.match(page, /listChapterFeedback/);
  assert.match(page, /Chapter feedback/);
});
