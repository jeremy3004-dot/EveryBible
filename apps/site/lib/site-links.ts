export const EVERYBIBLE_SITE_URL = 'https://everybible.app';
export const EVERYBIBLE_SUPPORT_PATH = '/support';
export const EVERYBIBLE_PRIVACY_PATH = '/privacy';
export const EVERYBIBLE_TERMS_PATH = '/terms';
export const EVERYBIBLE_SMART_DOWNLOAD_PATH = '/download';
export const EVERYBIBLE_APP_STORE_URL = 'https://apps.apple.com/us/app/every-bible/id6758254335';
export const EVERYBIBLE_GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.everybible.app';

export const EVERYBIBLE_PRIVACY_URL = `${EVERYBIBLE_SITE_URL}${EVERYBIBLE_PRIVACY_PATH}`;
export const EVERYBIBLE_TERMS_URL = `${EVERYBIBLE_SITE_URL}${EVERYBIBLE_TERMS_PATH}`;
export const EVERYBIBLE_SUPPORT_URL = `${EVERYBIBLE_SITE_URL}${EVERYBIBLE_SUPPORT_PATH}`;
export const EVERYBIBLE_SMART_DOWNLOAD_URL = `${EVERYBIBLE_SITE_URL}${EVERYBIBLE_SMART_DOWNLOAD_PATH}`;

export const EVERYBIBLE_SUPPORT_EMAIL_ADDRESS = 'hello@everybible.app';
export const EVERYBIBLE_SUPPORT_EMAIL = `mailto:${EVERYBIBLE_SUPPORT_EMAIL_ADDRESS}`;

export function resolveSmartDownloadTarget(userAgent: string | null | undefined): string {
  const agent = userAgent?.toLowerCase() ?? '';

  if (agent.includes('android')) {
    return EVERYBIBLE_GOOGLE_PLAY_URL;
  }

  if (
    agent.includes('iphone') ||
    agent.includes('ipad') ||
    agent.includes('ipod') ||
    agent.includes('ios') ||
    (agent.includes('macintosh') && agent.includes('mobile'))
  ) {
    return EVERYBIBLE_APP_STORE_URL;
  }

  return `${EVERYBIBLE_SITE_URL}/#download`;
}
