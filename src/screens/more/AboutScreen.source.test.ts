import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AboutScreen uses the Every Seven Nine website and support contact details', () => {
  const source = readRelativeSource('./AboutScreen.tsx');

  assert.ok(
    source.includes("defaultValue: ABOUT_RESOURCES_LABEL"),
    'AboutScreen should provide fallback copy for the resources heading'
  );

  assert.ok(
    source.includes('https://everysevennine.tech'),
    'AboutScreen should link to the Every Seven Nine website'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_WEBSITE_LABEL"),
    'AboutScreen should show the Every Seven Nine website label instead of a raw key'
  );

  assert.ok(
    source.includes('mailto:${ABOUT_SUPPORT_EMAIL}'),
    'AboutScreen should open the hello@everybible.app support inbox'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_SUPPORT_EMAIL"),
    'AboutScreen should show the support email instead of a raw key'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_MADE_WITH_LOVE"),
    'AboutScreen should provide fallback copy for the footer line'
  );

  assert.ok(
    source.includes("require('../../../assets/icon.png')"),
    'AboutScreen should render the actual EveryBible app icon'
  );

  assert.ok(
    source.includes('https://everysevennine.tech/privacy'),
    'AboutScreen should link to the Every Seven Nine privacy page'
  );

  assert.ok(
    source.includes('https://everysevennine.tech/terms'),
    'AboutScreen should link to the Every Seven Nine terms page'
  );

  assert.equal(
    source.includes('https://jeremy3004-dot.github.io/EveryBible/privacy.html'),
    false,
    'AboutScreen should no longer link to the old privacy page'
  );

  assert.equal(
    source.includes('https://jeremy3004-dot.github.io/EveryBible/terms.html'),
    false,
    'AboutScreen should no longer link to the old terms page'
  );

  assert.equal(
    source.includes("t('about.bibleTranslation')"),
    false,
    'AboutScreen should no longer render the Bible translation section heading'
  );

  assert.equal(
    source.includes("t('about.bereanBible')"),
    false,
    'AboutScreen should no longer mention the Berean Standard Bible card'
  );

  assert.equal(
    source.includes('ABOUT_BSB_DESCRIPTION'),
    false,
    'AboutScreen should no longer keep the Berean description constant around'
  );

  assert.equal(
    source.includes('https://berean.bible'),
    false,
    'AboutScreen should no longer link out to the Berean website'
  );

  assert.equal(
    source.includes('Ionicons name="book"'),
    false,
    'AboutScreen should no longer render the generic book glyph as the app icon'
  );

  assert.equal(
    source.includes('support@everybible.app'),
    false,
    'AboutScreen should no longer use the old support email address'
  );
});
