import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';
import { pageMetadata } from '../../lib/site-metadata';
import { EVERY_LANGUAGE_URL } from '../../lib/site-links';

export const metadata: Metadata = pageMetadata({
  title: 'About EveryBible',
  description:
    'EveryBible is part of Every Language, serving churches and communities working toward the whole Bible in every language.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <StaticPageLayout
      eyebrow="About"
      title="God’s Word. In your heart language."
      intro="EveryBible helps you read and listen to God’s Word in your own language. It is part of Every Language."
    >
      <section id="mission">
        <h2>Our mission</h2>
        <p>
          Encouraging and equipping every person to seek intimacy with God every day in their own
          language.
        </p>
        <p>
          We serve local churches and language communities working toward the whole Bible in every
          language, in this generation.
        </p>
      </section>

      <section id="languages">
        <h2>The whole Bible in every language</h2>
        <p>
          Explore languages and dialects around the world on the map. Red means no known Scripture.
          The map includes languages that are not yet available in the app.
        </p>
        <p>
          Find out how your church can take part at <a href={EVERY_LANGUAGE_URL}>Every Language</a>.
        </p>
      </section>

      <section id="offline">
        <h2>Read and listen offline</h2>
        <p>Download Scripture to read or listen without a signal.</p>
        <ul>
          <li>Free access without ads or in-app purchases.</li>
          <li>Daily Scripture, sharing, and discipleship resources.</li>
        </ul>
      </section>
    </StaticPageLayout>
  );
}
