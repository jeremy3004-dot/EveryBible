import {
  EVERYBIBLE_APP_STORE_URL,
  EVERYBIBLE_DELETE_ACCOUNT_PATH,
  EVERYBIBLE_GOOGLE_PLAY_URL,
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SMART_DOWNLOAD_PATH,
  EVERYBIBLE_SUPPORT_EMAIL,
  EVERYBIBLE_TERMS_PATH,
} from './site-links';

export interface SiteNavigationItem {
  label: string;
  href: string;
}

export interface AppStoreScreenshot {
  src: string;
  alt: string;
}

export interface FooterColumn {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

export interface MobileTabItem {
  label: string;
  href: string;
  icon: 'home' | 'bible' | 'plans' | 'videos';
  active?: boolean;
}

export const siteNavigation: SiteNavigationItem[] = [
  { label: 'Language atlas', href: '/' },
  { label: 'The app', href: '/#app' },
  { label: 'Mission', href: '/about' },
  { label: 'About the data', href: '/#atlas-sources' },
  { label: 'Give', href: '/give' },
];

export const appStoreScreenshots: AppStoreScreenshot[] = [
  {
    src: '/everybible/app-store-screenshots/01-home.png',
    alt: 'EveryBible home screen with a daily Scripture, reading progress, and Foundations pathway.',
  },
  {
    src: '/everybible/app-store-screenshots/02-bible.png',
    alt: 'EveryBible Bible reader showing Psalm 19 with audio, search, and reading controls.',
  },
  {
    src: '/everybible/app-store-screenshots/03-gather.png',
    alt: 'EveryBible Gather screen showing Foundations discipleship pathways.',
  },
  {
    src: '/everybible/app-store-screenshots/04-plans.png',
    alt: 'EveryBible Reading Plans screen showing daily rhythms and chronological plans.',
  },
];

export const footerColumns: FooterColumn[] = [
  {
    title: 'Ministry',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Mission', href: '/about#mission' },
      { label: 'Give', href: '/give' },
    ],
  },
  {
    title: 'Useful links',
    links: [
      { label: 'Bible languages', href: '/about#languages' },
      { label: 'About the data', href: '/#atlas-sources' },
      { label: 'Privacy policy', href: EVERYBIBLE_PRIVACY_PATH },
      { label: 'Terms of service', href: EVERYBIBLE_TERMS_PATH },
      { label: 'Delete your account', href: EVERYBIBLE_DELETE_ACCOUNT_PATH },
      { label: 'Get the app', href: EVERYBIBLE_SMART_DOWNLOAD_PATH },
    ],
  },
];

export const footerSocialLinks: Array<{ label: string; href: string }> = [];

export const mobileTabs: MobileTabItem[] = [
  { label: 'Home', href: '#top', icon: 'home', active: true },
  { label: 'Mission', href: '#mission', icon: 'bible' },
  { label: 'Give', href: '/give', icon: 'plans' },
  { label: 'Get app', href: EVERYBIBLE_SMART_DOWNLOAD_PATH, icon: 'videos' },
];

export const supportChannels = {
  appStoreUrl: EVERYBIBLE_APP_STORE_URL,
  googlePlayUrl: EVERYBIBLE_GOOGLE_PLAY_URL,
  supportEmail: EVERYBIBLE_SUPPORT_EMAIL,
};
