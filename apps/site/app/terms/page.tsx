import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'EveryBible Terms of Service',
  description:
    'Read the EveryBible terms covering acceptable use, accounts, intellectual property, and limitations of liability.',
};

export default function TermsPage() {
  return (
    <StaticPageLayout
      eyebrow="Legal"
      title="Terms of Service"
      intro="Last updated: January 25, 2025"
    >
      <section>
        <p>
          Welcome to EveryBible. By downloading, installing, or using our app and related
          services, you agree to these Terms of Service.
        </p>
      </section>

      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By using EveryBible, you agree to be bound by these Terms. If you do not agree, do not
          use the service.
        </p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>EveryBible provides:</p>
        <ul>
          <li>Access to Bible texts</li>
          <li>Audio Bible listening</li>
          <li>Reading progress tracking</li>
          <li>Discipleship and Scripture engagement features</li>
        </ul>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>
          Some features require an account created through supported sign-in providers. You are
          responsible for maintaining the confidentiality of your account and for activity that
          occurs under it.
        </p>
      </section>

      <section>
        <h2>4. Acceptable Use</h2>
        <ul>
          <li>Do not use the app for unlawful purposes.</li>
          <li>Do not attempt unauthorized access to our systems.</li>
          <li>Do not interfere with service functionality.</li>
          <li>Do not copy or redistribute protected content without permission.</li>
        </ul>
      </section>

      <section>
        <h2>5. Intellectual Property</h2>
        <p>
          The app and its original content, excluding Bible texts and other third-party content
          distributed under their own licenses, are owned by EveryBible and protected by
          applicable law.
        </p>
        <p>
          The Berean Bible texts bundled in EveryBible are public domain, and the BSB audio used
          by the app is dedicated to the public domain under CC0 1.0.
        </p>
      </section>

      <section>
        <h2>6. Disclaimer of Warranties</h2>
        <p>
          The app is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
          uninterrupted or error-free service.
        </p>
      </section>

      <section>
        <h2>7. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, EveryBible is not liable for indirect,
          incidental, special, or consequential damages arising from your use of the service.
        </p>
      </section>

      <section>
        <h2>8. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Significant changes may be communicated
          through the app, website, or email.
        </p>
      </section>

      <section>
        <h2>9. Termination</h2>
        <p>
          We may suspend or terminate access for violations of these Terms. You may stop using the
          service at any time.
        </p>
      </section>

      <section>
        <h2>10. Governing Law</h2>
        <p>These Terms are governed by the laws of the United States.</p>
      </section>

      <section>
        <h2>11. Contact Us</h2>
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:curryj@protonmail.com">curryj@protonmail.com</a>.
        </p>
      </section>
    </StaticPageLayout>
  );
}
