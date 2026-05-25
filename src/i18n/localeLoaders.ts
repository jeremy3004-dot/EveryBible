import type { LanguageCode } from '../constants/languages';

export type LocaleResource = Record<string, unknown>;

export const localeLoaders = {
  ar: () => import('./locales/ar').then((module) => module.ar),
  bn: () => import('./locales/bn').then((module) => module.bn),
  de: () => import('./locales/de').then((module) => module.de),
  es: () => import('./locales/es').then((module) => module.es),
  fr: () => import('./locales/fr').then((module) => module.fr),
  hi: () => import('./locales/hi').then((module) => module.hi),
  id: () => import('./locales/id').then((module) => module.id),
  ja: () => import('./locales/ja').then((module) => module.ja),
  ko: () => import('./locales/ko').then((module) => module.ko),
  mr: () => import('./locales/mr').then((module) => module.mr),
  ne: () => import('./locales/ne').then((module) => module.ne),
  pa: () => import('./locales/pa').then((module) => module.pa),
  pt: () => import('./locales/pt').then((module) => module.pt),
  ru: () => import('./locales/ru').then((module) => module.ru),
  ta: () => import('./locales/ta').then((module) => module.ta),
  te: () => import('./locales/te').then((module) => module.te),
  tr: () => import('./locales/tr').then((module) => module.tr),
  ur: () => import('./locales/ur').then((module) => module.ur),
  vi: () => import('./locales/vi').then((module) => module.vi),
  zh: () => import('./locales/zh').then((module) => module.zh),
} satisfies Record<Exclude<LanguageCode, 'en'>, () => Promise<LocaleResource>>;
