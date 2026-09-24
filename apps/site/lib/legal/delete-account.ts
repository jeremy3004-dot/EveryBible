import {
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL_ADDRESS,
} from '../site-links';
import type { LegalDocument } from './legal-document';
import { PRIVACY_POLICY_LAST_UPDATED } from './privacy-policy';

const DELETION_EMAIL_SUBJECT = 'Delete my EveryBible account';
export const DELETION_REQUEST_MAILTO = `mailto:${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}?subject=${encodeURIComponent(DELETION_EMAIL_SUBJECT)}`;

/**
 * The account deletion page at everybible.app/delete-account (the web URL Google Play asks
 * for), copied to legal/delete-account.html. What is deleted and kept matches
 * docs/research/account-deletion-data-map-2026-09-24.md.
 */
export const deleteAccountPage: LegalDocument = {
  title: 'Delete your EveryBible account',
  intro: `Last updated: ${PRIVACY_POLICY_LAST_UPDATED}`,
  path: EVERYBIBLE_DELETE_ACCOUNT_PATH,
  sections: [
    {
      id: 'in-app',
      heading: 'Delete your account in the app',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Open EveryBible and make sure you are signed in.',
            'Tap the **More** tab, then **Settings**.',
            'Scroll to the **Data** section and tap **Delete Account**.',
            'Tap **Delete** to confirm.',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Your account is deleted straight away and you are signed out. This cannot be undone. You can keep using EveryBible without an account, or create a new one later.',
        },
      ],
    },
    {
      id: 'by-email',
      heading: 'Ask us to delete it without the app',
      blocks: [
        {
          kind: 'paragraph',
          text: `If you no longer have the app, email [${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}](${DELETION_REQUEST_MAILTO}) from the email address you use for your EveryBible account, with the subject "${DELETION_EMAIL_SUBJECT}". If you signed in with Apple and hid your email address, tell us so we can find your account.`,
        },
        {
          kind: 'paragraph',
          text: 'We aim to complete requests within 7 business days and will email you when your account has been deleted.',
        },
      ],
    },
    {
      id: 'deleted',
      heading: 'What we delete',
      blocks: [
        {
          kind: 'list',
          items: [
            'your sign-in and account',
            'your profile: name, email address and profile photo',
            'your synced reading progress, reading plans, translation choices and settings',
            'your push notification tokens',
            'voice recordings you sent with chapter feedback',
          ],
        },
        {
          kind: 'paragraph',
          text: 'When you delete in the app, the app also signs out and removes the notes and other private data saved on that device for your account.',
        },
      ],
    },
    {
      id: 'kept',
      heading: 'What we keep, without your name',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Some information stays after deletion, with nothing that links it to you:',
        },
        {
          kind: 'list',
          items: [
            '**Usage statistics.** The link to your account is removed. The records keep a random session number, app version, platform and approximate location (about 10 km), and are deleted 13 months after they were recorded.',
            '**Chapter feedback.** The rating, comment, the role you entered (for example, "pastor") and the chapter stay for the translation teams. Your name, voice recording and hashed IP address are removed.',
            '**Crash reports.** These were never linked to your account and are deleted after 90 days.',
          ],
        },
        {
          kind: 'paragraph',
          text: `Feedback sent while you were not signed in is not linked to an account, so deleting an account cannot find it. To have it removed, email ${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS} with the name you used and the translation and chapter.`,
        },
      ],
    },
    {
      id: 'apple',
      heading: 'If you signed in with Apple',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You can also stop using Sign in with Apple for EveryBible in your Apple Account settings, under Sign in with Apple.',
        },
      ],
    },
    {
      id: 'more',
      heading: 'More information',
      blocks: [
        {
          kind: 'paragraph',
          text: `Read our [Privacy Policy](${EVERYBIBLE_PRIVACY_PATH}) for everything we collect and how long we keep it. Questions? Email ${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}.`,
        },
      ],
    },
  ],
};
