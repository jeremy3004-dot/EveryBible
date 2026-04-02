import assert from 'node:assert/strict';
import test from 'node:test';

import { getHomepageContent, resolveHomepageContent } from './homepage-content';
import { defaultHomepageContent } from './site-content';

test('getHomepageContent returns the code-managed homepage when the live contract is empty', async () => {
  const content = await getHomepageContent({
    loadLiveOverride: async () => null,
  });

  assert.deepEqual(content, defaultHomepageContent);
});

test('getHomepageContent returns the code-managed homepage when the live contract throws', async () => {
  const content = await getHomepageContent({
    loadLiveOverride: async () => {
      throw new Error('boom');
    },
  });

  assert.deepEqual(content, defaultHomepageContent);
});

test('getHomepageContent returns the live homepage when the payload is valid', async () => {
  const content = await getHomepageContent({
    loadLiveOverride: async () => ({
      hero: {
        title: 'Read Scripture anywhere.',
        description: 'Fresh hero copy from the operator.',
        visual: {
          src: '/custom/hero.png',
          alt: 'Custom hero visual',
        },
        storeLinks: [
          {
            label: 'Google Play',
            href: 'https://play.google.com/store/apps/details?id=com.everybible.app',
            eyebrow: 'Get it on',
            platform: 'google-play',
          },
        ],
        inlineLink: {
          label: 'Read the story',
          href: '/about',
        },
      },
      featureCards: [
        {
          title: 'Follow along offline',
          description: 'Keep reading even when the signal drops.',
          href: '/about#offline',
          actionLabel: 'See offline support',
          iconSrc: '/custom/offline.svg',
          iconAlt: 'Offline support',
        },
      ],
      verseOfDay: {
        label: 'Today in Scripture',
        verse: 'Be still, and know that I am God.',
        reference: 'Psalm 46:10',
        imageSrc: '/custom/verse.png',
        imageAlt: 'Verse of the day art',
        primaryAction: {
          label: 'Share verse',
          href: '#verse-of-the-day',
        },
        secondaryAction: {
          label: 'Install EveryBible',
          href: 'https://play.google.com/store/apps/details?id=com.everybible.app',
        },
      },
    }),
  });

  assert.equal(content.heroContent.title, 'Read Scripture anywhere.');
  assert.equal(content.featureCards[0]?.title, 'Follow along offline');
  assert.equal(content.verseOfDay.reference, 'Psalm 46:10');
});

test('resolveHomepageContent falls back per section when the payload is partial or invalid', () => {
  const content = resolveHomepageContent({
    hero: {
      title: 'Updated hero title',
      description: 'Updated hero description',
      visual: {
        src: '/updated/hero.png',
        alt: 'Updated hero visual',
      },
      storeLinks: [
        {
          label: 'App Store',
          href: 'https://apps.apple.com/app/id6758254335',
          eyebrow: 'Download on the',
          platform: 'app-store',
        },
      ],
      inlineLink: {
        label: 'Learn more',
        href: '/about',
      },
    },
    featureCards: [
      {
        title: 'Broken card missing href',
        description: 'This should be rejected.',
        actionLabel: 'Ignore me',
        iconSrc: '/broken/icon.svg',
        iconAlt: 'Broken',
      },
    ],
    verseOfDay: {
      label: 'Still valid',
      verse: 'Trust in the Lord with all your heart.',
      reference: 'Proverbs 3:5',
      imageSrc: '/updated/verse.png',
      imageAlt: 'Updated verse art',
      primaryAction: {
        label: 'Share',
        href: '#verse-of-the-day',
      },
      secondaryAction: {
        label: 'Install',
        href: 'https://play.google.com/store/apps/details?id=com.everybible.app',
      },
    },
  });

  assert.equal(content.heroContent.title, 'Updated hero title');
  assert.deepEqual(content.featureCards, defaultHomepageContent.featureCards);
  assert.equal(content.verseOfDay.reference, 'Proverbs 3:5');
});
