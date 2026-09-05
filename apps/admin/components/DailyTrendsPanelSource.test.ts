import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('daily activity exposes dates, keyboard inspection and an accessible data table', async () => {
  const source = await readFile(new URL('./DailyTrendsPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /buildDailySeries/);
  assert.match(source, /aria-label="Inspect activity date"/);
  assert.match(source, /aria-valuetext/);
  assert.match(source, /View daily values/);
  assert.match(source, /Export daily CSV/);
  assert.match(source, /UTC calendar days/);
});
