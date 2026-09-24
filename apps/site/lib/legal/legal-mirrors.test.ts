import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { deleteAccountPage } from './delete-account';
import { plainText, type LegalDocument } from './legal-document';
import { renderLegalMirrors } from './legal-mirrors';
import { privacyPolicy } from './privacy-policy';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('the legal/ copies match the site text (run npm run legal:mirrors -w @everybible/site)', async () => {
  for (const { file, html } of renderLegalMirrors()) {
    const committed = await readFile(path.join(repoRoot, file), 'utf8');
    assert.equal(committed, html, `${file} is out of date`);
  }
});

function documentText(document: LegalDocument): string {
  return document.sections
    .flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => ('items' in block ? block.items : [block.text])),
    ])
    .map(plainText)
    .join('\n');
}

test('the privacy policy covers what the app sends today', () => {
  const text = documentText(privacyPolicy);

  // Crash reports: app_error_reports migration (no user id or IP, 90-day purge).
  assert.match(text, /Reports are not linked to your account/);
  assert.match(text, /We delete them after 90 days/);
  // IP-derived location, rounded to 0.1 degree by the geo worker and the ingest function.
  assert.match(text, /rounded to one decimal place \(about 10 km\)/);
  assert.match(text, /ipinfo\.io or ipapi\.co/);
  // Analytics purge: purge_old_analytics_events keeps 13 months.
  assert.match(text, /13 months/);
  assert.match(text, /voice answer of up to 60 seconds/);
  assert.match(text, /push token/);
  assert.match(text, /More → Settings → Data → Delete Account/);
  assert.match(text, /hello@everybible\.app/);
  assert.doesNotMatch(text, /curryj@protonmail\.com/);
});

test('the deletion page says what is kept instead of promising nothing is', () => {
  const text = documentText(deleteAccountPage);

  assert.match(text, /What we keep, without your name/);
  assert.match(text, /Your name, voice recording and hashed IP address are removed/);
  assert.doesNotMatch(text, /do not retain any personal data/i);
  assert.match(text, /hello@everybible\.app/);
});
