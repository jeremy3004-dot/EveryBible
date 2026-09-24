import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockBarrel, mockModule, sourcePath } from '../../testing/mockModules';
import { installRenderHarness } from '../../testing/render';
import type { UserAnnotation } from '../../services/supabase/types';

const harness = installRenderHarness(mock);
const t = (key: string) => harness.i18n.t(key);

// The screen lists the on-device annotations the annotation service returns.
const service = {
  calls: 0,
  result: { success: true, data: [] as UserAnnotation[] } as {
    success: boolean;
    data?: UserAnnotation[];
    error?: string;
  },
};
mockBarrel(mock, 'services/annotations/index.ts', {
  provide: {
    fetchAnnotations: async () => {
      service.calls += 1;
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

beforeEach(() => {
  service.calls = 0;
  service.result = { success: true, data: [] };
  rootNavigation.ready = true;
  rootNavigation.calls = [];
});

async function renderScreen() {
  const { AnnotationsScreen } = await import('./AnnotationsScreen');
  const view = await harness.render(<AnnotationsScreen />);
  await view.flush();
  return view;
}

test('opens on the Notes filter and lists only notes, with their text', async () => {
  service.result = {
    success: true,
    data: [
      annotation({ id: 'n1', content: 'God so loved' }),
      annotation({ id: 'b1', type: 'bookmark', book: 'GEN', chapter: 1, verse_start: 1 }),
    ],
  };

  const view = await renderScreen();

  assert.ok(view.getByRole('button', { name: t('annotations.notes'), selected: true }));
  assert.ok(view.getByRole('button', { name: t('annotations.bookmarks'), selected: false }));
  assert.ok(view.getByText('God so loved'));
  assert.ok(view.getByText('John 3:16'));
  assert.equal(view.queryByText('Genesis 1:1'), null);
});

test('switching filters shows that type, and each empty type has its own message', async () => {
  service.result = {
    success: true,
    data: [annotation({ id: 'b1', type: 'bookmark', book: 'GEN', chapter: 1, verse_start: 1 })],
  };
  const view = await renderScreen();

  assert.ok(view.getByText(t('annotations.noNotes')));

  await view.press(view.getByRole('button', { name: t('annotations.bookmarks') }));
  assert.ok(view.getByText('Genesis 1:1'));
  assert.ok(view.getByRole('button', { name: t('annotations.bookmarks'), selected: true }));

  await view.press(view.getByRole('button', { name: t('annotations.highlights') }));
  assert.ok(view.getByText(t('annotations.noHighlights')));
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
