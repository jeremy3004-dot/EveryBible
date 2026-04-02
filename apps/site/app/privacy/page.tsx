import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'Every Seven Nine Privacy Policy',
  description:
    'Read the Every Seven Nine privacy policy covering account data, usage data, storage, third-party services, and user rights.',
};

export default function PrivacyPage() {
  return (
    <StaticPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Last updated: January 25, 2025"
    >
      <section>
        <p>
          Every Seven Nine (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
          protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard
          your information when you use our mobile application and related services.
        </p>
      </section>

      <section>
        <h2>Information We Collect</h2>
        <h3>Account Information</h3>
        <p>When you create an account using Google Sign-In or Apple Sign-In, we may receive:</p>
        <ul>
          <li>Your name</li>
          <li>Email address</li>
          <li>Profile picture, if available from the provider</li>
        </ul>

        <h3>Usage Data</h3>
        <p>We collect information about how you use the app, including:</p>
        <ul>
          <li>Reading progress and history</li>
          <li>Bookmarks and highlights</li>
          <li>App preferences and settings</li>
          <li>
            Approximate location data when you grant permission so activity maps reflect where
            listening and downloads actually happen without storing precise GPS trails
          </li>
        </ul>
      </section>

      <section>
        <h2>How We Use Your Information</h2>
        <ul>
          <li>Provide and maintain the app</li>
          <li>Sync your reading progress across devices</li>
          <li>Personalize your experience</li>
          <li>Send important updates about the app</li>
          <li>Display privacy-safe ministry activity maps based on approximate device location</li>
        </ul>
      </section>

      <section>
        <h2>Approximate Location for Activity Maps</h2>
        <p>
          If you allow location access, EveryBible may collect your approximate location while you
          actively listen to or download Scripture. We use this to place listening and download
          activity on aggregated maps.
        </p>
        <p>
          We do not use background location for this feature, and we intentionally coarsen the
          location before storing it so the map reflects a broad area rather than a precise GPS
          point.
        </p>
      </section>

      <section>
        <h2>Data Storage</h2>
        <p>
          Your data is stored using Supabase and related infrastructure providers that help us run
          authentication, storage, and operational services. We use appropriate security controls
          to protect personal information.
        </p>
      </section>

      <section>
        <h2>Third-Party Services</h2>
        <ul>
          <li><strong>Google Sign-In</strong> for authentication</li>
          <li><strong>Apple Sign-In</strong> for authentication</li>
          <li><strong>Supabase</strong> for data storage and auth infrastructure</li>
        </ul>
      </section>

      <section>
        <h2>Your Rights</h2>
        <ul>
          <li>Access your personal data</li>
          <li>Request deletion of your data</li>
          <li>Export your data</li>
          <li>Opt out of non-essential data collection where applicable</li>
        </ul>
      </section>

      <section>
        <h2>Children&apos;s Privacy</h2>
        <p>
          Our app is intended to be usable by all ages. We do not knowingly collect personal
          information from children under 13 without appropriate consent.
        </p>
      </section>

      <section>
        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will update the published date
          on this page when material changes are made.
        </p>
      </section>

      <section>
        <h2>Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy, contact us at{' '}
          <a href="mailto:curryj@protonmail.com">curryj@protonmail.com</a>.
        </p>
      </section>
    </StaticPageLayout>
  );
}
