import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';
import {
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL,
  EVERYBIBLE_SUPPORT_EMAIL_ADDRESS,
  EVERYBIBLE_SUPPORT_PATH,
  EVERYBIBLE_TERMS_PATH,
} from '../../lib/site-links';

export const metadata: Metadata = {
  title: 'EveryBible Privacy Policy',
  description:
    'Read the EveryBible privacy policy covering account data, reading activity, support requests, analytics, and your choices.',
  alternates: {
    canonical: EVERYBIBLE_PRIVACY_PATH,
  },
};

export default function PrivacyPage() {
  return (
    <StaticPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Last updated: April 3, 2026"
    >
      <section>
        <p>
          EveryBible (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) exists to help people read,
          listen to, and share Scripture. This Privacy Policy explains what information we collect,
          how we use it, when it is shared with service providers, and the choices you have when
          you use the EveryBible app, website, and related support services.
        </p>
      </section>

      <section>
        <h2>Information We Collect</h2>
        <h3>Account details</h3>
        <p>When you sign in with Apple or Google, we may receive:</p>
        <ul>
          <li>Your name</li>
          <li>Email address</li>
          <li>Profile photo, if your sign-in provider shares it</li>
        </ul>

        <h3>Reading and app activity</h3>
        <p>We may store information needed to run the app and keep your experience in sync, such as:</p>
        <ul>
          <li>Reading progress and history</li>
          <li>Bookmarks and highlights</li>
          <li>Notes, preferences, and downloaded content metadata</li>
          <li>Basic engagement events and app version information</li>
        </ul>

        <h3>Support messages</h3>
        <p>If you contact us, we may keep your message and the troubleshooting details you send.</p>

        <h3>Local device storage</h3>
        <p>
          Some information, including downloaded Bible content, reading state, and privacy
          preferences, may be stored on your device so EveryBible works offline.
        </p>
      </section>

      <section>
        <h2>How We Use Information</h2>
        <ul>
          <li>Provide Bible reading, listening, search, and sharing features</li>
          <li>Sync your content and progress across devices when you sign in</li>
          <li>Understand reliability and improve app performance</li>
          <li>Respond to support requests and protect the service from misuse</li>
        </ul>
      </section>

      <section>
        <h2>How We Share Information</h2>
        <p>We do not sell your personal information. We may share limited information with service providers that help us operate EveryBible, including:</p>
        <ul>
          <li><strong>Supabase</strong> for authentication, database, and storage services</li>
          <li><strong>Apple</strong> and <strong>Google</strong> for sign-in and app distribution services</li>
          <li>Infrastructure providers that securely deliver website and app content</li>
        </ul>
      </section>

      <section>
        <h2>Analytics and diagnostics</h2>
        <p>
          We may collect product analytics and basic operational diagnostics, such as minutes
          listened, sessions or time spent, chapter completion, playback progress, platform, app
          version, and feature engagement, to understand what is working and what needs to
          improve. Where possible, we keep this usage data separate from your account and use it
          only for analytics and app improvements, not for advertising profiles or cross-app
          tracking. If you sign in, we separately store reading progress, bookmarks, and
          preferences linked to your account so your experience can sync across devices.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          We keep personal information for as long as it is needed to operate the service,
          comply with legal obligations, resolve disputes, or enforce our agreements. You can
          request account or data deletion by contacting us at{' '}
          <a href={EVERYBIBLE_SUPPORT_EMAIL}>{EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}</a>.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Update or correct account information through your sign-in provider where available</li>
          <li>Remove locally stored content by deleting downloads or uninstalling the app</li>
          <li>Request access to or deletion of your personal data by contacting us</li>
        </ul>
      </section>

      <section>
        <h2>Children&apos;s privacy</h2>
        <p>
          EveryBible is built to be used by people of all ages. We do not knowingly collect
          personal information from children in violation of applicable law. If you believe a
          child provided personal information improperly, contact us so we can review and remove
          it if needed.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we make material changes, we
          will update the published date on this page and may also communicate the change through
          the app or website.
        </p>
      </section>

      <section>
        <h2>Related legal pages</h2>
        <ul>
          <li>
            <a href={EVERYBIBLE_TERMS_PATH}>Terms of Service</a>
          </li>
          <li>
            <a href={EVERYBIBLE_SUPPORT_PATH}>Support</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>
          If you have questions about this Privacy Policy, contact us at{' '}
          <a href={EVERYBIBLE_SUPPORT_EMAIL}>{EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}</a>.
        </p>
      </section>
    </StaticPageLayout>
  );
}
