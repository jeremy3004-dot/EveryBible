/**
 * "7 Sep" in the in-app language. A ledger labels up to 31 rhythm rows and Find plans two
 * dates per season card, and `toLocaleDateString(locale, options)` builds a formatter on every
 * call, an ICU round trip each on Hermes. One formatter per language is built on first use
 * (never at module evaluation) and reused; the output is what toLocaleDateString returns.
 */
let monthDayFormatter: { locale: string | undefined; format: Intl.DateTimeFormat } | null = null;

export function formatPlanMonthDay(date: Date, locale?: string): string {
  const resolvedLocale = locale || undefined;
  if (!monthDayFormatter || monthDayFormatter.locale !== resolvedLocale) {
    monthDayFormatter = {
      locale: resolvedLocale,
      format: new Intl.DateTimeFormat(resolvedLocale, { month: 'short', day: 'numeric' }),
    };
  }
  return monthDayFormatter.format.format(date);
}
