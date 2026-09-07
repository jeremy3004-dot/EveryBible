import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';
import { EVERY_LANGUAGE_URL } from '../../lib/site-links';

export const metadata: Metadata = {
  title: 'About EveryBible',
  description:
    'Learn why EveryBible exists and how the ministry is working to provide God’s Word free of charge in every language.',
};

export default function AboutPage() {
  return (
    <StaticPageLayout
      eyebrow="About"
      title="God’s Word. In your heart language."
      intro="EveryBible helps people engage with God’s Word in their heart language. It is part of Every Language, serving local churches and language communities working toward the whole Bible in every language, in this generation."
    >
      <section id="mission">
        <h2>Our mission</h2>
        <p>
          Encouraging and equipping every person to seek intimacy with God every day in their own
          language.
        </p>
        <p>
          Local churches and language communities are at the heart of this work. EveryBible helps
          people read, listen, and grow closer to God through Scripture in the language they
          understand best.
        </p>
      </section>

      <section id="languages">
        <h2>The whole Bible in every language</h2>
        <p>
          The language atlas helps you explore languages and dialects around the world and what is
          known about Scripture availability in each. Red marks those for which our sources have no
          documented Scripture. The atlas is a research collection; translations available in the
          app are a separate collection.
        </p>
        <p>
          Learn more about the vision and how your church can take part at{' '}
          <a href={EVERY_LANGUAGE_URL}>Every Language</a>.
        </p>
      </section>

      <section id="offline">
        <h2>Built for the heart of Africa and the heights of the Himalayas.</h2>
        <p>
          Download available Scripture to read or listen wherever you are, even without a signal.
        </p>
        <ul>
          <li>Free access without ads or in-app purchases.</li>
          <li>Offline reading and listening for downloaded Scripture.</li>
          <li>Simple daily Scripture, sharing, and discipleship-oriented features.</li>
        </ul>
      </section>
    </StaticPageLayout>
  );
}
