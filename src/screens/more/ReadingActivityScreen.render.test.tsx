import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { mockModule, sourcePath } from '../../testing/mockModules';
import {
  accessibilityLabelOf,
  hostAncestors,
  installRenderHarness,
  textContent,
  within,
} from '../../testing/render';

// The grid is built from the local calendar, so the zone and the clock are pinned.
process.env.TZ = 'UTC';
const TODAY = '2026-09-24T12:00:00.000Z'; // a Thursday; 1 September 2026 is a Tuesday

const harness = installRenderHarness(mock);
const t = harness.i18n.t.bind(harness.i18n);

// Progress keys are `<book>_<chapter>` → the moment the chapter was read.
const at = (iso: string) => new Date(iso).getTime();
const CHAPTERS_READ: Record<string, number> = {
  JHN_3: at('2026-08-15T08:00:00.000Z'),
  PSA_22: at('2026-09-22T09:20:00.000Z'),
  PSA_21: at('2026-09-22T09:00:00.000Z'),
  GEN_1: at('2026-09-23T07:00:00.000Z'), // the most recent read day of September
};

const useProgressStore = create(() => ({
  chaptersRead: CHAPTERS_READ,
  streakDays: 2,
  lastReadDate: '2026-09-23',
}));
mockModule(mock, sourcePath('stores/progressStore.ts'), {
  useProgressStore,
  selectCurrentStreakDays: (state: { streakDays: number }) => state.streakDays,
});

// Signed out by default, so the cloud engagement summary is never fetched.
const analytics = {
  calls: [] as string[],
  summary: { success: false } as { success: boolean; data?: Record<string, unknown> },
};
mockModule(mock, sourcePath('services/analytics/analyticsService.ts'), {
  refreshEngagement: async () => {
    analytics.calls.push('refreshEngagement');
    return { success: true };
  },
  getEngagementSummary: async () => {
    analytics.calls.push('getEngagementSummary');
    return analytics.summary;
  },
});

// The day card jumps tabs through the root navigator, not the screen's own stack.
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => harness.navigation.navigation.navigate(...args),
  },
});

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: new Date(TODAY) });
});

afterEach(() => {
  mock.timers.reset();
  useProgressStore.setState(useProgressStore.getInitialState(), true);
  harness.authStore.setState({ isAuthenticated: false });
  analytics.calls.length = 0;
  analytics.summary = { success: false };
});

async function renderScreen() {
  const { ReadingActivityScreen } = await import('./ReadingActivityScreen');
  return harness.render(<ReadingActivityScreen />);
}

type View = Awaited<ReturnType<typeof renderScreen>>;

const dayCells = (view: View) =>
  within(view.getByTestId('reading-activity-calendar')).getAllByRole('button');

const cellNamed = (view: View, name: string): ReactTestInstance =>
  within(view.getByTestId('reading-activity-calendar')).getByRole('button', { name });

const isSelected = (node: ReactTestInstance) => node.props.accessibilityState?.selected === true;

test('the calendar grid runs Monday-first under single-letter weekday headers', async () => {
  const view = await renderScreen();

  assert.ok(view.getByText('September 2026'));
  assert.deepEqual(
    view.getAllByText(/^[A-Z]$/).map((node) => textContent(node)),
    ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  );

  // 1 September is a Tuesday, so Monday 31 August leads the first row and the
  // grid stops on the 30th.
  const cells = dayCells(view);
  assert.equal(cells.length, 31);
  assert.equal(accessibilityLabelOf(cells[0]), 'Monday, August 31');
  assert.equal(accessibilityLabelOf(cells[1]), 'Tuesday, September 1');
  assert.equal(accessibilityLabelOf(cells[30]), 'Wednesday, September 30');
  assert.equal(textContent(cells[1]), '1');
});

test('each day is a button named by its full date, and only the chosen day is announced as selected', async () => {
  const view = await renderScreen();

  // With nothing chosen yet the month's most recent read day is selected.
  const selected = dayCells(view).filter(isSelected);
  assert.deepEqual(selected.map(accessibilityLabelOf), ['Wednesday, September 23']);

  for (const name of ['Tuesday, September 22', 'Thursday, September 24', 'Friday, September 25']) {
    assert.ok(
      view.getByRole('button', { name, selected: false }),
      `${name} is announced as not selected`
    );
  }
});

// Read, today and idle differ only in fill, so the state has to be spoken too
// (WCAG 1.4.1: colour is not the only carrier of meaning).
test('read days, today and idle days are announced differently', async () => {
  const view = await renderScreen();
  const announcement = (name: string) => {
    const cell = cellNamed(view, name);
    return JSON.stringify({
      extraLabel: accessibilityLabelOf(cell)?.replace(name, ''),
      value: cell.props.accessibilityValue,
      hint: cell.props.accessibilityHint,
    });
  };

  const read = announcement('Tuesday, September 22');
  const today = announcement('Thursday, September 24');
  const idle = announcement('Friday, September 25');
  assert.notEqual(read, idle, 'a read day sounds different from an idle day');
  assert.notEqual(today, idle, 'today sounds different from an idle day');
  assert.notEqual(read, today, 'a read day sounds different from today');
});

test('left open overnight, the calendar moves today when the app comes back', async () => {
  const view = await renderScreen();
  const todayLabel = t('readingActivity.legendToday');
  const value = (name: string) => cellNamed(view, name).props.accessibilityValue?.text ?? '';
  assert.equal(value('Thursday, September 24'), todayLabel);

  // Suspended overnight on this screen; nothing refocuses it.
  harness.rn.AppState.emit('background');
  mock.timers.setTime(new Date('2026-09-25T07:00:00.000Z').getTime());
  harness.rn.AppState.emit('active');
  await view.flush();

  assert.equal(value('Thursday, September 24'), '');
  assert.equal(value('Friday, September 25'), todayLabel);
});

test('choosing a day does not rebuild a date formatter for every calendar cell', async (context) => {
  const view = await renderScreen();
  // Each toLocaleDateString builds its own formatter, a JNI round trip on Hermes for
  // Android; the grid has up to 37 cells and re-renders on every press.
  const perCall = context.mock.method(Date.prototype, 'toLocaleDateString');
  const RealDateTimeFormat = Intl.DateTimeFormat;
  let constructed = 0;
  context.mock.property(
    Intl,
    'DateTimeFormat',
    new Proxy(RealDateTimeFormat, {
      construct(target, args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        constructed += 1;
        return new target(...args);
      },
    })
  );

  await view.press(cellNamed(view, 'Tuesday, September 22'));

  const formatted = perCall.mock.callCount() + constructed;
  assert.ok(formatted <= 2, `formatted dates ${formatted} times for one press`);
  assert.ok(cellNamed(view, 'Monday, August 31'), 'the cells keep their full-date names');
});

test('pressing a read day selects it and summarises that day in canonical order', async () => {
  const view = await renderScreen();

  await view.press(cellNamed(view, 'Tuesday, September 22'));

  assert.equal(isSelected(cellNamed(view, 'Tuesday, September 22')), true);
  assert.equal(isSelected(cellNamed(view, 'Wednesday, September 23')), false);
  assert.ok(view.getByText(t('readingActivity.dayChapters', { count: 2, books: 'Psalms 21–22' })));
  assert.equal(view.queryByText(t('readingActivity.noReading')), null);

  // An idle day has nothing to summarise.
  await view.press(cellNamed(view, 'Friday, September 25'));
  assert.ok(view.getByText(t('readingActivity.noReading')));
  assert.equal(view.queryByText(/Psalms/), null);
});

test('pressing the selected-day card opens the reader at the day’s first chapter', async () => {
  const view = await renderScreen();

  await view.press(cellNamed(view, 'Tuesday, September 22'));
  harness.navigation.calls.length = 0;
  await view.press(
    view.getByText(t('readingActivity.dayChapters', { count: 2, books: 'Psalms 21–22' }))
  );

  assert.deepEqual(harness.navigation.calls, [
    {
      method: 'navigate',
      args: ['Bible', { screen: 'BibleReader', params: { bookId: 'PSA', chapter: 21 } }],
    },
  ]);
});

// The card's label replaces its children for VoiceOver/TalkBack, so it has to
// carry the summary, not just the date.
test('the selected-day card tells a screen reader what was read, not only the date', async () => {
  const view = await renderScreen();
  await view.press(cellNamed(view, 'Tuesday, September 22'));

  assert.ok(view.getByRole('button', { name: /Psalms 21–22/ }));
});

test('month buttons are named and step the grid, legend and selection a month at a time', async () => {
  const view = await renderScreen();

  // September so far: read on the 22nd and 23rd of 24 elapsed days.
  assert.ok(view.getByText(t('readingActivity.legendProgress', { read: 2, count: 24 })));
  assert.ok(view.getByText(t('readingActivity.legendRead')));

  await view.press(view.getByRole('button', { name: t('readingActivity.previousMonth') }));
  assert.ok(view.getByText('August 2026'));
  assert.equal(view.queryByText('September 2026'), null);
  assert.equal(accessibilityLabelOf(dayCells(view)[0]), 'Monday, July 27');
  assert.ok(view.getByText(t('readingActivity.legendProgress', { read: 1, count: 31 })));
  // August's only read day becomes the selected day.
  assert.ok(view.getByRole('button', { name: 'Saturday, August 15', selected: true }));
  assert.ok(view.getByText(t('readingActivity.dayChapters', { count: 1, books: 'John 3' })));

  const next = view.getByRole('button', { name: t('readingActivity.nextMonth') });
  await view.press(next);
  await view.press(next);
  assert.ok(view.getByText('October 2026'));
  assert.ok(view.getByText(t('readingActivity.legendProgress', { read: 0, count: 0 })));
  assert.ok(view.getByText(t('readingActivity.noReading')));
});

test('every visible string and accessibility label comes from a translation', async () => {
  const view = await renderScreen();
  await view.press(cellNamed(view, 'Tuesday, September 22'));

  const texts = view.queryAllByType('Text').map((node) => textContent(node));
  const labels = [...view.queryAllByType('Pressable'), ...view.queryAllByType('View')]
    .map((node) => node.props.accessibilityLabel as string | undefined)
    .filter((label): label is string => Boolean(label));
  const rawKey = /^[a-z]+[A-Za-z]*(\.[A-Za-z_]+)+$/;

  for (const text of [...texts, ...labels]) {
    assert.doesNotMatch(text, rawKey, `"${text}" is an untranslated key`);
    assert.doesNotMatch(text, /\{\{|\}\}/, `"${text}" has an unresolved token`);
  }
  for (const key of [
    'readingActivity.currentStreak',
    'readingActivity.chapters',
    'readingActivity.listening',
    'readingActivity.legendToday',
    'more.sync.source',
  ]) {
    assert.ok(texts.includes(t(key)), `${key} is shown`);
  }
  assert.ok(view.getByRole('button', { name: t('common.back') }));
});

test('with nothing read yet, the day card says so and hints how to start', async () => {
  useProgressStore.setState({ chaptersRead: {}, streakDays: 0 });
  const view = await renderScreen();

  assert.equal(dayCells(view).filter(isSelected).length, 0, 'no day is selected');
  assert.ok(view.getByText(t('readingActivity.noReading')));
  assert.ok(view.getByText(t('readingActivity.noReadingHint')));
  // The legend and the card's eyebrow both read "Today".
  assert.equal(view.getAllByText(t('readingActivity.legendToday')).length, 2);
  assert.ok(view.getByText(t('readingActivity.legendProgress', { read: 0, count: 24 })));
  assert.equal(
    view.queryByRole('button', { name: /No reading on this day/ }),
    null,
    'the card has nowhere to go'
  );
});

test('a day read across a stretch of time shows its reading window, spoken with the summary', async () => {
  const view = await renderScreen();
  await view.press(cellNamed(view, 'Tuesday, September 22'));

  const window = t('readingActivity.sessionWindow', {
    start: '9:00 AM',
    end: '9:20 AM',
    duration: t('interface.minutesShort', { count: 20 }),
  });
  assert.ok(view.getByText(window));
  assert.ok(view.getByRole('button', { name: new RegExp(window) }));

  // A single chapter has no window.
  await view.press(cellNamed(view, 'Wednesday, September 23'));
  assert.equal(view.queryByText(/ – /), null);
});

test('signed in, the cloud totals replace the local chapter count and fill in listening time', async () => {
  harness.authStore.setState({ isAuthenticated: true });
  analytics.summary = {
    success: true,
    data: { total_chapters_read: 412, total_listening_minutes: 95 },
  };
  const view = await renderScreen();
  await view.flush();

  assert.deepEqual(analytics.calls, ['refreshEngagement', 'getEngagementSummary']);
  assert.ok(view.getByText('412'));
  assert.ok(view.getByText(t('interface.hoursMinutes', { hours: 1, minutes: 35 })));
});

test('signed out, the totals come from this device and the cloud is not asked', async () => {
  const view = await renderScreen();
  await view.flush();

  assert.deepEqual(analytics.calls, []);
  const totals = within(hostAncestors(view.getByText(t('readingActivity.chapters')))[0]);
  assert.ok(totals.getByText(String(Object.keys(CHAPTERS_READ).length)));
  assert.ok(totals.getByText(t('interface.minutesShort', { count: 0 })));
  const streak = within(hostAncestors(view.getByText(t('readingActivity.currentStreak')))[0]);
  assert.ok(streak.getByText('2'));
  assert.ok(streak.getByText(t('readingActivity.streakUnit', { count: 2 })));
});
