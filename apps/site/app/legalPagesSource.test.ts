import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { footerColumns } from '../lib/site-content';
import {
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL_ADDRESS,
  EVERYBIBLE_TERMS_PATH,
} from '../lib/site-links';

test('the canonical support address and legal paths', () => {
  assert.equal(EVERYBIBLE_SUPPORT_EMAIL_ADDRESS, 'hello@everybible.app');
  assert.equal(EVERYBIBLE_PRIVACY_PATH, '/privacy');
  assert.equal(EVERYBIBLE_TERMS_PATH, '/terms');
});

test('the footer links the legal pages through the canonical paths, in sentence case', () => {
  const links = footerColumns.flatMap((column) => column.links);

  assert.equal(links.find((link) => link.label === 'Privacy policy')?.href, '/privacy');
  assert.equal(links.find((link) => link.label === 'Terms of service')?.href, '/terms');
});

// UI-only source check: the legal pages are React server components and the suite has no
// renderer, so their wiring to the shared constants and their dated copy are asserted on
// the page source.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readRepoFile = (relativePath: string) => readFile(path.join(repoRoot, relativePath), 'utf8');

test('the legal pages cross-link through the shared constants', async () => {
  const privacyPage = await readRepoFile('apps/site/app/privacy/page.tsx');
  const termsPage = await readRepoFile('apps/site/app/terms/page.tsx');
  const supportPage = await readRepoFile('apps/site/app/support/page.tsx');

  assert.match(privacyPage, /Last updated: April 3, 2026/);
  assert.match(privacyPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(privacyPage, /EVERYBIBLE_TERMS_PATH/);
  assert.match(privacyPage, /EVERYBIBLE_SUPPORT_PATH/);
  assert.match(
    privacyPage,
    /minutes\s+listened.*sessions\s+or\s+time\s+spent.*chapter\s+completion.*playback\s+progress.*feature\s+engagement/s
  );

  assert.match(termsPage, /Last updated: April 3, 2026/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(termsPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_PATH/);

  assert.match(supportPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(supportPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(supportPage, /EVERYBIBLE_TERMS_PATH/);
});
