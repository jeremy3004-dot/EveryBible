import type { Metadata } from 'next';

import { StaticPageLayout } from '../../components/StaticPageLayout';

export const metadata: Metadata = {
  title: 'Give to Every Language',
  description: 'Help native speakers translate the whole Bible into their heart language. Give to Every Language.',
};

export default function GivePage() {
  return (
    <StaticPageLayout
      eyebrow="Give to Every Language"
      title="Help bring the Bible into every language."
      intro="Your gift helps native speakers translate the whole Bible into their heart language, with the global Church coming alongside them in giving and prayer."
    >
      <section>
        <h2>Be part of the work</h2>
        <p>
          EveryBible is part of Every Language. Give toward the vision of the whole Bible
          for every language community.
        </p>
        <p>
          <a className="giving-button" href="https://www.paypal.com/donate?hosted_button_id=4KH6QMKS42RC4">
            Give to Every Language
          </a>
        </p>
        <p>Donate securely through PayPal.</p>
      </section>
      <section>
        <h2>Give by bank transfer</h2>
        <p>
          <a href="https://everylanguage.com/wp-content/uploads/2025/12/EVERY-LANGUAGE-Morgan-Stanley-Bank-ACH-and-Wire-Transfer-Details-DEC-2025.pdf">
            View ACH and wire transfer instructions
          </a>
        </p>
        <p>
          Questions about giving? Email <a href="mailto:TEAM@EveryLanguage.com">team@everylanguage.com</a>.
        </p>
        <p><a href="https://everylanguage.com/give/">Learn more at Every Language</a></p>
      </section>
    </StaticPageLayout>
  );
}
