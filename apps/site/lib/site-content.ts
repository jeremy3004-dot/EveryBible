import {
  EVERYBIBLE_APP_STORE_URL,
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

export interface HeroContent {
  title: string;
  description: string;
  visual: {
    src: string;
    alt: string;
  };
  storeLinks: Array<{
    label: string;
    href: string;
    eyebrow: string;
    platform: 'google-play' | 'app-store';
  }>;
  inlineLink: {
    label: string;
    href: string;
  };
}

export interface AppStoreScreenshot {
  src: string;
  alt: string;
}

export interface FeatureCard {
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  iconSrc: string;
  iconAlt: string;
}

export interface VerseOfDayContent {
  label: string;
  verse: string;
  reference: string;
  imageSrc: string;
  imageAlt: string;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
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

export interface HomepageContent {
  heroContent: HeroContent;
  featureCards: FeatureCard[];
  verseOfDay: VerseOfDayContent;
}

export const siteNavigation: SiteNavigationItem[] = [
  { label: 'Language atlas', href: '/' },
  { label: 'Mission', href: '/about' },
  { label: 'About the data', href: '/#atlas-sources' },
  { label: 'Support', href: '/support' },
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

export const heroContent: HeroContent = {
  title: 'Get a free Bible for your phone and tablet.',
  description:
    'Online or offline, EveryBible is available any time. No ads. No purchases.',
  visual: {
    src: '/everybible/hero-device-stack.png',
    alt: 'EveryBible app shown across home, Bible browsing, and search screens.',
  },
  storeLinks: [
    {
      label: 'Google Play',
      href: EVERYBIBLE_GOOGLE_PLAY_URL,
      eyebrow: 'Get it on',
      platform: 'google-play',
    },
    {
      label: 'App Store',
      href: EVERYBIBLE_APP_STORE_URL,
      eyebrow: 'Download on the',
      platform: 'app-store',
    },
  ],
  inlineLink: {
    label: 'See the mission behind EveryBible',
    href: '/about',
  },
};

export const featureCards: FeatureCard[] = [
  {
    title: 'Experience it anywhere',
    description:
      'Choose from 233 Bible translations in 174 languages on your computer, phone, or tablet.',
    href: '/about#languages',
    actionLabel: 'See the language vision',
    iconSrc: '/everybible/icons/experience-anywhere.svg',
    iconAlt: 'Experience it anywhere',
  },
  {
    title: 'Make it your Bible',
    description:
      'Highlight verses, share Scripture, and build a daily habit around God’s Word.',
    href: '#verse-of-the-day',
    actionLabel: 'See today’s featured Scripture',
    iconSrc: '/everybible/icons/make-it-yours.svg',
    iconAlt: 'Make it your Bible',
  },
  {
    title: 'Install the app now',
    description:
      'EveryBible is completely free to use, with no ads and no purchases.',
    href: EVERYBIBLE_SMART_DOWNLOAD_PATH,
    actionLabel: 'Download the free EveryBible app',
    iconSrc: '/everybible/icons/install-app.svg',
    iconAlt: 'Install the app now',
  },
];

export const verseOfDay: VerseOfDayContent = {
  label: 'Verse of the day',
  verse: 'Your word is a lamp to my feet and a light to my path.',
  reference: 'Psalm 119:105 (BSB)',
  imageSrc: '/everybible/verse-home-device.png',
  imageAlt: 'EveryBible home screen shown in a device mockup.',
  primaryAction: {
    label: 'Share',
    href: '#verse-of-the-day',
  },
  secondaryAction: {
    label: 'Get verse of the day',
    href: EVERYBIBLE_SMART_DOWNLOAD_PATH,
  },
};

export const defaultHomepageContent: HomepageContent = {
  heroContent,
  featureCards,
  verseOfDay,
};

export const footerColumns: FooterColumn[] = [
  {
    title: 'Ministry',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Mission', href: '/about#mission' },
      { label: 'Contact', href: '/support' },
    ],
  },
  {
    title: 'Useful links',
    links: [
      { label: 'Bible languages', href: '/about#languages' },
      { label: 'About the data', href: '/#atlas-sources' },
      { label: 'Privacy policy', href: EVERYBIBLE_PRIVACY_PATH },
      { label: 'Terms of service', href: EVERYBIBLE_TERMS_PATH },
      { label: 'Get the app', href: EVERYBIBLE_SMART_DOWNLOAD_PATH },
    ],
  },
];

export const footerSocialLinks: Array<{ label: string; href: string }> = [];

export const mobileTabs: MobileTabItem[] = [
  { label: 'Home', href: '#top', icon: 'home', active: true },
  { label: 'Mission', href: '#mission', icon: 'bible' },
  { label: 'Support', href: '/support', icon: 'plans' },
  { label: 'Get app', href: EVERYBIBLE_SMART_DOWNLOAD_PATH, icon: 'videos' },
];

export const supportChannels = {
  appStoreUrl: EVERYBIBLE_APP_STORE_URL,
  googlePlayUrl: EVERYBIBLE_GOOGLE_PLAY_URL,
  supportEmail: EVERYBIBLE_SUPPORT_EMAIL,
};
