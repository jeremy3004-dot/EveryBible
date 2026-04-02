import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'About EveryBible',
  description:
    'Learn why EveryBible exists and how the ministry is working to provide God’s Word free of charge in every language.',
};

export default function AboutPage() {
  return (
    <StaticPageLayout
      eyebrow="About"
      title="A digital ministry working toward free Bible access in every language."
      intro="EveryBible exists to help people read, listen to, and share Scripture in their own language, with a simple experience that works online or offline."
    >
      <section id="mission">
        <h2>Our mission</h2>
        <p>
          EveryBible is building toward a future where every person can encounter God’s Word free
          of charge, in the language they understand best, without advertising, paywalls, or
          technical complexity getting in the way.
        </p>
        <p>
          The product starts with a mobile-first Bible experience and is now being expanded with a
          public web presence and internal operational tooling so distribution and ministry support
          can scale responsibly.
        </p>
      </section>

      <section id="languages">
        <h2>Language reach</h2>
        <p>
          The current platform direction is designed around broad Scripture access, with support
          for thousands of Bible versions across more than 1,600 languages and a long-term goal of
          making the whole Bible available in every language where people are still waiting.
        </p>
      </section>

      <section>
        <h2>What makes EveryBible different</h2>
        <ul>
          <li>Free access without ads or in-app purchases.</li>
          <li>Offline-friendly reading and listening for low-connectivity contexts.</li>
          <li>Simple daily Scripture, sharing, and discipleship-oriented features.</li>
          <li>Operational tooling that helps the team ship content and translation availability safely.</li>
        </ul>
      </section>
    </StaticPageLayout>
  );
}
