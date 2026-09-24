import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import type { View } from 'react-native';
import { flattenStyle, hostAncestors, installRenderHarness } from '../../../testing/render';
import { serifFamily } from '../../../design/fonts';
import { WCAG_AA_TEXT, contrastRatio } from '../../../design/contrast';
import { THEME_MODES } from '../../../design/themeMode';
import { APPEARANCE_PALETTE_IDS } from '../../../constants/appearancePalettes';

// The verse card the reader's share sheet captures with react-native-view-shot and shares.
const harness = installRenderHarness(mock, { os: 'ios' });

const renderCard = async (translationLanguage: string | undefined, selectedText: string) => {
  const { VerseImageSharePreview } = await import('./VerseImageSharePreview');
  return harness.render(
    <VerseImageSharePreview
      previewRef={createRef<View>()}
      backgroundSource={{ uri: 'file:///background.jpg' }}
      referenceLabel="John 3:16 BSB"
      selectedText={selectedText}
      translationLanguage={translationLanguage}
    />
  );
};

test('an English verse card sets the Scripture in Lora italic above its reference', async () => {
  const view = await renderCard('English', ' For God so loved the world ');

  const verse = view.getByText('"For God so loved the world"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, serifFamily(400, true));
  assert.ok(view.getByText('John 3:16 BSB'));
});

test('a Hindi verse card uses the platform serif, since Lora has no Devanagari glyphs', async () => {
  // Lora carries no Devanagari (or Arabic, Bengali, ...), so a card set in it would share a
  // fallback face. The reader and the Home card already route these scripts to the platform serif.
  const view = await renderCard('Hindi', 'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा');

  const verse = view.getByText('"क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});

test('an Arabic verse card also falls back to the platform serif', async () => {
  const view = await renderCard('ar', 'لأَنَّهُ هكَذَا أَحَبَّ اللهُ الْعَالَمَ');

  const verse = view.getByText('"لأَنَّهُ هكَذَا أَحَبَّ اللهُ الْعَالَمَ"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});

test('a card whose translation language is unknown keeps Lora italic', async () => {
  const view = await renderCard(undefined, 'In the beginning');

  const verse = view.getByText('"In the beginning"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, serifFamily(400, true));
});

test('the reference sits on an opaque chip it clears 4.5:1 against, in every theme and palette', async () => {
  // The card's gradient is translucent over a photo, so nothing drawn straight on it has a
  // knowable contrast (an accent reference over a blue-grey photo was unreadable). The
  // reference needs an opaque backdrop of its own.
  const failures: string[] = [];
  for (const theme of THEME_MODES) {
    for (const appearancePalette of APPEARANCE_PALETTE_IDS) {
      harness.authStore.setState((state) => ({
        preferences: { ...state.preferences, theme, appearancePalette },
      }));
      const view = await renderCard('English', 'For God so loved the world');
      const reference = view.getByText('John 3:16 BSB');
      const color = flattenStyle(reference.props.style)?.color;
      const backdrop = [reference, ...hostAncestors(reference)]
        .map((node) => flattenStyle(node.props.style)?.backgroundColor)
        .find((value) => value !== undefined);
      const label = `${theme}/${appearancePalette}`;
      if (typeof color !== 'string' || typeof backdrop !== 'string') {
        failures.push(`${label}: reference ${String(color)} has no backdrop colour`);
      } else if (!/^#[0-9a-f]{6}$/i.test(backdrop)) {
        failures.push(`${label}: reference backdrop ${backdrop} is not opaque`);
      } else if (contrastRatio(color, backdrop) < WCAG_AA_TEXT) {
        failures.push(
          `${label}: reference ${color} on ${backdrop} is ${contrastRatio(color, backdrop).toFixed(2)}:1`
        );
      }
      await view.unmount();
    }
  }
  assert.deepEqual(failures, []);
});
