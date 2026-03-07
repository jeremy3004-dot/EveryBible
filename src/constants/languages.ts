export type LanguageCode =
  | 'en'
  | 'zh'
  | 'hi'
  | 'es'
  | 'ar'
  | 'fr'
  | 'bn'
  | 'pt'
  | 'ru'
  | 'ur'
  | 'id'
  | 'de'
  | 'ja'
  | 'pa'
  | 'mr'
  | 'te'
  | 'tr'
  | 'ta'
  | 'vi'
  | 'ko'
  | 'ne';

export interface Language {
  code: LanguageCode;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  appLanguageLabel: string;
  aliases: string[];
}

export const LANGUAGES: Record<LanguageCode, Language> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    appLanguageLabel: 'App language',
    aliases: ['English', 'Interface', 'App'],
  },
  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '简体中文',
    direction: 'ltr',
    appLanguageLabel: '应用语言',
    aliases: ['Chinese', 'Mandarin', 'Simplified Chinese', '中文', '普通话'],
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    direction: 'ltr',
    appLanguageLabel: 'ऐप भाषा',
    aliases: ['Hindi', 'हिंदी', 'हिन्दी'],
  },
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    appLanguageLabel: 'Idioma de la app',
    aliases: ['Spanish', 'Español', 'Castellano'],
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    direction: 'rtl',
    appLanguageLabel: 'لغة التطبيق',
    aliases: ['Arabic', 'العربية'],
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    appLanguageLabel: 'Langue de l’app',
    aliases: ['French', 'Français'],
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    direction: 'ltr',
    appLanguageLabel: 'অ্যাপের ভাষা',
    aliases: ['Bengali', 'Bangla', 'বাংলা'],
  },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    direction: 'ltr',
    appLanguageLabel: 'Idioma do app',
    aliases: ['Portuguese', 'Português'],
  },
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    direction: 'ltr',
    appLanguageLabel: 'Язык приложения',
    aliases: ['Russian', 'Русский'],
  },
  ur: {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    direction: 'rtl',
    appLanguageLabel: 'ایپ کی زبان',
    aliases: ['Urdu', 'اردو'],
  },
  id: {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    direction: 'ltr',
    appLanguageLabel: 'Bahasa aplikasi',
    aliases: ['Indonesian', 'Bahasa Indonesia'],
  },
  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    appLanguageLabel: 'App-Sprache',
    aliases: ['German', 'Deutsch'],
  },
  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    direction: 'ltr',
    appLanguageLabel: 'アプリの言語',
    aliases: ['Japanese', '日本語'],
  },
  pa: {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    direction: 'ltr',
    appLanguageLabel: 'ਐਪ ਦੀ ਭਾਸ਼ਾ',
    aliases: ['Punjabi', 'Panjabi', 'ਪੰਜਾਬੀ'],
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    direction: 'ltr',
    appLanguageLabel: 'अॅप भाषा',
    aliases: ['Marathi', 'मराठी'],
  },
  te: {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    direction: 'ltr',
    appLanguageLabel: 'యాప్ భాష',
    aliases: ['Telugu', 'తెలుగు'],
  },
  tr: {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    direction: 'ltr',
    appLanguageLabel: 'Uygulama dili',
    aliases: ['Turkish', 'Türkçe'],
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    direction: 'ltr',
    appLanguageLabel: 'ஆப் மொழி',
    aliases: ['Tamil', 'தமிழ்'],
  },
  vi: {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    direction: 'ltr',
    appLanguageLabel: 'Ngôn ngữ ứng dụng',
    aliases: ['Vietnamese', 'Tiếng Việt'],
  },
  ko: {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    direction: 'ltr',
    appLanguageLabel: '앱 언어',
    aliases: ['Korean', '한국어'],
  },
  ne: {
    code: 'ne',
    name: 'Nepali',
    nativeName: 'नेपाली',
    direction: 'ltr',
    appLanguageLabel: 'एप भाषा',
    aliases: ['Nepali', 'नेपाली'],
  },
} as const;

export const SUPPORTED_LANGUAGES: Language[] = [
  LANGUAGES.en,
  LANGUAGES.zh,
  LANGUAGES.hi,
  LANGUAGES.es,
  LANGUAGES.ar,
  LANGUAGES.fr,
  LANGUAGES.bn,
  LANGUAGES.pt,
  LANGUAGES.ru,
  LANGUAGES.ur,
  LANGUAGES.id,
  LANGUAGES.de,
  LANGUAGES.ja,
  LANGUAGES.pa,
  LANGUAGES.mr,
  LANGUAGES.te,
  LANGUAGES.tr,
  LANGUAGES.ta,
  LANGUAGES.vi,
  LANGUAGES.ko,
  LANGUAGES.ne,
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';
