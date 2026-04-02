import type {
  HomepageActionLink,
  HomepageContentOverridePayload,
  HomepageFeatureCardOverride,
  HomepageHeroContentOverride,
  HomepageStoreLink,
  HomepageVerseOfDayOverride,
} from '@everybible/types';
import { Static, Type } from '@sinclair/typebox';
import type { OpenClawPluginToolContext } from 'openclaw/plugin-sdk/plugin-entry';

import {
  getHomepageOverrideEntry,
  updateHomepageOverride,
} from '../supabase';

const schemaOptions = { additionalProperties: false } as const;

const homepageActionLinkSchema = Type.Object(
  {
    label: Type.String(),
    href: Type.String(),
  },
  schemaOptions
);

const homepageStoreLinkSchema = Type.Object(
  {
    label: Type.String(),
    href: Type.String(),
    eyebrow: Type.String(),
    platform: Type.Union([Type.Literal('google-play'), Type.Literal('app-store')]),
  },
  schemaOptions
);

const homepageHeroSchema = Type.Object(
  {
    title: Type.String(),
    description: Type.String(),
    visual: Type.Object(
      {
        src: Type.String(),
        alt: Type.String(),
      },
      schemaOptions
    ),
    storeLinks: Type.Array(homepageStoreLinkSchema, { minItems: 1 }),
    inlineLink: homepageActionLinkSchema,
  },
  schemaOptions
);

const homepageFeatureCardSchema = Type.Object(
  {
    title: Type.String(),
    description: Type.String(),
    href: Type.String(),
    actionLabel: Type.String(),
    iconSrc: Type.String(),
    iconAlt: Type.String(),
  },
  schemaOptions
);

const homepageVerseSchema = Type.Object(
  {
    label: Type.String(),
    verse: Type.String(),
    reference: Type.String(),
    imageSrc: Type.String(),
    imageAlt: Type.String(),
    primaryAction: homepageActionLinkSchema,
    secondaryAction: homepageActionLinkSchema,
  },
  schemaOptions
);

export const homepageContentSchema = Type.Object(
  {
    hero: homepageHeroSchema,
    featureCards: Type.Array(homepageFeatureCardSchema, { minItems: 1 }),
    verseOfDay: homepageVerseSchema,
  },
  schemaOptions
);

type HomepageToolInput = Static<typeof homepageContentSchema>;

function mapActionLink(input: HomepageToolInput['hero']['inlineLink']): HomepageActionLink {
  return {
    label: input.label.trim(),
    href: input.href.trim(),
  };
}

function mapStoreLink(input: HomepageToolInput['hero']['storeLinks'][number]): HomepageStoreLink {
  return {
    label: input.label.trim(),
    href: input.href.trim(),
    eyebrow: input.eyebrow.trim(),
    platform: input.platform,
  };
}

function mapHero(input: HomepageToolInput['hero']): HomepageHeroContentOverride {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    visual: {
      src: input.visual.src.trim(),
      alt: input.visual.alt.trim(),
    },
    storeLinks: input.storeLinks.map(mapStoreLink),
    inlineLink: mapActionLink(input.inlineLink),
  };
}

function mapFeatureCard(
  input: HomepageToolInput['featureCards'][number]
): HomepageFeatureCardOverride {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    href: input.href.trim(),
    actionLabel: input.actionLabel.trim(),
    iconSrc: input.iconSrc.trim(),
    iconAlt: input.iconAlt.trim(),
  };
}

function mapVerseOfDay(input: HomepageToolInput['verseOfDay']): HomepageVerseOfDayOverride {
  return {
    label: input.label.trim(),
    verse: input.verse.trim(),
    reference: input.reference.trim(),
    imageSrc: input.imageSrc.trim(),
    imageAlt: input.imageAlt.trim(),
    primaryAction: mapActionLink(input.primaryAction),
    secondaryAction: mapActionLink(input.secondaryAction),
  };
}

export function validateHomepagePayload(
  input: HomepageToolInput
): HomepageContentOverridePayload {
  return {
    hero: mapHero(input.hero),
    featureCards: input.featureCards.map(mapFeatureCard),
    verseOfDay: mapVerseOfDay(input.verseOfDay),
  };
}

export function buildHomepageAuditMetadata(context: {
  channel: string | null;
  requesterDisplayName: string | null;
  requesterSenderId: string | null;
  toolName: string;
}) {
  return {
    actorSource: 'openclaw',
    channel: context.channel,
    changedFields: ['hero', 'featureCards', 'verseOfDay'],
    requesterDisplayName: context.requesterDisplayName,
    requesterSenderId: context.requesterSenderId,
    targetSlug: 'homepage',
    toolName: context.toolName,
  };
}

export function buildHomepageSummary(payload: HomepageContentOverridePayload): string {
  return `Updated homepage override with hero "${payload.hero.title}" and ${payload.featureCards.length} feature card(s).`;
}

export function createGetHomepageContentTool(context: OpenClawPluginToolContext) {
  return {
    name: 'get_homepage_content',
    label: 'Get Homepage Content',
    description:
      'Read the published EveryBible homepage override status and the currently stored live payload.',
    ownerOnly: true,
    parameters: Type.Object({}, schemaOptions),
    async execute() {
      const entry = await getHomepageOverrideEntry();

      if (!entry || !entry.content) {
        return {
          content: [
            {
              type: 'text' as const,
              text:
                'No live homepage override is published. The public site is using its checked-in fallback content.',
            },
          ],
          details: {
            status: 'ok',
            source: 'fallback',
            slug: 'homepage',
          },
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Live homepage override is ${entry.state} for slug "${entry.slug}".`,
          },
        ],
        details: {
          status: 'ok',
          source: 'live',
          entry,
          requesterSenderId: context.requesterSenderId ?? null,
        },
      };
    },
  };
}

export function createUpdateHomepageContentTool(context: OpenClawPluginToolContext) {
  return {
    name: 'update_homepage_content',
    label: 'Update Homepage Content',
    description:
      'Publish a validated homepage override for EveryBible. This only affects the approved homepage contract.',
    ownerOnly: true,
    parameters: homepageContentSchema,
    async execute(_toolCallId: string, params: HomepageToolInput) {
      const payload = validateHomepagePayload(params);
      const summary = buildHomepageSummary(payload);
      const entry = await updateHomepageOverride({
        channel: context.messageChannel ?? null,
        changedFields: ['hero', 'featureCards', 'verseOfDay'],
        payload,
        requesterDisplayName: null,
        requesterSenderId: context.requesterSenderId ?? null,
        summary,
        toolName: 'update_homepage_content',
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `${summary} The live override is now published.`,
          },
        ],
        details: {
          status: 'ok',
          entry,
          audit: buildHomepageAuditMetadata({
            channel: context.messageChannel ?? null,
            requesterDisplayName: null,
            requesterSenderId: context.requesterSenderId ?? null,
            toolName: 'update_homepage_content',
          }),
        },
      };
    },
  };
}
