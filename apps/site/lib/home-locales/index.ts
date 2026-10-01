import { homeCopyEn, type HomeCopy } from '../home-copy';
import {
  HOME_LOCALE_NATIVE_NAMES,
  type HomeLocaleCode,
  type HomeLocaleCodeOrEn,
} from '../home-locale-meta';
import zh from './zh';
import hi from './hi';
import es from './es';
import ar from './ar';
import fr from './fr';
import bn from './bn';
import pt from './pt';
import ru from './ru';
import ur from './ur';
import id from './id';
import de from './de';
import ja from './ja';
import pa from './pa';
import mr from './mr';
import te from './te';
import tr from './tr';
import ta from './ta';
import vi from './vi';
import ko from './ko';
import ne from './ne';

export interface HomeLocale<Code extends string = HomeLocaleCodeOrEn> {
  code: Code;
  /** The language's own name, as the app's language picker shows it. */
  nativeName: string;
  copy: HomeCopy;
}

export const HOME_LOCALES: readonly HomeLocale<HomeLocaleCode>[] = [
  { code: 'zh', nativeName: HOME_LOCALE_NATIVE_NAMES.zh, copy: zh },
  { code: 'hi', nativeName: HOME_LOCALE_NATIVE_NAMES.hi, copy: hi },
  { code: 'es', nativeName: HOME_LOCALE_NATIVE_NAMES.es, copy: es },
  { code: 'ar', nativeName: HOME_LOCALE_NATIVE_NAMES.ar, copy: ar },
  { code: 'fr', nativeName: HOME_LOCALE_NATIVE_NAMES.fr, copy: fr },
  { code: 'bn', nativeName: HOME_LOCALE_NATIVE_NAMES.bn, copy: bn },
  { code: 'pt', nativeName: HOME_LOCALE_NATIVE_NAMES.pt, copy: pt },
  { code: 'ru', nativeName: HOME_LOCALE_NATIVE_NAMES.ru, copy: ru },
  { code: 'ur', nativeName: HOME_LOCALE_NATIVE_NAMES.ur, copy: ur },
  { code: 'id', nativeName: HOME_LOCALE_NATIVE_NAMES.id, copy: id },
  { code: 'de', nativeName: HOME_LOCALE_NATIVE_NAMES.de, copy: de },
  { code: 'ja', nativeName: HOME_LOCALE_NATIVE_NAMES.ja, copy: ja },
  { code: 'pa', nativeName: HOME_LOCALE_NATIVE_NAMES.pa, copy: pa },
  { code: 'mr', nativeName: HOME_LOCALE_NATIVE_NAMES.mr, copy: mr },
  { code: 'te', nativeName: HOME_LOCALE_NATIVE_NAMES.te, copy: te },
  { code: 'tr', nativeName: HOME_LOCALE_NATIVE_NAMES.tr, copy: tr },
  { code: 'ta', nativeName: HOME_LOCALE_NATIVE_NAMES.ta, copy: ta },
  { code: 'vi', nativeName: HOME_LOCALE_NATIVE_NAMES.vi, copy: vi },
  { code: 'ko', nativeName: HOME_LOCALE_NATIVE_NAMES.ko, copy: ko },
  { code: 'ne', nativeName: HOME_LOCALE_NATIVE_NAMES.ne, copy: ne },
];

export const HOME_LOCALE_EN: HomeLocale<'en'> = {
  code: 'en',
  nativeName: HOME_LOCALE_NATIVE_NAMES.en,
  copy: homeCopyEn,
};

/** English first, then the translations: every homepage, for the language switcher. */
export const ALL_HOME_LOCALES: readonly HomeLocale[] = [HOME_LOCALE_EN, ...HOME_LOCALES];

/** The homepage copy for a locale code; unknown codes get English. */
export function homeCopyFor(code: string): HomeCopy {
  return HOME_LOCALES.find((locale) => locale.code === code)?.copy ?? homeCopyEn;
}
