import type { Metadata } from 'next';

import { LegalDocumentBody } from '../../components/LegalDocumentBody';
import { StaticPageLayout } from '../../components/StaticPageLayout';
import { privacyPolicy } from '../../lib/legal/privacy-policy';
import { pageMetadata } from '../../lib/site-metadata';
import { EVERYBIBLE_PRIVACY_PATH } from '../../lib/site-links';

export const metadata: Metadata = pageMetadata({
  title: 'EveryBible Privacy Policy',
  description:
    'What the EveryBible app and website collect, who can see it, how long it is kept, and how to delete your account.',
  path: EVERYBIBLE_PRIVACY_PATH,
});

// The text lives in lib/legal/privacy-policy.ts, which also generates legal/privacy.html.
export default function PrivacyPage() {
  return (
    <StaticPageLayout eyebrow="Legal" title={privacyPolicy.title} intro={privacyPolicy.intro}>
      <LegalDocumentBody document={privacyPolicy} />
    </StaticPageLayout>
  );
}
