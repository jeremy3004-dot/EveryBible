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
  title: 'EveryBible Terms of Service',
  description:
    'Read the EveryBible terms covering acceptable use, content licensing, accounts, service availability, and liability.',
  alternates: {
    canonical: EVERYBIBLE_TERMS_PATH,
  },
};

export default function TermsPage() {
  return (
    <StaticPageLayout
      eyebrow="Legal"
      title="Terms of Service"
      intro="Last updated: April 3, 2026"
    >
      <section>
        <p>
          Welcome to EveryBible. By downloading, installing, accessing, or using our app, website,
          and related services, you agree to these Terms of Service.
        </p>
      </section>

      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          If you do not agree to these Terms, do not use EveryBible. If you use EveryBible on
          behalf of an organization, you confirm that you have authority to bind that organization
          to these Terms.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>EveryBible provides:</p>
        <ul>
          <li>Access to Bible text, audio, and study-oriented Scripture features</li>
          <li>Reading progress, bookmarks, highlights, notes, and related sync tools</li>
          <li>Website content, downloads, support resources, and account services</li>
        </ul>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>
          Some features require an account created through supported sign-in providers. You are
          responsible for maintaining the confidentiality of your account and for activity that
          occurs under it. You agree to provide accurate information and to notify us if you
          believe your account has been used without authorization.
        </p>
      </section>

      <section>
        <h2>4. Acceptable Use</h2>
        <ul>
          <li>Do not use the app for unlawful purposes.</li>
          <li>Do not attempt unauthorized access to our systems.</li>
          <li>Do not interfere with service functionality, availability, or security.</li>
          <li>Do not scrape, copy, or redistribute protected content unless a license allows it.</li>
          <li>Do not upload malicious code, spam, or abusive content into EveryBible services.</li>
        </ul>
      </section>

      <section>
        <h2>5. Content and intellectual property</h2>
        <p>
          The app and its original content, excluding Bible texts and other third-party content
          distributed under their own licenses, are owned by EveryBible and protected by
          applicable law.
        </p>
        <p>
          Some Bible text, audio, and translation metadata available through EveryBible come from
          third-party licensors or public-domain sources and remain subject to their respective
          terms. You are responsible for respecting those terms when sharing or reusing content.
        </p>
      </section>

      <section>
        <h2>6. Service availability and changes</h2>
        <p>
          We may update, improve, suspend, or discontinue parts of EveryBible at any time. We do
          not guarantee that every feature, translation, or audio source will always be available.
        </p>
      </section>

      <section>
        <h2>7. Disclaimer of Warranties</h2>
        <p>
          The app is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
          uninterrupted or error-free service.
        </p>
      </section>

      <section>
        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, EveryBible is not liable for indirect,
          incidental, special, or consequential damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate access for violations of these Terms or to protect the
          service, our users, or our ministry operations. You may stop using EveryBible at any
          time.
        </p>
      </section>

      <section>
        <h2>10. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we will update
          the published date on this page and may also communicate the changes through the app or
          website.
        </p>
      </section>

      <section>
        <h2>11. Governing Law</h2>
        <p>These Terms are governed by the laws of the United States.</p>
      </section>

      <section>
        <h2>12. Related pages</h2>
        <ul>
          <li>
            <a href={EVERYBIBLE_PRIVACY_PATH}>Privacy Policy</a>
          </li>
          <li>
            <a href={EVERYBIBLE_SUPPORT_PATH}>Support</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>13. Contact us</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href={EVERYBIBLE_SUPPORT_EMAIL}>{EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}</a>.
        </p>
      </section>
    </StaticPageLayout>
  );
}
