import type { TFunction } from 'i18next';

export function formatRelativeTime(isoString: string, t: TFunction, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(isoString).getTime()) / 60_000));
  if (minutes < 1) return t('interface.justNow');
  if (minutes < 60) return t('interface.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('interface.hoursAgo', { count: hours });
  return t('interface.daysAgo', { count: Math.floor(hours / 24) });
}

export function formatListeningTime(minutes: number, t: TFunction): string {
  if (minutes < 60) return t('interface.minutesShort', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? t('interface.hoursMinutes', { hours, minutes: remainder })
    : t('interface.hoursShort', { count: hours });
}

export function buildCalendarLocale(language: string, today: string) {
  const monthNames = (width: 'long' | 'short') => {
    const formatter = new Intl.DateTimeFormat(language, { month: width, timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, month) =>
      formatter.format(new Date(Date.UTC(2024, month, 1)))
    );
  };
  const dayNames = (width: 'long' | 'short') => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: width, timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, day) =>
      formatter.format(new Date(Date.UTC(2024, 0, 7 + day)))
    );
  };
  return {
    monthNames: monthNames('long'),
    monthNamesShort: monthNames('short'),
    dayNames: dayNames('long'),
    dayNamesShort: dayNames('short'),
    today,
  };
}
