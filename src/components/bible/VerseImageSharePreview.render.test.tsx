import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRef } from 'react';
import type { View } from 'react-native';
import { flattenStyle, installRenderHarness } from '../../testing/render';
import { serifFamily } from '../../design/fonts';

// The verse card the reader captures with react-native-view-shot and shares as an image.
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

test('an English verse card sets the Scripture in Lora italic under its reference', async () => {
  const view = await renderCard('English', ' For God so loved the world ');

  const verse = view.getByText('"For God so loved the world"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, serifFamily(400, true));
  assert.ok(view.getByText('John 3:16 BSB'));
});

test('a Hindi verse card uses the platform serif, since Lora has no Devanagari glyphs', async () => {
  // Lora carries no Devanagari (or Arabic, Bengali, ...), so a card set in it shares tofu
  // boxes. The reader and the Home card already route these scripts to the platform serif.
  const view = await renderCard('Hindi', 'क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा');

  const verse = view.getByText('"क्योंकि परमेश्वर ने जगत से ऐसा प्रेम रखा"');
  assert.equal(flattenStyle(verse.props.style)?.fontFamily, undefined);
});
