import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHomepageAuditMetadata,
  buildHomepageSummary,
  validateHomepagePayload,
} from './tools/homepage';
import {
  buildContentHealthText,
  buildRecentAdminActionsText,
  buildTranslationSummaryText,
} from './tools/operational-summary';
import { renderCodeChangeRequestMarkdown } from './tools/code-change-request';

test('homepage helpers build the approved payload contract and operator audit metadata', () => {
  const payload = validateHomepagePayload({
    hero: {
      title: ' Read anywhere ',
      description: ' Updated hero copy ',
      visual: {
        src: ' /hero.png ',
        alt: ' Hero visual ',
      },
      storeLinks: [
        {
          label: 'Google Play',
          href: ' https://play.google.com/store/apps/details?id=com.everybible.app ',
          eyebrow: 'Get it on',
          platform: 'google-play',
        },
      ],
      inlineLink: {
        label: ' Learn more ',
        href: ' /about ',
      },
    },
    featureCards: [
      {
        title: ' Offline access ',
        description: ' Read without a signal ',
        href: ' /about#offline ',
        actionLabel: 'See offline',
        iconSrc: ' /offline.svg ',
        iconAlt: ' Offline icon ',
      },
    ],
    verseOfDay: {
      label: 'Verse of the Day',
      verse: 'Your word is a lamp to my feet.',
      reference: 'Psalm 119:105',
      imageSrc: ' /verse.png ',
      imageAlt: ' Verse art ',
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

  const metadata = buildHomepageAuditMetadata({
    channel: 'telegram',
    requesterDisplayName: 'Jeremy',
    requesterSenderId: 'tg:123',
    toolName: 'update_homepage_content',
  });

  assert.equal(payload.hero.title, 'Read anywhere');
  assert.equal(payload.hero.visual.src, '/hero.png');
  assert.deepEqual(metadata.changedFields, ['hero', 'featureCards', 'verseOfDay']);
  assert.match(buildHomepageSummary(payload), /Updated homepage override/);
});

test('operational summary helpers stay read-only and format concise status text', () => {
  const healthText = buildContentHealthText({
    failedSyncCount: 2,
    liveHomepageOverride: true,
    liveImageCount: 4,
    liveVerseCount: 1,
  });
  const translationText = buildTranslationSummaryText({
    distributionCounts: { draft: 2, published: 5 },
    recentTranslations: [
      {
        distributionState: 'published',
        languageName: 'English',
        name: 'Berean Standard Bible',
        translationId: 'bsb',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ],
    totalTranslations: 7,
  });
  const recentActionsText = buildRecentAdminActionsText([
    {
      action: 'homepage_content_updated',
      actorEmail: 'openclaw:tg:123',
      createdAt: '2026-04-02T00:00:00.000Z',
      entityId: 'homepage',
      entityType: 'site_content_entry',
      id: '1',
      summary: 'Updated homepage hero copy.',
    },
  ]);

  assert.match(healthText, /Failed syncs: 2/);
  assert.match(translationText, /Tracked translations: 7/);
  assert.match(recentActionsText, /homepage_content_updated/);
});

test('code-change requests render reviewable markdown artifacts instead of source mutations', () => {
  const markdown = renderCodeChangeRequestMarkdown({
    createdAt: '2026-04-02T00:00:00.000Z',
    input: {
      title: 'Add homepage testimonials',
      requestedChange: 'Add a testimonials section under the feature cards.',
      likelyFiles: ['apps/site/app/page.tsx', 'apps/site/app/globals.css'],
      verificationExpectations: ['npm run site:typecheck', 'manual visual QA'],
    },
    messageChannel: 'telegram',
    senderName: 'Jeremy',
    requesterSenderId: 'tg:123',
  });

  assert.match(markdown, /# Requested change/);
  assert.match(markdown, /apps\/site\/app\/page\.tsx/);
  assert.match(markdown, /No repository files were changed automatically/);
});
