import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AboutScreen uses the EveryBible website and support contact details', () => {
  const source = readRelativeSource('./AboutScreen.tsx');

  assert.ok(
    source.includes("t('about.bereanBible')"),
    'AboutScreen should use the localized Berean Standard Bible label'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_BSB_DESCRIPTION"),
    'AboutScreen should provide fallback copy for the BSB description'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_RESOURCES_LABEL"),
    'AboutScreen should provide fallback copy for the resources heading'
  );

  assert.ok(
    source.includes('https://everybible.app'),
    'AboutScreen should link to the EveryBible website'
  );

  assert.ok(
    source.includes("defaultValue: ABOUT_WEBSITE_LABEL"),
    'AboutScreen should show the EveryBible website label instead of a raw key'
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

  assert.equal(
    source.includes('https://berean.bible'),
    false,
    'AboutScreen should no longer link out to the Berean website'
  );

  assert.equal(
    source.includes('support@everybible.app'),
    false,
    'AboutScreen should no longer use the old support email address'
  );
});
