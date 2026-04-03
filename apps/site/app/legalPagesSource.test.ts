import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('site legal pages use canonical support and legal links', async () => {
  const siteLinks = await readRepoFile('apps/site/lib/site-links.ts');
  const privacyPage = await readRepoFile('apps/site/app/privacy/page.tsx');
  const termsPage = await readRepoFile('apps/site/app/terms/page.tsx');
  const supportPage = await readRepoFile('apps/site/app/support/page.tsx');
  const siteContent = await readRepoFile('apps/site/lib/site-content.ts');

  assert.match(siteLinks, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS = 'hello@everybible\.app'/);
  assert.match(siteLinks, /EVERYBIBLE_PRIVACY_PATH = '\/privacy'/);
  assert.match(siteLinks, /EVERYBIBLE_TERMS_PATH = '\/terms'/);

  assert.match(privacyPage, /Last updated: April 3, 2026/);
  assert.match(privacyPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(privacyPage, /EVERYBIBLE_TERMS_PATH/);
  assert.match(privacyPage, /EVERYBIBLE_SUPPORT_PATH/);

  assert.match(termsPage, /Last updated: April 3, 2026/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(termsPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(termsPage, /EVERYBIBLE_SUPPORT_PATH/);

  assert.match(supportPage, /EVERYBIBLE_SUPPORT_EMAIL_ADDRESS/);
  assert.match(supportPage, /EVERYBIBLE_PRIVACY_PATH/);
  assert.match(supportPage, /EVERYBIBLE_TERMS_PATH/);

  assert.match(siteContent, /label: 'Privacy Policy', href: EVERYBIBLE_PRIVACY_PATH/);
  assert.match(siteContent, /label: 'Terms of Service', href: EVERYBIBLE_TERMS_PATH/);
});
