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
  { label: 'Bible', href: '/bible' },
  { label: 'Plans', href: '/plans' },
  { label: 'The app', href: '/#app' },
  { label: 'Mission', href: '/about' },
  { label: 'Give', href: '/give' },
];

export const footerColumns: FooterColumn[] = [
  {
    // Crawlable links into the reading pages; also the chapters people look up most.
    title: 'Scripture',
    links: [
      { label: 'Read the Bible', href: '/bible' },
      { label: 'Reading plans', href: '/plans' },
      { label: 'Psalm 23', href: '/bible/psalms/23' },
      { label: 'John 3', href: '/bible/john/3' },
      { label: 'Romans 8', href: '/bible/romans/8' },
      { label: '1 Corinthians 13', href: '/bible/1-corinthians/13' },
    ],
  },
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
