import {
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL,
  EVERYBIBLE_SUPPORT_EMAIL_ADDRESS,
  EVERYBIBLE_SUPPORT_PATH,
  EVERYBIBLE_TERMS_PATH,
} from '../site-links';
import type { LegalDocument } from './legal-document';

export const PRIVACY_POLICY_LAST_UPDATED = 'September 24, 2026';

const email = `[${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}](${EVERYBIBLE_SUPPORT_EMAIL})`;

/**
 * The privacy policy shown at everybible.app/privacy and copied to legal/privacy.html.
 * Every statement here is checked against the app and server code; see
 * docs/release/privacy-policy-changes-2026-09-24.md for the sources.
 */
export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  intro: `Last updated: ${PRIVACY_POLICY_LAST_UPDATED}`,
  path: EVERYBIBLE_PRIVACY_PATH,
  sections: [
    {
      id: 'about',
      heading: 'About this policy',
      blocks: [
        {
          kind: 'paragraph',
          text: 'EveryBible ("we", "our" or "us") helps people read, listen to and share the Bible. This policy explains what information the EveryBible app and website collect, why, who can see it, how long we keep it, and how you can delete it.',
        },
        {
          kind: 'paragraph',
          text: 'We do not sell your information. We do not show ads, and we do not track you across other apps or websites.',
        },
      ],
    },
    {
      id: 'summary',
      heading: 'The short version',
      blocks: [
        {
          kind: 'list',
          items: [
            'You can read and listen without an account.',
            'Even without an account, the app sends us usage statistics with an approximate location worked out from your IP address, and anonymous crash reports.',
            'If you create an account, we store what we need to sync your reading across devices.',
            'If you send feedback on a Bible chapter, the translation reviewers for that translation can see it, including your name and any voice recording.',
            `You can delete your account in the app at any time. See [how account deletion works](${EVERYBIBLE_DELETE_ACCOUNT_PATH}).`,
          ],
        },
      ],
    },
    {
      id: 'usage',
      heading: 'Usage statistics',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The app records how it is used, so we can see which translations and features people use and where the app is reaching. It records when you open and leave the app, which chapters you open, how long you read, how much you listen and which chapters you finish, downloads of Bible text and audio, and some actions in your library. Each record includes the app version, whether you use iOS or Android, and a random session number that changes each time you open the app.',
        },
        {
          kind: 'paragraph',
          text: 'If you are signed in, these records are linked to your account. If you are not, they are not linked to any account.',
        },
      ],
    },
    {
      id: 'location',
      heading: 'Approximate location',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We work out your approximate location from your IP address: country, region, city, time zone, and map coordinates rounded to one decimal place (about 10 km). This is stored with the usage statistics above and used for statistics, such as how many people read in each country.',
        },
        {
          kind: 'paragraph',
          text: 'We do not use GPS and never ask for your device location. We do not store your IP address with these records. The app first asks a small location service we run on Cloudflare, and keeps its answer on your device for up to three hours. If that answer is not available, our server may look up your IP address with an IP location service (ipinfo.io or ipapi.co).',
        },
      ],
    },
    {
      id: 'crash-reports',
      heading: 'Crash and error reports',
      blocks: [
        {
          kind: 'paragraph',
          text: 'When the app crashes or runs into an error, it sends us a report so we can fix the problem. A report contains the type of error, a shortened error message with web addresses, email addresses, codes and long numbers removed, the names of the parts of the app and the screen involved, the app version and build, your operating system and its version, and a random ID created for this installation of the app.',
        },
        {
          kind: 'paragraph',
          text: 'Reports are not linked to your account. They do not contain your name, email address, notes or IP address. We delete them after 90 days.',
        },
      ],
    },
    {
      id: 'account',
      heading: 'If you create an account',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You can sign in with Apple, with Google, or with an email address and password. We receive your email address, and your name if the sign-in provider shares it. You can also add a profile photo that you choose from your photo library.',
        },
        {
          kind: 'paragraph',
          text: 'While you are signed in, we store the following so your reading stays in sync across devices:',
        },
        {
          kind: 'list',
          items: [
            'reading progress: chapters read, where you are reading, and your reading streak',
            'reading plan progress and the Bible translations you choose',
            'settings: text size, theme, languages, the country you choose, reminder time, whether notifications are on, and the name and role you use for chapter feedback',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Your notes, highlights and bookmarks stay on your device. They are not uploaded to us.',
        },
      ],
    },
    {
      id: 'feedback',
      heading: 'Chapter feedback and voice recordings',
      blocks: [
        {
          kind: 'paragraph',
          text: 'You can give a Bible chapter a thumbs up or down, add a comment, and record a voice answer of up to 60 seconds. To send feedback you enter a name and your role (for example, "pastor"). With your feedback we store the translation, book and chapter, your rating, comment, name and role, the languages you chose, the app version and platform, your voice recording if you made one, and a scrambled (hashed) form of your IP address that we use to stop spam.',
        },
        {
          kind: 'paragraph',
          text: '**Who sees it:** the EveryBible team and the people who review feedback for that translation (translation teams and the Scripture council). They can see your name, role, comment and recording. Recordings are stored privately and reviewers can only open them through links that expire after a short time.',
        },
        {
          kind: 'paragraph',
          text: 'If you are signed in when you send feedback, it is linked to your account and you can see it under **My feedback** in Settings. If you are not signed in, it is not linked to any account.',
        },
      ],
    },
    {
      id: 'notifications',
      heading: 'Notifications',
      blocks: [
        {
          kind: 'paragraph',
          text: "If you are signed in and allow notifications, we store your device's push token and whether it is an iOS or Android device, so we can send notifications to it. Notifications are delivered through Expo's push service and Apple or Google. The token is switched off when you sign out and deleted when you delete your account.",
        },
      ],
    },
    {
      id: 'groups',
      heading: 'Groups and prayer requests',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Groups you create in the app are stored only on your device. Shared study groups and a prayer wall are not available yet. We will update this policy before they are.',
        },
      ],
    },
    {
      id: 'device',
      heading: 'On your device',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Downloaded Bible text and audio, your notes, highlights and bookmarks, your reading position and your privacy settings are stored on your device so EveryBible works offline. The app also keeps a short log of recent errors on your device.',
        },
      ],
    },
    {
      id: 'support',
      heading: 'Support messages',
      blocks: [
        {
          kind: 'paragraph',
          text: 'If you email us, we keep your message and any details you send for as long as we need them to help you.',
        },
      ],
    },
    {
      id: 'sharing',
      heading: 'Who we share information with',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We do not sell your information. We use these service providers to run EveryBible, and they handle information only to provide their service to us:',
        },
        {
          kind: 'list',
          items: [
            '**Supabase**: accounts, database, file storage and server functions',
            '**Cloudflare**: the approximate location service and Bible text and audio downloads',
            '**ipinfo.io** and **ipapi.co**: IP address lookups for approximate location, when needed',
            '**Apple** and **Google**: sign-in, app distribution and notification delivery',
            '**Expo**: notification delivery',
            '**Vercel**: hosting for this website',
          ],
        },
        {
          kind: 'paragraph',
          text: 'Some Bible text and audio is downloaded directly from public Bible sources, such as eBible.org. Like any website, those sources see your IP address when your device downloads from them.',
        },
        {
          kind: 'paragraph',
          text: 'Information is sent between the app and our servers over encrypted connections. The website does not use analytics or advertising scripts.',
        },
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep information',
      blocks: [
        {
          kind: 'list',
          items: [
            'Crash and error reports: 90 days.',
            'Usage statistics and approximate location: 13 months. After that we keep only monthly totals.',
            'Account information, synced progress and settings: until you delete your account.',
            'Chapter feedback: as long as it is useful for translation work. If you delete your account, your name and voice recording are removed from it (see below).',
            'Push tokens: until you delete your account.',
          ],
        },
      ],
    },
    {
      id: 'deletion',
      heading: 'Deleting your account',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'In the app, go to **More → Settings → Data → Delete Account**. Your account is deleted straight away. You can also ask us by email. Full details are on our [account deletion page](' +
            EVERYBIBLE_DELETE_ACCOUNT_PATH +
            ').',
        },
        {
          kind: 'paragraph',
          text: 'We delete your sign-in, profile (name, email address and photo), synced progress, reading plans and settings, push tokens, and your chapter feedback voice recordings.',
        },
        {
          kind: 'paragraph',
          text: 'We keep some information without anything that links it to you:',
        },
        {
          kind: 'list',
          items: [
            'Usage statistics stay, but the link to your account is removed. They keep the session number, app version, platform and approximate location, and are deleted on the normal 13-month schedule.',
            'Chapter feedback you sent stays for the translation teams: the rating, comment, role and chapter. Your name, voice recording and hashed IP address are removed from it.',
            'Crash reports were never linked to your account and are deleted after 90 days.',
          ],
        },
        {
          kind: 'paragraph',
          text: `Feedback sent while you were not signed in is not linked to an account, so deleting an account cannot find it. To have it removed, email ${email} with the name you used and the translation and chapter.`,
        },
      ],
    },
    {
      id: 'choices',
      heading: 'Your choices',
      blocks: [
        {
          kind: 'list',
          items: [
            'Use the app without an account.',
            'Choose whether to allow notifications, and turn them off at any time in the app or in your device settings.',
            'Change your profile photo, and the name and role you use for chapter feedback, in the app.',
            'Remove downloads on your device, or uninstall the app to remove everything stored on it.',
            'Delete your account in the app, or ask us to delete it.',
            `Ask us for a copy of your information, or to correct it, by emailing ${email}.`,
          ],
        },
        {
          kind: 'paragraph',
          text: 'There is currently no setting to turn off usage statistics or crash reports.',
        },
      ],
    },
    {
      id: 'children',
      heading: "Children's privacy",
      blocks: [
        {
          kind: 'paragraph',
          text: 'EveryBible is built to be used by people of all ages. We do not knowingly collect personal information from children in violation of applicable law. If you believe a child provided personal information improperly, contact us so we can review and remove it if needed.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        {
          kind: 'paragraph',
          text: 'We may update this policy from time to time. When we make material changes, we will update the date at the top of this page and may also tell you in the app or on the website.',
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Contact us',
      blocks: [
        {
          kind: 'paragraph',
          text: `If you have questions about this policy or your information, email ${email}. See also our [Terms of Service](${EVERYBIBLE_TERMS_PATH}) and [Support](${EVERYBIBLE_SUPPORT_PATH}) pages.`,
        },
      ],
    },
  ],
};
