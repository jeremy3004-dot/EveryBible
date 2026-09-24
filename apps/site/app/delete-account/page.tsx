import type { Metadata } from 'next';

import { LegalDocumentBody } from '../../components/LegalDocumentBody';
import { StaticPageLayout } from '../../components/StaticPageLayout';
import { deleteAccountPage } from '../../lib/legal/delete-account';
import { pageMetadata } from '../../lib/site-metadata';
import { EVERYBIBLE_DELETE_ACCOUNT_PATH } from '../../lib/site-links';

export const metadata: Metadata = pageMetadata({
  title: 'Delete your EveryBible account',
  description:
    'How to delete your EveryBible account in the app or by email, and what is deleted or kept without your name.',
  path: EVERYBIBLE_DELETE_ACCOUNT_PATH,
});

// The text lives in lib/legal/delete-account.ts, which also generates legal/delete-account.html.
export default function DeleteAccountPage() {
  return (
    <StaticPageLayout
      eyebrow="Account"
      title={deleteAccountPage.title}
      intro={deleteAccountPage.intro}
    >
      <LegalDocumentBody document={deleteAccountPage} />
    </StaticPageLayout>
  );
}
