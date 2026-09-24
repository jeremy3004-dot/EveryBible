import { EVERYBIBLE_SITE_URL } from '../site-links';
import { deleteAccountPage } from './delete-account';
import { renderLegalMirrorHtml, type LegalDocument } from './legal-document';
import { privacyPolicy } from './privacy-policy';

/**
 * Static copies in the repo's legal/ folder. They are published separately from the site
 * (a GitHub Pages copy that older store listings link to), so they are generated from the
 * same documents instead of being edited by hand.
 */
export const LEGAL_MIRRORS: ReadonlyArray<{ file: string; document: LegalDocument }> = [
  { file: 'legal/privacy.html', document: privacyPolicy },
  { file: 'legal/delete-account.html', document: deleteAccountPage },
];

export function renderLegalMirrors(): Array<{ file: string; html: string }> {
  return LEGAL_MIRRORS.map(({ file, document }) => ({
    file,
    html: renderLegalMirrorHtml(document, EVERYBIBLE_SITE_URL),
  }));
}
