import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { footerColumns } from '../lib/site-content';
import {
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL_ADDRESS,
  EVERYBIBLE_TERMS_PATH,
} from '../lib/site-links';

test('the canonical support address and legal paths', () => {
  assert.equal(EVERYBIBLE_SUPPORT_EMAIL_ADDRESS, 'hello@everybible.app');
  assert.equal(EVERYBIBLE_PRIVACY_PATH, '/privacy');
  assert.equal(EVERYBIBLE_TERMS_PATH, '/terms');
  assert.equal(EVERYBIBLE_DELETE_ACCOUNT_PATH, '/delete-account');
});

test('the footer links the legal pages through the canonical paths, in sentence case', () => {
  const links = footerColumns.flatMap((column) => column.links);

  assert.equal(links.find((link) => link.label === 'Privacy policy')?.href, '/privacy');
  assert.equal(links.find((link) => link.label === 'Terms of service')?.href, '/terms');
  assert.equal(links.find((link) => link.label === 'Delete your account')?.href, '/delete-account');
});

// UI-only source check for the hand-written legal pages. The privacy and deletion pages
// render from lib/legal and are covered by app/delete-account/page.test.tsx.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readRepoFile = (relativePath: string) => readFile(path.join(repoRoot, relativePath), 'utf8');

test('the legal pages cross-link through the shared constants', async () => {
  const termsPage = await readRepoFile('apps/site/app/terms/page.tsx');
  const supportPage = await readRepoFile('apps/site/app/support/page.tsx');

  assert.match(termsPage, /Last updated: April 3, 2026/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(termsPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_PATH/);

  assert.match(supportPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(supportPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(supportPage, /EVERYBIBLE_TERMS_PATH/);
});
