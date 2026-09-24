import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactTestInstance } from 'react-test-renderer';
import { create } from 'zustand';
import { DEFAULT_APPEARANCE_PALETTE } from '../../constants/appearancePalettes';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { flattenStyle, installRenderHarness } from '../../testing/render';
import type { AudioReturnTarget, AudioStatus } from '../../types';

const harness = installRenderHarness(mock, { os: 'ios' });

interface FakeAudioState {
  status: AudioStatus;
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  lastPlayedTranslationId: string | null;
  audioReturnTarget: AudioReturnTarget | null;
}

const audioStore = create<FakeAudioState>()(() => ({
  status: 'playing',
  currentTranslationId: null,
  currentBookId: null,
  currentChapter: null,
  lastPlayedTranslationId: null,
  audioReturnTarget: null,
}));

const translationChanges: string[] = [];
const bibleStore = create<{
  currentTranslation: string;
  setCurrentTranslation: (id: string) => void;
}>()((set) => ({
  currentTranslation: 'bsb',
  setCurrentTranslation: (id) => {
    translationChanges.push(id);
    set({ currentTranslation: id });
  },
}));

const navigation = { ready: true, calls: [] as unknown[][] };
mockModule(mock, sourcePath('stores/audioStore.ts'), { useAudioStore: audioStore });
mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore: bibleStore });
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => navigation.ready,
    navigate: (...args: unknown[]) => navigation.calls.push(args),
  },
});

const johnThree: AudioReturnTarget = {
  translationId: 'web',
  bookId: 'JHN',
  chapter: 3,
  preferredMode: 'listen',
};

beforeEach(() => {
  audioStore.setState(audioStore.getInitialState(), true);
  bibleStore.setState(bibleStore.getInitialState(), true);
  translationChanges.length = 0;
  navigation.ready = true;
  navigation.calls.length = 0;
});

const tabName = (reference: string) => `${harness.i18n.t('audio.nowPlaying')}, ${reference}`;

async function renderTab(currentRouteName: string | null = 'Home') {
  const { AudioReturnTab } = await import('./AudioReturnTab');
  return harness.render(<AudioReturnTab currentRouteName={currentRouteName} />);
}

/** The animated shell that positions the tab: the host View around the button. */
function shellOf(node: ReactTestInstance): ReactTestInstance {
  let current = node.parent;
  while (current && typeof current.type !== 'string') current = current.parent;
  assert.ok(current);
  return current;
}

test('the tab appears only while audio is playing away from the Bible reader', async () => {
  const noTarget = await renderTab('Home');
  assert.equal(noTarget.queryByRole('button'), null, 'nothing to return to');
  await noTarget.unmount();

  audioStore.setState({ audioReturnTarget: johnThree, status: 'paused' });
  const paused = await renderTab('Home');
  assert.equal(paused.queryByRole('button'), null, 'paused audio shows no tab');
  await paused.unmount();

  audioStore.setState({ status: 'playing' });
  const onReader = await renderTab('BibleReader');
  assert.equal(onReader.queryByRole('button'), null, 'already on the reader');
  await onReader.unmount();

  const away = await renderTab('Home');
  assert.ok(away.getByRole('button', { name: tabName('John 3') }));
  assert.ok(away.getByText('John 3'));
});

test('the tab follows the live chapter when audio has advanced past the saved one', async () => {
  audioStore.setState({ audioReturnTarget: johnThree, currentBookId: 'JHN', currentChapter: 4 });
  const view = await renderTab();

  assert.ok(view.getByRole('button', { name: tabName('John 4') }));
  await view.press(view.getByRole('button'));
  const [[, params]] = navigation.calls as [[string, { params: { chapter: number } }]];
  assert.equal(params.params.chapter, 4);
});

test('pressing the tab returns to the reader with the saved mode and plan session', async () => {
  const sessionContext = { kind: 'rhythm' } as unknown as AudioReturnTarget['sessionContext'];
  audioStore.setState({
    audioReturnTarget: {
      ...johnThree,
      preferredMode: 'read',
      planId: 'plan-1',
      planDayNumber: 5,
      planSessionKey: 'morning' as AudioReturnTarget['planSessionKey'],
      returnToPlanOnComplete: true,
      sessionContext,
    },
  });
  const view = await renderTab();

  await view.press(view.getByRole('button', { name: tabName('John 3') }));

  assert.deepEqual(translationChanges, ['web'], 'switches to the translation that is playing');
  assert.deepEqual(navigation.calls, [
    [
      'Bible',
      {
        screen: 'BibleReader',
        params: {
          bookId: 'JHN',
          chapter: 3,
          preferredMode: 'read',
          planId: 'plan-1',
          planDayNumber: 5,
          planSessionKey: 'morning',
          returnToPlanOnComplete: true,
          sessionContext,
        },
      },
    ],
  ]);
});

test('a plain return carries no plan params, and nothing happens before navigation is ready', async () => {
  audioStore.setState({ audioReturnTarget: { ...johnThree, translationId: 'bsb' } });
  const view = await renderTab();

  navigation.ready = false;
  await view.press(view.getByRole('button'));
  assert.deepEqual(navigation.calls, []);

  navigation.ready = true;
  await view.press(view.getByRole('button'));
  assert.deepEqual(translationChanges, [], 'already on the playing translation');
  assert.deepEqual(navigation.calls, [
    [
      'Bible',
      { screen: 'BibleReader', params: { bookId: 'JHN', chapter: 3, preferredMode: 'listen' } },
    ],
  ]);
});

test('the tab is a slim, rotated right-edge tab outlined in a themed on-accent line', async () => {
  const { createThemeColors } = await import('../../contexts/ThemeContext');
  const { hexWithAlpha } = await import('../../utils/color');
  const colors = createThemeColors('light', DEFAULT_APPEARANCE_PALETTE);
  audioStore.setState({ audioReturnTarget: johnThree });
  const view = await renderTab();

  const button = view.getByRole('button');
  assert.equal(flattenStyle(shellOf(button).props.style)?.right, -59, 'flush with the screen edge');

  const tab = flattenStyle(button.props.style) ?? {};
  assert.equal(tab.height, 30);
  assert.deepEqual((tab.transform as unknown[])[0], { rotate: '-90deg' });
  assert.equal(tab.backgroundColor, colors.accentPrimary);
  assert.equal(tab.borderColor, hexWithAlpha(colors.onAccent, 0.78));
  assert.deepEqual(
    [tab.borderTopWidth, tab.borderLeftWidth, tab.borderRightWidth, tab.borderBottomWidth],
    [1, 1, 1, 0],
    'the screen-edge side stays unlined'
  );
});

test('the tab docks above the real tab bar height on every device', async () => {
  const { useTabBarHeight } = await import('../../hooks/useTabBarHeight');
  const { spacing } = await import('../../design/system');
  audioStore.setState({ audioReturnTarget: johnThree });
  const originalBottom = harness.insets.bottom;

  try {
    // A home-indicator phone (34pt inset) and one without: the shared tab bar
    // height, not the raw inset, decides where the tab sits.
    for (const [bottomInset, expectedTabBarHeight] of [
      [34, 22 + 64],
      [0, 16 + 64],
    ]) {
      harness.insets.bottom = bottomInset;
      const { Text } = harness.rn;
      function Probe() {
        return <Text testID="tab-bar-height">{useTabBarHeight().height}</Text>;
      }
      const probe = await harness.render(<Probe />);
      const tabBarHeight = Number(probe.getByTestId('tab-bar-height').props.children);
      await probe.unmount();
      assert.equal(tabBarHeight, expectedTabBarHeight);

      const view = await renderTab();
      const shell = shellOf(view.getByRole('button'));
      assert.equal(flattenStyle(shell.props.style)?.bottom, tabBarHeight + spacing.xxl);
      await view.unmount();
    }
  } finally {
    harness.insets.bottom = originalBottom;
  }
});
