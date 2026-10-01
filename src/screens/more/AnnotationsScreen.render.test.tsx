import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { mockBarrel, mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import type { UserAnnotation } from '../../services/supabase/types';
import { assertDefined } from '../../utils/assertDefined';

const harness = installRenderHarness(mock);
mockMmkvStorage(mock);
const t = (key: string) => harness.i18n.t(key);

// The screen lists the on-device annotations the annotation service returns.
const service = {
  calls: 0,
  fetch: null as
    | (() => Promise<{ success: boolean; data?: UserAnnotation[]; error?: string }>)
    | null,
  result: { success: true, data: [] as UserAnnotation[] } as {
    success: boolean;
    data?: UserAnnotation[];
    error?: string;
  },
};
mockBarrel(mock, 'services/annotations/index.ts', {
  real: ['subscribeToAnnotationChanges'],
  provide: {
    fetchAnnotations: async () => {
      service.calls += 1;
      if (service.fetch) return service.fetch();
      return service.result;
    },
  },
});
mockBarrel(mock, 'constants/index.ts', { real: ['getTranslatedBookName'] });

const rootNavigation = {
  ready: true,
  calls: [] as unknown[][],
};
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => rootNavigation.ready,
    navigate: (...args: unknown[]) => {
      rootNavigation.calls.push(args);
    },
  },
});

function annotation(overrides: Partial<UserAnnotation>): UserAnnotation {
  return {
    id: 'a1',
    user_id: 'local',
    book: 'JHN',
    chapter: 3,
    verse_start: 16,
    verse_end: null,
    type: 'note',
    color: null,
    content: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    synced_at: '2026-09-01T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

let useAnnotationStore: typeof import('../../stores/annotationStore').useAnnotationStore;
before(async () => {
  ({ useAnnotationStore } = await import('../../stores/annotationStore'));
});

beforeEach(() => {
  service.calls = 0;
  service.fetch = null;
  service.result = { success: true, data: [] };
  rootNavigation.ready = true;
  rootNavigation.calls = [];
  harness.authStore.setState({ user: null, authGeneration: 0 });
  useAnnotationStore.setState({ annotations: [] });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

for (const transition of ['account', 'generation'] as const) {
  test(`a ${transition} change hides annotations before the new list finishes loading`, async () => {
    harness.authStore.setState({ user: { uid: 'reader-a' } });
    service.result = { success: true, data: [annotation({ content: 'Previous private note' })] };
    const view = await renderScreen();
    const next = deferred<typeof service.result>();
    service.fetch = () => next.promise;
    await act(async () =>
      harness.authStore.setState({
        user: { uid: transition === 'account' ? 'reader-b' : 'reader-a' },
        authGeneration: 1,
      })
    );
    assert.equal(view.queryByText('Previous private note'), null);
    next.resolve({ success: true, data: [annotation({ content: 'Current note' })] });
    await view.flush();
    assert.ok(view.getByText('Current note'));
  });
}

test('the actual annotation change subscription reloads after the account bucket changes', async () => {
  harness.authStore.setState({ user: { uid: 'reader-a' } });
  service.result = { success: true, data: [annotation({ content: 'A note' })] };
  const view = await renderScreen();
  const beforeBucketSwap = deferred<typeof service.result>();
  service.fetch = () => beforeBucketSwap.promise;
  await act(async () =>
    harness.authStore.setState({ user: { uid: 'reader-b' }, authGeneration: 1 })
  );
  // Auth notifies its subscribers before replacing the annotation owner bucket.
  service.fetch = null;
  service.result = { success: true, data: [annotation({ content: 'B note' })] };
  await act(async () => {
    useAnnotationStore.setState({ annotations: service.result.data ?? [] });
  });
  await view.flush();
  beforeBucketSwap.resolve({ success: true, data: [annotation({ content: 'A note' })] });
  await view.flush();
  assert.ok(view.getByText('B note'));
  assert.equal(view.queryByText('A note'), null);
});

test('signing out replaces account notes with the guest annotations', async () => {
  harness.authStore.setState({ user: { uid: 'reader-a' } });
  service.result = { success: true, data: [annotation({ content: 'Account note' })] };
  const view = await renderScreen();
  service.result = { success: true, data: [annotation({ content: 'Guest note' })] };
  await act(async () => harness.authStore.setState({ user: null, authGeneration: 1 }));
  await view.flush();
  assert.equal(view.queryByText('Account note'), null);
  assert.ok(view.getByText('Guest note'));
});

test('only the latest annotation refresh may replace the list and clear its busy state', async () => {
  service.result = { success: true, data: [annotation({ content: 'Initial note' })] };
  const view = await renderScreen();
  const older = deferred<typeof service.result>();
  const newer = deferred<typeof service.result>();
  const refresh = () => {
    const [list] = view.queryAllByType('FlatList');
    return (
      assertDefined(list, 'list').props.refreshControl as {
        props: { onRefresh: () => Promise<void> };
      }
    ).props.onRefresh();
  };
  service.fetch = () => older.promise;
  await act(async () => {
    void refresh();
  });
  service.fetch = () => newer.promise;
  await act(async () => {
    void refresh();
  });
  older.resolve({ success: true, data: [annotation({ content: 'Old refresh' })] });
  await view.flush();
  const [list] = view.queryAllByType('FlatList');
  assert.equal(
    (assertDefined(list, 'list').props.refreshControl as { props: { refreshing: boolean } }).props
      .refreshing,
    true
  );
  newer.resolve({ success: true, data: [annotation({ content: 'New refresh' })] });
  await view.flush();
  assert.ok(view.getByText('New refresh'));
  assert.equal(view.queryByText('Old refresh'), null);
});

test('unmounting removes the annotation change subscription and ignores pending results', async () => {
  const pending = deferred<typeof service.result>();
  service.fetch = () => pending.promise;
  const view = await renderScreen();
  await view.unmount();
  pending.resolve({ success: true, data: [annotation({ content: 'Unmounted note' })] });
  useAnnotationStore.setState({ annotations: [annotation({ content: 'Later store edit' })] });
  await view.flush();
  assert.equal(service.calls, 1, 'the store no longer reloads an unmounted screen');
});

async function renderScreen() {
  const { AnnotationsScreen } = await import('./AnnotationsScreen');
  const view = await harness.render(<AnnotationsScreen />);
  await view.flush();
  return view;
}

test('a visible annotations list clears the prior account notes on sign-out', async () => {
  harness.authStore.setState({ user: { uid: 'reader-a' } });
  service.result = { success: true, data: [annotation({ content: 'Private note from A' })] };
  const view = await renderScreen();
  assert.ok(view.getByText('Private note from A'));
  service.result = { success: true, data: [] };
  await act(async () => {
    harness.authStore.setState({ user: null });
  });
  await view.flush();
  assert.equal(view.queryByText('Private note from A'), null);
});

test('opens on the Notes filter and lists only notes, with their text', async () => {
  service.result = {
    success: true,
    data: [
      annotation({ id: 'n1', content: 'God so loved' }),
      annotation({ id: 'h1', type: 'highlight', book: 'GEN', chapter: 1, verse_start: 1 }),
    ],
  };

  const view = await renderScreen();

  assert.ok(view.getByRole('button', { name: t('annotations.notes'), selected: true }));
  assert.ok(view.getByRole('button', { name: t('annotations.highlights'), selected: false }));
  assert.ok(view.getByText('God so loved'));
  assert.ok(view.getByText('John 3:16'));
  assert.equal(view.queryByText('Genesis 1:1'), null);
});

// Nothing in the app creates bookmarks, so the screen offers no Bookmarks filter.
// Older stored bookmark records stay in the store but are not listed.
test('offers only the Notes and Highlights filters and never lists bookmarks', async () => {
  service.result = {
    success: true,
    data: [annotation({ id: 'b1', type: 'bookmark', book: 'GEN', chapter: 1, verse_start: 1 })],
  };
  const view = await renderScreen();

  assert.equal(view.queryByRole('button', { name: 'Bookmarks' }), null);
  assert.equal(view.queryByText('Genesis 1:1'), null);
  assert.ok(view.getByText(t('annotations.noNotes')));

  await view.press(view.getByRole('button', { name: t('annotations.highlights') }));
  assert.ok(view.getByRole('button', { name: t('annotations.highlights'), selected: true }));
  assert.ok(view.getByText(t('annotations.noHighlights')));
  assert.equal(view.queryByText('Genesis 1:1'), null);
});

test('switching filters shows that type', async () => {
  service.result = {
    success: true,
    data: [
      annotation({ id: 'n1', content: 'A note' }),
      annotation({ id: 'h1', type: 'highlight', book: 'GEN', chapter: 1, verse_start: 1 }),
    ],
  };
  const view = await renderScreen();

  await view.press(view.getByRole('button', { name: t('annotations.highlights') }));
  assert.ok(view.getByText('Genesis 1:1'));
  assert.equal(view.queryByText('A note'), null);

  await view.press(view.getByRole('button', { name: t('annotations.notes') }));
  assert.ok(view.getByText('A note'));
  assert.equal(view.queryByText('Genesis 1:1'), null);
});

test('a multi-verse annotation shows its range, a single verse shows one number', async () => {
  service.result = {
    success: true,
    data: [
      annotation({ id: 'r', book: 'ROM', chapter: 8, verse_start: 28, verse_end: 30 }),
      annotation({ id: 's', book: 'PSA', chapter: 23, verse_start: 1, verse_end: null }),
    ],
  };

  const view = await renderScreen();

  assert.ok(view.getByText('Romans 8:28-30'));
  assert.ok(view.getByText('Psalms 23:1'));
});

test('soft-deleted annotations are never listed', async () => {
  service.result = {
    success: true,
    data: [
      annotation({ id: 'gone', content: 'Deleted note', deleted_at: '2026-09-02T00:00:00.000Z' }),
    ],
  };

  const view = await renderScreen();

  assert.equal(view.queryByText('Deleted note'), null);
  assert.ok(view.getByText(t('annotations.noNotes')));
});

test('pressing an annotation opens the reader at that verse', async () => {
  service.result = {
    success: true,
    data: [annotation({ id: 'n1', content: 'Born again', verse_start: 3 })],
  };
  const view = await renderScreen();

  await view.press(view.getByText('Born again'));

  assert.deepEqual(rootNavigation.calls, [
    ['Bible', { screen: 'BibleReader', params: { bookId: 'JHN', chapter: 3, focusVerse: 3 } }],
  ]);
});

test('pressing an annotation before navigation is ready does nothing', async () => {
  rootNavigation.ready = false;
  service.result = { success: true, data: [annotation({ content: 'Early tap' })] };
  const view = await renderScreen();

  await view.press(view.getByText('Early tap'));

  assert.deepEqual(rootNavigation.calls, []);
});

test('a failed load offers a retry that shows the annotations once it succeeds', async () => {
  service.result = { success: false, error: 'storage unavailable' };
  const view = await renderScreen();

  assert.ok(view.getByText(t('common.somethingWentWrong')));
  assert.equal(view.queryByText(t('annotations.noNotes')), null);

  service.result = { success: true, data: [annotation({ content: 'Recovered note' })] };
  await view.press(view.getByRole('button', { name: t('common.retry') }));
  await view.flush();

  assert.equal(service.calls, 2);
  assert.equal(view.queryByText(t('common.somethingWentWrong')), null);
  assert.ok(view.getByText('Recovered note'));
});

test('the back button leaves the screen', async () => {
  const view = await renderScreen();

  await view.press(view.getByRole('button', { name: t('common.back') }));

  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

test('coming back to the screen shows annotations changed in the reader meanwhile', async () => {
  service.result = { success: true, data: [annotation({ id: 'n1', content: 'Old note' })] };
  const view = await renderScreen();
  assert.ok(view.getByText('Old note'));

  // The user opened the note in the reader (the More stack stays mounted), deleted
  // it and wrote another, then came back to this tab.
  service.result = { success: true, data: [annotation({ id: 'n2', content: 'New note' })] };
  harness.navigation.emit('focus', undefined);
  await view.flush();

  assert.equal(view.queryByText('Old note'), null);
  assert.ok(view.getByText('New note'));
});

// The list is ordered by last edit, so each card shows when it was last edited.
test('each card shows the date of its last edit, or its creation date when never edited', async () => {
  service.result = {
    success: true,
    data: [
      annotation({
        id: 'edited',
        content: 'Edited later',
        created_at: '2026-03-02T12:00:00.000Z',
        updated_at: '2026-09-20T12:00:00.000Z',
      }),
      annotation({
        id: 'legacy',
        content: 'No edit stamp',
        verse_start: 17,
        created_at: '2026-05-06T12:00:00.000Z',
        updated_at: '',
      }),
    ],
  };
  const dateText = (iso: string) => new Date(iso).toLocaleDateString('en');

  const view = await renderScreen();

  assert.ok(view.getByText(dateText('2026-09-20T12:00:00.000Z')));
  assert.equal(view.queryByText(dateText('2026-03-02T12:00:00.000Z')), null);
  assert.ok(view.getByText(dateText('2026-05-06T12:00:00.000Z')));
});
