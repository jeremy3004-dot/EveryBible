import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('home and detail gather screens use the shared SVG badge artwork', () => {
  const home = readRelativeSource('../home/HomeScreen.tsx');
  const foundationDetail = readRelativeSource('./FoundationDetailScreen.tsx');
  const lessonDetail = readRelativeSource('./LessonDetailScreen.tsx');

  for (const [name, source] of [
    ['HomeScreen', home],
    ['FoundationDetailScreen', foundationDetail],
    ['LessonDetailScreen', lessonDetail],
  ] as const) {
    assert.equal(
      source.includes('GatherIconBadge'),
      true,
      `${name} should render gather artwork through GatherIconBadge`
    );

    assert.equal(
      source.includes('gatherCategoryIcons'),
      false,
      `${name} should not depend on the old icon-name registry`
    );
  }
});

test('detail screens pass artwork keys into the shared badge', () => {
  const home = readRelativeSource('../home/HomeScreen.tsx');
  const foundationDetail = readRelativeSource('./FoundationDetailScreen.tsx');
  const lessonDetail = readRelativeSource('./LessonDetailScreen.tsx');

  assert.equal(
    home.includes('artworkKey={activeFoundation.iconImage}'),
    true,
    'HomeScreen should pass the active foundation artwork key into GatherIconBadge'
  );

  assert.equal(
    foundationDetail.includes('artworkKey={foundation.iconImage}'),
    true,
    'FoundationDetailScreen should pass the foundation artwork key into GatherIconBadge'
  );

  assert.equal(
    lessonDetail.includes('artworkKey={parent?.iconImage}'),
    true,
    'LessonDetailScreen should pass the parent artwork key into GatherIconBadge'
  );
});

test('GatherIconBadge uses SVG artwork and theme tinting', () => {
  const source = readRelativeSource('../../components/gather/GatherIconBadge.tsx');

  assert.equal(
    source.includes('react-native-svg'),
    true,
    'GatherIconBadge should render SVGs through react-native-svg'
  );

  assert.equal(
    source.includes('gatherArtworkXml'),
    true,
    'GatherIconBadge should pull artwork from the generated SVG registry'
  );

  assert.equal(
    source.includes('preserveAspectRatio="xMidYMid meet"'),
    true,
    'GatherIconBadge should center exported SVG artwork in its layout slot'
  );

  assert.equal(
    source.includes('Math.max(iconSize, Math.round(size * 0.9))'),
    true,
    'GatherIconBadge should size artwork relative to its slot so it reads clearly without badge chrome'
  );

  assert.equal(
    source.includes('const viewBoxMatch = attributes.match(/\\bviewBox="([^"]+)"/i);'),
    true,
    'GatherIconBadge should preserve an exported SVG viewBox when one exists'
  );

  assert.equal(
    source.includes('artworkXml.match(/(?:xlink:href|href)="(data:image\\/[^"]+)"/i)'),
    true,
    'GatherIconBadge should detect SVG-wrapped bitmap exports'
  );

  assert.equal(
    source.includes('<Image'),
    true,
    'GatherIconBadge should fall back to a native image for SVG-wrapped bitmap exports'
  );
});
