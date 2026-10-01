import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';

// The in-app language, which plan day labels follow instead of the device locale.
// The module reads it with a lazy require, so it is handed over ES-module shaped.
const i18n: { language?: string } = { language: 'fr' };
mockModule(mock, sourcePath('i18n/index.ts'), {
  default: { __esModule: true, default: i18n },
});

const label = (locale: string | undefined, date: Date) =>
  new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);

test('plan day labels follow the in-app language, and the device locale until one is set', async () => {
  const { formatScheduledPlanDayLabel } = await import('./readingPlanActivity');
  const startedAt = new Date(2026, 11, 16, 12).toISOString();
  const thirdDay = new Date(2026, 11, 18);

  i18n.language = 'fr';
  assert.equal(formatScheduledPlanDayLabel(startedAt, 3), label('fr', thirdDay));

  i18n.language = 'de';
  assert.equal(formatScheduledPlanDayLabel(startedAt, 3), label('de', thirdDay));

  i18n.language = '';
  assert.equal(formatScheduledPlanDayLabel(startedAt, 3), label(undefined, thirdDay));
});
