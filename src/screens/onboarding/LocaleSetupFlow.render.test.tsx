import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { act, type ReactTestInstance } from 'react-test-renderer';
import {
  flattenStyle,
  hostAncestors,
  hostNodeCalls,
  textContent,
  within,
  type RenderResult,
} from '../../testing/render';
import {
  BUNDLED_BIBLES,
  downloadableBible,
  installLocaleSetupFlowFakes,
} from './localeSetupFlowRenderFixtures';

// iOS: the keyboard reports its frame up front (keyboardWillShow). Android's
// hardware back and measured keyboard overlap live in the .android file.
const fakes = installLocaleSetupFlowFakes(mock, { os: 'ios' });
const { harness } = fakes;
const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

async function design() {
  return import('../../design/system');
}

function colors() {
  assert.ok(fakes.colors.current, 'the theme colors were captured');
  return fakes.colors.current;
}

function theList(view: RenderResult): ReactTestInstance {
  const [list] = view.queryAllByType('FlatList');
  assert.ok(list, 'the step renders one list');
  return list;
}

function listPaddingBottom(view: RenderResult): unknown {
  return flattenStyle(theList(view).props.contentContainerStyle)?.paddingBottom;
}

/** The grouped-card slice a list row draws for itself. */
function groupedCardEdges(row: ReactTestInstance): Record<string, unknown> {
  const card = hostAncestors(row).find(
    (node) => flattenStyle(node.props.style)?.borderLeftWidth === 1
  );
  assert.ok(card, 'the row sits in a grouped-card slice');
  const style = flattenStyle(card.props.style) ?? {};
  return {
    top: style.borderTopWidth ?? 0,
    bottom: style.borderBottomWidth ?? 0,
    topRadius: style.borderTopLeftRadius ?? style.borderRadius ?? 0,
    bottomRadius: style.borderBottomLeftRadius ?? style.borderRadius ?? 0,
  };
}

async function pause(timers: { tick: (ms: number) => void }, ms: number) {
  await act(async () => {
    timers.tick(ms);
  });
}

async function showKeyboard(height: number) {
  await act(async () => {
    harness.rn.Keyboard.emit('keyboardWillShow', {
      endCoordinates: { height, screenY: 844 - height, screenX: 0, width: 390 },
    });
  });
}

async function renderSettings(props: Record<string, unknown> = {}) {
  const view = await fakes.renderFlow({ mode: 'settings', ...props });
  await view.flush();
  return view;
}

// ─── First run ──────────────────────────────────────────────────────────────

test('first run opens straight on the Bible language step with search and the whole grouped list', async () => {
  const view = await fakes.renderFlow();

  assert.ok(view.getByRole('header', { name: t('onboarding.languageTitle') }));
  const search = view.getByTestId('onboarding-translation-search');
  assert.equal(search.props.accessibilityLabel, t('onboarding.languageSearchPlaceholder'));

  // The pinned recommendation, then every letter section, with no toggle to open them.
  const recommendation = view.getByTestId('onboarding-primary-recommendation');
  assert.ok(
    within(recommendation).getByRole('button', {
      name: 'English, Berean Standard Bible (BSB) · Text, Recommended',
    })
  );
  for (const letter of ['H', 'N']) assert.ok(view.getByText(letter), `section ${letter} is listed`);
  for (const languageName of [
    /^Hausa, /,
    /^Hindi \/ हिन्दी, /,
    /^Hmong, /,
    /^Nepali \/ नेपाली, /,
  ]) {
    assert.ok(view.getByRole('button', { name: languageName }));
  }
  assert.equal(view.queryByTestId('onboarding-bible-language-toggle'), null);

  // App language is an inline control, not a step of its own.
  const appLanguage = view.getByTestId('onboarding-interface-language-toggle');
  assert.ok(within(appLanguage).getByRole('button', { name: 'App language' }));
  assert.equal(view.queryByTestId('onboarding-interface-language-search'), null);
  assert.equal(view.queryByTestId('onboarding-interface-language-inline-picker'), null);

  // One step only: no account step, no step counter, nothing to go back to, no footer.
  assert.equal(view.queryByText(/^Step \d+ of \d+$/), null);
  assert.equal(view.queryByRole('button', { name: t('common.back') }), null);
  assert.equal(view.queryByTestId('onboarding-primary-action'), null);
  assert.equal(view.queryAllByType('LinearGradient').length, 0);

  // Lucide glyphs throughout, never the Ionicons set.
  assert.equal(view.queryAllByType('Icon').length, 0);
  assert.ok(view.queryAllByType('LucideIcon').length > 0);
});

test('picking a Bible on first run finishes onboarding with it, then syncs preferences', async () => {
  let completed = 0;
  const view = await fakes.renderFlow({ onComplete: () => completed++ });

  await view.press(view.getByRole('button', { name: /^English, Berean Standard Bible/ }));
  await fakes.waitForSync();

  assert.deepEqual(fakes.changeLanguage.calls, ['en']);
  assert.deepEqual(fakes.bibleCalls, [
    { method: 'setPreferredTranslationLanguage', args: ['English'] },
    { method: 'setCurrentTranslation', args: ['bsb'] },
  ]);
  const { preferences } = harness.authStore.getState();
  assert.equal(preferences.onboardingCompleted, true);
  assert.equal(preferences.countryCode, 'US', 'the device nation is stored');
  assert.equal(preferences.contentLanguageCode, 'eng');
  assert.equal(completed, 1);
  assert.equal(fakes.sync.calls, 1);
});

test('when the Bible library cannot be reached, a retry card shows above the Bibles that ship with the app', async () => {
  fakes.catalog.impl = async () => {
    throw new Error('offline');
  };
  const warn = mock.method(console, 'warn', () => {});
  try {
    const view = await fakes.renderFlow();
    await view.flush();

    assert.equal(fakes.catalog.loads, 1);
    assert.ok(view.getByText(t('onboarding.catalogUnavailableTitle')));
    assert.ok(view.getByText(t('onboarding.catalogUnavailableBody')));
    const retry = view.getByTestId('onboarding-runtime-catalog-retry');
    assert.ok(view.getByRole('button', { name: /^English, Berean Standard Bible/ }));
    assert.ok(view.getByRole('button', { name: /^Hausa, / }), 'bundled Bibles stay listed');

    fakes.catalog.impl = async () => {};
    await view.press(within(retry).getByRole('button', { name: t('common.retry') }));
    await view.flush();

    assert.equal(fakes.catalog.loads, 2, 'Retry loads the catalog again');
    assert.equal(view.queryByTestId('onboarding-runtime-catalog-retry'), null);
    assert.equal(view.queryByText(t('onboarding.catalogUnavailableTitle')), null);
  } finally {
    warn.mock.restore();
  }
});

test('choosing an app language closes the picker and stays on the Bible step even when loading it fails', async () => {
  fakes.changeLanguage.impl = async () => {
    throw new Error('locale bundle missing');
  };
  const warn = mock.method(console, 'warn', () => {});
  try {
    const view = await fakes.renderFlow();
    await view.press(view.getByRole('button', { name: 'App language' }));

    const picker = view.getByTestId('onboarding-interface-language-inline-picker');
    assert.ok(within(picker).getByRole('button', { name: /^App language/, selected: true }));
    await view.press(within(picker).getByRole('button', { name: /^Idioma de la app/ }));
    await view.flush();

    assert.deepEqual(fakes.changeLanguage.calls, ['es']);
    assert.equal(harness.authStore.getState().preferences.language, 'es');
    assert.equal(view.queryByTestId('onboarding-interface-language-inline-picker'), null);
    assert.ok(view.getByRole('header', { name: t('onboarding.languageTitle') }));
    assert.ok(view.getByTestId('onboarding-translation-search'));
    const toggle = view.getByTestId('onboarding-interface-language-toggle');
    assert.ok(within(toggle).getByText('Español'), 'the toggle shows the new app language');
  } finally {
    warn.mock.restore();
  }
});

for (const { region, failedLanguage, fallbackId } of [
  { region: 'IN', failedLanguage: 'Awadhi', fallbackId: 'hincv' },
  { region: 'NP', failedLanguage: 'Maithili', fallbackId: 'npiulb' },
]) {
  test(`a failed ${failedLanguage} download on a device in ${region} finishes onboarding with the bundled ${fallbackId}`, async () => {
    fakes.deviceLocale.regionCode = region;
    fakes.useBibleStore.setState({
      translations: [...BUNDLED_BIBLES, downloadableBible('dl', failedLanguage)],
    });
    fakes.download.impl = async () => {
      throw new Error('network');
    };
    let completed = 0;
    const view = await fakes.renderFlow({ onComplete: () => completed++ });

    await view.press(view.getByRole('button', { name: new RegExp(`^${failedLanguage}, `) }));
    await fakes.waitForSync();

    assert.deepEqual(
      fakes.bibleCalls.map(({ method, args }) => `${method}(${args.join()})`),
      [
        'downloadTranslation(dl)',
        `setPreferredTranslationLanguage(${region === 'IN' ? 'Hindi' : 'Nepali'})`,
        `setCurrentTranslation(${fallbackId})`,
      ]
    );
    assert.equal(harness.authStore.getState().preferences.onboardingCompleted, true);
    assert.equal(completed, 1);
    assert.deepEqual(harness.rn.__recorded.alerts, [], 'no download-failed alert');
  });
}

test('the first frame of the Bible step never builds nation names or searches the locale catalog', async () => {
  const view = await fakes.renderFlow({}, { probes: true });
  await view.flush();

  const firstPass = fakes.log.slice(
    fakes.log.indexOf('render:before') + 1,
    fakes.log.indexOf('render:after')
  );
  // Recommendation scoring still looks each Bible's language up by name during
  // this render (see the report on the engine guard); nothing else may.
  assert.deepEqual(
    [...new Set(firstPass)].filter((entry) => entry !== 'engine:getLanguageByName'),
    []
  );
  assert.equal(firstPass.includes('prewarm'), false, 'the prewarm waits for interactions');
  assert.equal(fakes.prewarmCalls.count, 1, 'the engine is prewarmed once after mount');
  assert.deepEqual(
    fakes.log.filter((entry) => /^engine:(?!getLanguageByName$)/.test(entry)),
    [],
    'no nation lookup, display-name build or search ever runs on the Bible step'
  );
});

// ─── The virtualized list ───────────────────────────────────────────────────

test('every step body is one FlashList that keeps taps while the keyboard is up, never a ScrollView', async () => {
  const view = await fakes.renderFlow();

  const list = theList(view);
  assert.equal(list.props.virtualizedBy, 'FlashList');
  assert.equal(view.queryAllByType('ScrollView').length, 0);
  assert.equal(list.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(list.props.keyboardDismissMode, 'on-drag');

  const props = fakes.flashList.props;
  assert.ok(props);
  const keyOf = props.keyExtractor as (item: object, index: number) => string;
  const typeOf = props.getItemType as (item: object) => string;
  assert.equal(keyOf({ id: 'option-hausa', type: 'option' }, 7), 'option-hausa', 'keyed by id');
  assert.equal(typeOf({ id: 'option-hausa', type: 'option' }), 'option');
  assert.ok((props.estimatedItemSize as number) > 0);
});

test('the search field is the same mounted input while the list re-filters, and the list returns to the top', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const view = await fakes.renderFlow();
  const search = view.getByTestId('onboarding-translation-search');
  const scrolls = () => hostNodeCalls.filter((call) => call.method === 'scrollToOffset');

  await view.changeText(search, 'Hau');
  await pause(context.mock.timers, 150);

  assert.equal(view.queryByRole('button', { name: /^Hmong, / }), null, 'the list re-filtered');
  assert.ok(view.getByRole('button', { name: /^Hausa, / }));
  assert.equal(view.getByTestId('onboarding-translation-search'), search, 'never remounted');
  assert.equal(search.props.value, 'Hau');
  assert.deepEqual(
    scrolls().map((call) => ({ type: call.type, args: call.args })),
    [{ type: 'FlatList', args: [{ offset: 0, animated: false }] }]
  );
  assert.equal(
    (fakes.flashList.props?.data as Array<{ type: string }>).some((item) => item.type === 'search'),
    false,
    'the field is list header content, not a recycled row'
  );
});

test('rows draw their own grouped-card edges by position in their letter group', async () => {
  const { radius } = await design();
  const view = await fakes.renderFlow();
  const row = (name: RegExp) => view.getByRole('button', { name });
  const lg = radius.lg;

  assert.deepEqual(groupedCardEdges(row(/^Hausa, /)), {
    top: 1,
    bottom: 0,
    topRadius: lg,
    bottomRadius: 0,
  });
  assert.deepEqual(groupedCardEdges(row(/^Hindi \//)), {
    top: 0,
    bottom: 0,
    topRadius: 0,
    bottomRadius: 0,
  });
  assert.deepEqual(groupedCardEdges(row(/^Hmong, /)), {
    top: 0,
    bottom: 1,
    topRadius: 0,
    bottomRadius: lg,
  });
  assert.deepEqual(groupedCardEdges(row(/^Nepali \//)), {
    top: 1,
    bottom: 1,
    topRadius: lg,
    bottomRadius: lg,
  });

  // The hairline between rows belongs to every row but the one closing its group.
  const separator = (name: RegExp) => flattenStyle(row(name).props.style)?.borderBottomWidth;
  assert.equal(separator(/^Hausa, /), 1);
  assert.equal(separator(/^Hindi \//), 1);
  assert.equal(separator(/^Hmong, /), undefined);
  assert.equal(separator(/^Nepali \//), undefined);
});

test('an option row subtitle wraps to two lines instead of truncating beside its chip', async () => {
  const view = await fakes.renderFlow();

  const subtitle = view.getByText('Berean Standard Bible (BSB) · Text');
  assert.equal(subtitle.props.numberOfLines, 2);
});

test('with no footer on first run, the list only reserves the keyboard plus breathing room', async () => {
  const { spacing } = await design();
  const view = await fakes.renderFlow();

  assert.equal(listPaddingBottom(view), spacing.xxl);
  await showKeyboard(300);
  assert.equal(listPaddingBottom(view), 300 - harness.insets.bottom + spacing.xxl);
});

// ─── Settings: nation, then Bible language ──────────────────────────────────

test('the header counts real steps and fills one rail segment per step reached', async () => {
  const view = await renderSettings();
  const railFor = (eyebrow: ReactTestInstance) => {
    const [center] = hostAncestors(eyebrow);
    const bar = within(center)
      .queryAllByType('View')
      .find((node) => flattenStyle(node.props.style)?.width === 120);
    assert.ok(bar, 'a 120pt step rail sits under the eyebrow');
    return within(bar)
      .queryAllByType('View')
      .filter((node) => node !== bar)
      .map((segment) => {
        const style = flattenStyle(segment.props.style) ?? {};
        assert.equal(style.height, 3);
        return style.backgroundColor;
      });
  };

  assert.deepEqual(railFor(view.getByText('Step 1 of 2')), [
    colors().accentPrimary,
    colors().borderStrong,
  ]);

  await view.press(view.getByRole('button', { name: 'Continue with United States' }));

  assert.deepEqual(railFor(view.getByText('Step 2 of 2')), [
    colors().accentPrimary,
    colors().accentPrimary,
  ]);
});

test('the device nation is suggested in an accent-rule card with a Suggested chip, above all nations', async () => {
  const view = await renderSettings();

  const eyebrow = view.getByText(t('onboarding.suggestedFromDevice'));
  const card = view.getByRole('button', {
    name: 'United States, 2 languages, Suggested',
    selected: true,
  });
  assert.ok(within(card).getByText('Suggested'));
  const accentRule = within(card)
    .queryAllByType('View')
    .find(
      (node) =>
        node.props.pointerEvents === 'none' &&
        flattenStyle(node.props.style)?.backgroundColor === colors().accentPrimary
    );
  assert.ok(accentRule, 'the card carries the accent rule');
  assert.ok(eyebrow);

  // The suggestion is not repeated in the full list below it.
  assert.ok(view.getByText(t('onboarding.allNations')));
  assert.deepEqual(
    view.getAllByRole('button', { name: /languages?$/ }).map((row) => row.props.accessibilityLabel),
    ['India, 2 languages', 'Nepal, 1 language']
  );
});

test('the footer fades the list out and its primary action names the chosen nation', async () => {
  const view = await renderSettings();

  const [gradient] = view.queryAllByType('LinearGradient');
  assert.deepEqual(gradient.props.colors, [
    'transparent',
    colors().background,
    colors().background,
  ]);
  assert.deepEqual(gradient.props.locations, [0, 0.3, 1]);
  assert.equal(gradient.props.pointerEvents, 'none');

  const action = view.getByTestId('onboarding-primary-action');
  assert.ok(within(action).getByRole('button', { name: 'Continue with United States' }));

  await view.press(view.getByRole('button', { name: 'India, 2 languages' }));

  assert.ok(within(action).getByRole('button', { name: 'Continue with India' }));
  assert.ok(view.getByText(t('onboarding.searchAboveHint')));
});

test('backward navigation is the header icon button only, and in settings it closes the flow', async () => {
  let closed = 0;
  const view = await renderSettings({ onClose: () => closed++ });

  assert.equal(view.queryByTestId('onboarding-secondary-action'), null);
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.equal(closed, 1);

  await view.press(view.getByRole('button', { name: 'Continue with United States' }));
  assert.equal(view.queryByTestId('onboarding-secondary-action'), null);
  assert.equal(view.getAllByRole('button', { name: t('common.back') }).length, 1);
  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.equal(closed, 2);

  // The chosen-nation pill is how the language step returns to the nation step.
  await view.press(view.getByRole('button', { name: 'United States' }));
  assert.ok(view.getByRole('header', { name: t('onboarding.countryTitle') }));
});

test('finishing settings stores the nation and Bible language, marks onboarding done and syncs', async () => {
  let completed = 0;
  const view = await renderSettings({ onComplete: () => completed++ });

  await view.press(view.getByRole('button', { name: 'India, 2 languages' }));
  await view.press(view.getByRole('button', { name: 'Continue with India' }));
  await view.flush();

  assert.ok(view.getByText('Recommended Bible languages in India'));
  assert.ok(view.getByRole('button', { name: t('onboarding.finish'), disabled: true }));
  await view.press(view.getByRole('button', { name: 'हिन्दी, Hindi, Recommended' }));
  await view.press(view.getByRole('button', { name: t('onboarding.finish') }));
  await fakes.waitForSync();

  const { preferences } = harness.authStore.getState();
  assert.deepEqual(
    {
      countryCode: preferences.countryCode,
      countryName: preferences.countryName,
      contentLanguageCode: preferences.contentLanguageCode,
      contentLanguageName: preferences.contentLanguageName,
      onboardingCompleted: preferences.onboardingCompleted,
    },
    {
      countryCode: 'IN',
      countryName: 'India',
      contentLanguageCode: 'hin',
      contentLanguageName: 'Hindi',
      onboardingCompleted: true,
    }
  );
  assert.equal(completed, 1);
  assert.equal(fakes.sync.calls, 1);
});

test('a new step starts a fresh list scrolled to the top', async () => {
  const view = await renderSettings();
  const countryList = theList(view);

  await view.press(view.getByRole('button', { name: 'Continue with United States' }));

  assert.notEqual(theList(view), countryList, 'the list is remounted for the new step');
  assert.ok(view.getByTestId('onboarding-language-search'));
});

test('the list reserves the pinned footer, the keyboard and breathing room, and the footer lifts over the keyboard', async () => {
  const { spacing } = await design();
  const view = await renderSettings();
  const footer = () =>
    hostAncestors(view.getByTestId('onboarding-primary-action')).find(
      (node) => typeof node.props.onLayout === 'function'
    ) as ReactTestInstance;

  // Before layout, an estimate stands in for the footer.
  assert.equal(listPaddingBottom(view), 113 + spacing.xxl);

  await view.fire(footer(), 'onLayout', { nativeEvent: { layout: { height: 140 } } });
  assert.equal(listPaddingBottom(view), 140 + spacing.xxl);

  await showKeyboard(300);
  const keyboardOverlap = 300 - harness.insets.bottom;
  assert.equal(listPaddingBottom(view), 140 + keyboardOverlap + spacing.xxl);
  assert.equal(flattenStyle(footer().props.style)?.bottom, keyboardOverlap);
  assert.ok(textContent(footer()).includes(t('onboarding.searchAboveHint')));
});
