// Hermes (Android and iOS) implements only Intl.Collator, Intl.DateTimeFormat and
// Intl.NumberFormat. Without Intl.PluralRules, i18next quietly falls back to an
// English-style rule (1 → "one", everything else → "other"), so Russian and Arabic
// show the wrong plural form on device ("5 дня" instead of "5 дней") while every
// Node test, which has full ICU, passes.
//
// This covers CLDR cardinal rules for the interface languages the app ships
// (SUPPORTED_LANGUAGES). pluralRulesPolyfill.test.ts checks every one of them
// against Node's ICU. A small hand-written table is used instead of a polyfill
// package because the full CLDR data would be loaded on every boot for 21 rules.

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

interface PluralOperands {
  /** absolute value */
  n: number;
  /** integer digits */
  i: number;
  /** number of visible fraction digits */
  v: number;
}

interface PluralRule {
  categories: PluralCategory[];
  select: (operands: PluralOperands) => PluralCategory;
}

const toOperands = (value: number): PluralOperands => {
  const n = Math.abs(value);
  const [, fraction = ''] = String(n).split('.');
  return { n, i: Math.floor(n), v: fraction.length };
};

// CLDR "many" for es/fr/pt: whole millions (1 000 000 → "1 million de ...").
const isWholeMillion = ({ i, v }: PluralOperands) => v === 0 && i !== 0 && i % 1_000_000 === 0;

const otherOnly: PluralRule = {
  categories: ['other'],
  select: () => 'other',
};

// en, de, ur: one = i is 1 and v is 0
const oneIfIntegerOne: PluralRule = {
  categories: ['one', 'other'],
  select: ({ i, v }) => (i === 1 && v === 0 ? 'one' : 'other'),
};

// mr, ne, ta, te, tr: one = n is 1
const oneIfExactlyOne: PluralRule = {
  categories: ['one', 'other'],
  select: ({ n }) => (n === 1 ? 'one' : 'other'),
};

const RULES: Record<string, PluralRule> = {
  en: oneIfIntegerOne,
  de: oneIfIntegerOne,
  ur: oneIfIntegerOne,
  mr: oneIfExactlyOne,
  ne: oneIfExactlyOne,
  ta: oneIfExactlyOne,
  te: oneIfExactlyOne,
  tr: oneIfExactlyOne,
  zh: otherOnly,
  ja: otherOnly,
  ko: otherOnly,
  vi: otherOnly,
  id: otherOnly,
  // hi, bn: one = i is 0 or n is 1
  hi: {
    categories: ['one', 'other'],
    select: ({ i, n }) => (i === 0 || n === 1 ? 'one' : 'other'),
  },
  bn: {
    categories: ['one', 'other'],
    select: ({ i, n }) => (i === 0 || n === 1 ? 'one' : 'other'),
  },
  // pa: one = n is 0 or 1
  pa: {
    categories: ['one', 'other'],
    select: ({ n }) => (n === 0 || n === 1 ? 'one' : 'other'),
  },
  es: {
    categories: ['one', 'many', 'other'],
    select: (operands) => {
      if (operands.n === 1) return 'one';
      return isWholeMillion(operands) ? 'many' : 'other';
    },
  },
  fr: {
    categories: ['one', 'many', 'other'],
    select: (operands) => {
      if (operands.i === 0 || operands.i === 1) return 'one';
      return isWholeMillion(operands) ? 'many' : 'other';
    },
  },
  pt: {
    categories: ['one', 'many', 'other'],
    select: (operands) => {
      if (operands.i === 0 || operands.i === 1) return 'one';
      return isWholeMillion(operands) ? 'many' : 'other';
    },
  },
  ru: {
    categories: ['one', 'few', 'many', 'other'],
    select: ({ i, v }) => {
      if (v !== 0) return 'other';
      const mod10 = i % 10;
      const mod100 = i % 100;
      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
      return 'many';
    },
  },
  ar: {
    categories: ['zero', 'one', 'two', 'few', 'many', 'other'],
    select: ({ n }) => {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (!Number.isInteger(n)) return 'other';
      const mod100 = n % 100;
      if (mod100 >= 3 && mod100 <= 10) return 'few';
      if (mod100 >= 11 && mod100 <= 99) return 'many';
      return 'other';
    },
  },
};

const getBaseLanguage = (locale: string) => locale.split(/[-_]/)[0]?.toLowerCase() ?? '';

const resolveLocale = (locales?: string | readonly string[]): string => {
  const requested = typeof locales === 'string' ? [locales] : (locales ?? []);
  return requested.find((locale) => getBaseLanguage(locale) in RULES) ?? 'en';
};

export class PluralRulesPolyfill {
  private readonly locale: string;
  private readonly rule: PluralRule;

  constructor(locales?: string | readonly string[], options?: { type?: string }) {
    if (options?.type === 'ordinal') {
      throw new RangeError('Ordinal plural rules are not available in this runtime');
    }

    this.locale = resolveLocale(locales);
    this.rule = RULES[getBaseLanguage(this.locale)] ?? oneIfIntegerOne;
  }

  static supportedLocalesOf(locales?: string | readonly string[]): string[] {
    const requested = typeof locales === 'string' ? [locales] : (locales ?? []);
    return requested.filter((locale) => getBaseLanguage(locale) in RULES);
  }

  select(value: number): PluralCategory {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? this.rule.select(toOperands(numeric)) : 'other';
  }

  resolvedOptions() {
    return {
      locale: this.locale,
      type: 'cardinal' as const,
      pluralCategories: [...this.rule.categories],
    };
  }
}

/** Installs the polyfill only when the runtime has no Intl.PluralRules. Returns whether it did. */
export function installPluralRulesPolyfill(
  intl: typeof Intl | undefined = globalThis.Intl
): boolean {
  if (!intl || typeof intl.PluralRules === 'function') {
    return false;
  }

  Object.defineProperty(intl, 'PluralRules', {
    value: PluralRulesPolyfill,
    configurable: true,
    writable: true,
  });
  return true;
}
