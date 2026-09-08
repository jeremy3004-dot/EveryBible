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
