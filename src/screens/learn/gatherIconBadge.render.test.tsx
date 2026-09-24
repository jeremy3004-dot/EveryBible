// Renders GatherIconBadge, the artwork badge every Gather screen (Gather home,
// foundation and lesson detail, Home's foundation cards) draws through, against
// a synthetic artwork registry so each export shape is exercised exactly.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
} from '../../testing/render';
import { mockSvgForCommonJs } from './gatherRenderFixtures';

const harness = installRenderHarness(mock, { skip: ['react-native-svg'] });
mockSvgForCommonJs(mock);

const BITMAP_URI = 'data:image/png;base64,QUJD';
const ARTWORK: Record<string, string> = {
  // The generator's usual output: sized root, black ink, no viewBox.
  plain:
    '<svg version="1.1" width="200" height="100"><path fill="#000000" d="M1 1h10"/><path stroke="#000" d="M2 2h10"/></svg>',
  // An export that brings its own coordinate space, offset and unlike its size.
  framed:
    '<svg width="600" height="300" viewBox="10 20 300 150"><path fill="#000" d="M3 3h10"/></svg>',
  // A bitmap wrapped in an SVG shell.
  bitmap: `<svg width="326" height="512" viewBox="0 0 326 512"><image width="326" height="512" xlink:href="${BITMAP_URI}"/></svg>`,
};
mockModule(mock, sourcePath('data/gatherArtwork.ts'), { gatherArtworkXml: ARTWORK });

const INK = '#123456';

async function renderBadge(props: Record<string, unknown>) {
  const { GatherIconBadge } = await import('../../components/gather/GatherIconBadge');
  return harness.render(
    <GatherIconBadge size={80} iconSize={46} {...(props as { artworkKey?: string })} />
  );
}

const svgOf = (view: { queryAllByType: (type: string) => ReactTestInstance[] }) => {
  const svgs = view.queryAllByType('SvgXml');
  assert.equal(svgs.length, 1, 'the badge draws one SVG');
  return svgs[0];
};

test('artwork is drawn as SVG from the registry, centred in its slot and sized for breathing room', async () => {
  const view = await renderBadge({ artworkKey: 'plain', iconColor: INK });
  const svg = svgOf(view);
  const xml = svg.props.xml as string;

  assert.match(xml, /M1 1h10/, 'the registry entry for the key is drawn');
  assert.match(xml, /^<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(xml, /\swidth="200"/, 'the export size no longer fixes the drawing');
  // 90% of an 80pt badge, never smaller than the requested icon.
  assert.equal(svg.props.width, 72);
  assert.equal(svg.props.height, 72);
  assert.equal(view.queryAllByType('Icon').length, 0);
  assert.equal(view.queryAllByType('Image').length, 0);
});

test('in a small slot the artwork keeps at least the requested icon size', async () => {
  const view = await renderBadge({ artworkKey: 'plain', size: 20, iconSize: 22 });
  const svg = svgOf(view);
  assert.equal(svg.props.width, 22);
  assert.equal(svg.props.height, 22);
});

test('an exported viewBox is kept rather than rebuilt from the export size', async () => {
  const view = await renderBadge({ artworkKey: 'framed' });
  const xml = svgOf(view).props.xml as string;

  assert.match(xml, /viewBox="10 20 300 150"/);
  assert.doesNotMatch(xml, /viewBox="0 0 600 300"/);
  assert.equal((xml.match(/viewBox=/g) ?? []).length, 1);
});

test('black ink takes the theme colour: the one asked for, else the accent', async () => {
  const tinted = svgOf(await renderBadge({ artworkKey: 'plain', iconColor: INK })).props
    .xml as string;
  assert.match(tinted, new RegExp(`fill="${INK}"`));
  assert.match(tinted, new RegExp(`stroke="${INK}"`));
  assert.doesNotMatch(tinted, /#000/);

  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const colors = createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
  const accent = svgOf(await renderBadge({ artworkKey: 'framed' })).props.xml as string;
  assert.match(accent, new RegExp(`fill="${colors.accentPrimary}"`));
});

test('a bitmap wrapped in SVG is shown as a native image, tinted, not as SVG', async () => {
  const view = await renderBadge({ artworkKey: 'bitmap', iconColor: INK });

  assert.equal(view.queryAllByType('SvgXml').length, 0);
  const images = view.queryAllByType('Image');
  assert.equal(images.length, 1);
  assert.deepEqual(images[0].props.source, { uri: BITMAP_URI });
  const style = flattenStyle(images[0].props.style);
  assert.equal(style?.tintColor, INK);
  assert.equal(style?.width, 72);
  assert.equal(images[0].props.resizeMode, 'contain');
});

test('without artwork the badge falls back to a glyph: Lucide first, then Ionicons', async () => {
  const lucide = await renderBadge({
    artworkKey: 'missing',
    fallbackIcon: (await import('lucide-react-native')).Play,
    iconName: 'star',
  });
  assert.equal(lucide.queryAllByType('SvgXml').length, 0);
  assert.deepEqual(
    lucide.queryAllByType('LucideIcon').map((icon) => icon.props.name),
    ['Play']
  );
  assert.equal(lucide.queryAllByType('Icon').length, 0);
  await lucide.unmount();

  const ionicon = await renderBadge({ iconName: 'star' });
  assert.deepEqual(
    ionicon.queryAllByType('Icon').map((icon) => icon.props.name),
    ['star']
  );
  await ionicon.unmount();

  const stock = await renderBadge({});
  assert.deepEqual(
    stock.queryAllByType('Icon').map((icon) => icon.props.name),
    ['book-outline']
  );
});

test('the badge is decoration: screen readers skip it', async () => {
  const view = await renderBadge({ artworkKey: 'plain' });
  assert.ok(isHiddenFromAccessibility(svgOf(view)));
});
