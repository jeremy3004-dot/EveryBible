import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';
import { supportChannels } from '../../lib/site-content';

export const metadata: Metadata = {
  title: 'Support EveryBible',
  description:
    'Find download links, privacy and account help, and direct support contact information for EveryBible.',
};

export default function SupportPage() {
  return (
    <StaticPageLayout
      eyebrow="Support"
      title="Get help, install the app, and contact the EveryBible team."
      intro="Use the links below for downloads, legal information, and direct support questions."
    >
      <section>
        <h2>Download EveryBible</h2>
        <ul>
          <li>
            <a href={supportChannels.appStoreUrl}>Download on the App Store</a>
          </li>
          <li>
            <a href={supportChannels.googlePlayUrl}>Get it on Google Play</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>Need support?</h2>
        <p>
          For account issues, privacy questions, or ministry-related support, email the team and
          include as much context as you can about your device, language, and what went wrong.
        </p>
        <p>
          <a href={supportChannels.supportEmail}>curryj@protonmail.com</a>
        </p>
      </section>

      <section>
        <h2>Helpful links</h2>
        <ul>
          <li>
            <a href="/privacy">Privacy Policy</a>
          </li>
          <li>
            <a href="/terms">Terms of Service</a>
          </li>
          <li>
            <a href="/about">About EveryBible</a>
          </li>
        </ul>
      </section>
    </StaticPageLayout>
  );
}
