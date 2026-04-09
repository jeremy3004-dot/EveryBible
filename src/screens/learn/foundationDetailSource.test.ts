import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('FoundationDetailScreen shows the full foundation description without a toggle', () => {
  const source = readRelativeSource('./FoundationDetailScreen.tsx');

  assert.equal(
    source.includes('descriptionExpanded'),
    false,
    'FoundationDetailScreen should no longer track collapsed description state'
  );

  assert.equal(
    source.includes('showMoreText'),
    false,
    'FoundationDetailScreen should no longer render a show-more/show-less control'
  );

  assert.equal(
    source.includes("t('gather.showMore')"),
    false,
    'FoundationDetailScreen should not reference the removed show-more translation key'
  );

  assert.equal(
    source.includes("t('gather.showLess')"),
    false,
    'FoundationDetailScreen should not reference the removed show-less translation key'
  );
});

test('FoundationDetailScreen lowers the back button below the safe-area cutout', () => {
  const source = readRelativeSource('./FoundationDetailScreen.tsx');

  assert.equal(
    source.includes('height: 56 + insets.top'),
    true,
    'FoundationDetailScreen should expand the header height to include the top safe-area inset'
  );
});

test('FoundationDetailScreen removes the old top-right download affordance from gather detail headers', () => {
  const source = readRelativeSource('./FoundationDetailScreen.tsx');

  assert.equal(
    source.includes('<Ionicons name="download-outline" size={22} color={colors.secondaryText} />'),
    false,
    'FoundationDetailScreen should not render the old download icon in the top-right header slot'
  );

  assert.equal(
    source.includes('<View style={styles.headerActionSpacer} />'),
    true,
    'FoundationDetailScreen should keep a trailing spacer so the centered title stays balanced'
  );
});
