/**
 * Every user-facing string on the homepage, in one place, so localized
 * homepages (`/[locale]`) can swap the whole set. Templates use `{{name}}`
 * placeholders filled by `fillCopy`; translations must keep them exactly.
 *
 * Other pages (Bible, plans, legal) stay English: their content is the
 * English BSB text and English plan data.
 */
export interface HomeCopy {
  /** BCP 47 code used for `lang`, hreflang and number formatting. */
  locale: string;
  dir: 'ltr' | 'rtl';
  meta: {
    title: string;
    description: string;
  };
  nav: {
    atlas: string;
    bible: string;
    plans: string;
    app: string;
    mission: string;
    give: string;
    getApp: string;
    menu: string;
    closeMenu: string;
    skipToContent: string;
  };
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    lede: string;
    primaryCta: string;
    exploreCta: string;
  };
  explore: {
    /** The hero globe's + and − buttons. */
    zoomLabel: string;
    zoomIn: string;
    zoomOut: string;
    close: string;
    searchPlaceholder: string;
    searchLabel: string;
  };
  app: {
    eyebrow: string;
    title: string;
    lede: string;
    promises: string[];
    shots: Array<{ alt: string }>;
    /** Screenshot rail controls. */
    rail: { label: string; previous: string; next: string };
    download: {
      title: string;
      desktopHint: string;
      iosHint: string;
      androidHint: string;
      appStoreAlt: string;
      googlePlayAlt: string;
      qrAlt: string;
    };
  };
  mission: {
    eyebrow: string;
    quote: string;
    paragraphs: string[];
    giveCta: string;
    aboutCta: string;
  };
  plans: {
    eyebrow: string;
    /** Used when a church-year season (Advent, Christmas) is near. */
    seasonTitle: string;
    /** Used the rest of the year. */
    title: string;
    lede: string;
    days: string;
    allPlans: string;
  };
  footer: {
    languageLabel: string;
  };
}

export const homeCopyEn: HomeCopy = {
  locale: 'en',
  dir: 'ltr',
  meta: {
    title: 'God’s Word. In your heart language. | EveryBible',
    description:
      'Read and listen to the Bible in your own language. Free, offline, no ads. Explore Scripture availability across the world’s languages.',
  },
  nav: {
    atlas: 'Language atlas',
    bible: 'Bible',
    plans: 'Plans',
    app: 'The app',
    mission: 'Mission',
    give: 'Give',
    getApp: 'Get the app',
    menu: 'Menu',
    closeMenu: 'Close menu',
    skipToContent: 'Skip to content',
  },
  hero: {
    eyebrow: 'An Every Language project',
    titleLine1: 'God’s Word.',
    titleLine2: 'In your heart language.',
    lede: 'Read and listen to the Bible in your own language. Free, offline, and without ads.',
    primaryCta: 'Get the free app',
    exploreCta: 'Explore the atlas',
  },
  explore: {
    zoomLabel: 'Map zoom',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    close: 'Close the atlas',
    searchPlaceholder: 'Find a language or dialect…',
    searchLabel: 'Search languages and dialects',
  },
  app: {
    eyebrow: 'The app',
    title: 'Scripture that goes where you go.',
    lede: 'Read or listen in your language. Download it once and use it without a signal.',
    promises: ['Free, forever', 'No ads, no purchases', 'Works offline'],
    shots: [
      { alt: 'Home screen opening on the verse of the day, with reading progress below.' },
      { alt: 'The app in its light and dark themes side by side.' },
      { alt: 'Reading plans for every season, from daily rhythms to the whole Bible.' },
      { alt: 'Psalm 23 with verses highlighted in the reader.' },
      { alt: 'Gather: discipleship lessons to study with friends.' },
      { alt: 'Choosing a Bible translation by language.' },
      { alt: 'Listening to Psalm 23 with the verse being read marked.' },
    ],
    rail: { label: 'App screenshots', previous: 'Previous screenshot', next: 'Next screenshot' },
    download: {
      title: 'Get EveryBible',
      desktopHint: 'Scan with your phone, or choose your store.',
      iosHint: 'Free on the App Store.',
      androidHint: 'Free on Google Play.',
      appStoreAlt: 'Download on the App Store',
      googlePlayAlt: 'Get it on Google Play',
      qrAlt: 'Scan to download EveryBible',
    },
  },
  mission: {
    eyebrow: 'Why Every Language exists',
    quote: 'The Word of God is living and active, even in the hands of a child.',
    paragraphs: [
      'Six years ago we finished placing the Bible in thirty thousand homes across a remote mountain region of the Himalayas. One village was left. They had driven our teams out and promised beatings and stones if we returned. At a school in the district headquarters we handed out Bibles, and a girl carried hers home. She was from that village, and her father was the chief priest. She read the Sermon on the Mount, about a Father in Heaven who cares for the birds of the air and the lilies of the field, and she gave her life to Him. Then she led her brother, her mother and her father to the Lord. The village drove the family out, and in the days that followed she led sixteen more people to Jesus and wrote dozens of worship songs.',
      'The Word of God is living and active, even in the hands of a child. Faith comes by hearing, and the Spirit uses that Word to bring individuals to Christ, and through them households, villages and nations. That is why Every Language exists: so that every people on earth can hear the Scriptures in their own language, and so that people from every tribe and tongue will stand before the throne, redeemed by the blood of the Lamb.',
    ],
    giveCta: 'Give to the work',
    aboutCta: 'Our mission',
  },
  plans: {
    eyebrow: 'Reading plans',
    seasonTitle: 'Plans for this season',
    title: 'Start a reading plan',
    lede: 'Free plans in the app, from a week to the whole Bible.',
    days: '{{count}} days',
    allPlans: 'See all plans',
  },
  footer: {
    languageLabel: 'Language',
  },
};

/** Fills `{{name}}` placeholders. Unknown names are left as-is so a missing value is visible. */
export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}
