import {
  EVERYBIBLE_PRIVACY_PATH,
  EVERYBIBLE_SUPPORT_EMAIL,
  EVERYBIBLE_TERMS_PATH,
} from './site-links';

export interface SiteNavigationItem {
  label: string;
  href: string;
}

const APP_STORE_URL = 'https://apps.apple.com/app/id6758254335';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.everybible.app';
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
  { label: 'Mission', href: '#mission' },
  { label: 'Verse of the Day', href: '#verse-of-the-day' },
  { label: 'Support', href: '/support' },
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
      href: GOOGLE_PLAY_URL,
      eyebrow: 'Get it on',
      platform: 'google-play',
    },
    {
      label: 'App Store',
      href: APP_STORE_URL,
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
      'Choose from more than 2,400 Bible versions in over 1,600 languages on your computer, phone, or tablet.',
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
    title: 'Install the App Now',
    description:
      'EveryBible is completely free to use, with no ads and no purchases.',
    href: GOOGLE_PLAY_URL,
    actionLabel: 'Download the Free EveryBible App',
    iconSrc: '/everybible/icons/install-app.svg',
    iconAlt: 'Install the App Now',
  },
];

export const verseOfDay: VerseOfDayContent = {
  label: 'Verse of the Day',
  verse: 'Your word is a lamp to my feet and a light to my path.',
  reference: 'Psalm 119:105 (BSB)',
  imageSrc: '/everybible/verse-home-device.png',
  imageAlt: 'EveryBible home screen shown in a device mockup.',
  primaryAction: {
    label: 'Share',
    href: '#verse-of-the-day',
  },
  secondaryAction: {
    label: 'Get Verse of the Day',
    href: GOOGLE_PLAY_URL,
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
      { label: 'Admin', href: 'https://admin.everybible.app' },
      { label: 'Contact', href: '/support' },
    ],
  },
  {
    title: 'Useful Links',
    links: [
      { label: 'Bible Languages', href: '/about#languages' },
      { label: 'Verse of the Day', href: '#verse-of-the-day' },
      { label: 'Privacy Policy', href: EVERYBIBLE_PRIVACY_PATH },
      { label: 'Terms of Service', href: EVERYBIBLE_TERMS_PATH },
      { label: 'Get the app', href: '/support' },
    ],
  },
];

export const footerSocialLinks: Array<{ label: string; href: string }> = [];

export const mobileTabs: MobileTabItem[] = [
  { label: 'Home', href: '#top', icon: 'home', active: true },
  { label: 'Mission', href: '#mission', icon: 'bible' },
  { label: 'Support', href: '/support', icon: 'plans' },
  { label: 'Get App', href: GOOGLE_PLAY_URL, icon: 'videos' },
];

export const supportChannels = {
  appStoreUrl: APP_STORE_URL,
  googlePlayUrl: GOOGLE_PLAY_URL,
  supportEmail: EVERYBIBLE_SUPPORT_EMAIL,
};
