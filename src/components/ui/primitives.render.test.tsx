import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  flattenStyle,
  installRenderHarness,
  isHiddenFromAccessibility,
  within,
} from '../../testing/render';

const harness = installRenderHarness(mock);

test('SectionHeader titles are headings the rotor can jump between, and wrap rather than truncate', async () => {
  const { SectionHeader } = await import('./SectionHeader');
  const view = await harness.render(<SectionHeader title="Reading plans" />);

  const heading = view.getByRole('header', { name: 'Reading plans' });
  assert.equal(heading.props.numberOfLines, 2);
});

test('SectionHeader shows its eyebrow instead of the action, and the action is a pressable button', async () => {
  const { SectionHeader } = await import('./SectionHeader');
  let seeAll = 0;
  const action = { label: 'See all', onPress: () => (seeAll += 1) };

  const withEyebrow = await harness.render(
    <SectionHeader title="Plans" eyebrow="2 PLANS" action={action} />
  );
  assert.ok(withEyebrow.getByText('2 PLANS'));
  assert.equal(withEyebrow.queryByText('See all'), null);
  await withEyebrow.unmount();

  const withAction = await harness.render(<SectionHeader title="Plans" action={action} />);
  await withAction.press(withAction.getByRole('button', { name: 'See all' }));
  assert.equal(seeAll, 1);
});

test('EmptyState names its heading, hides its decorative icon, and runs its call to action', async () => {
  const { EmptyState } = await import('./EmptyState');
  let started = 0;
  const view = await harness.render(
    <EmptyState
      icon="book-outline"
      title="No plans yet"
      body="Pick a plan to start."
      cta={{ label: 'Browse plans', onPress: () => (started += 1) }}
    />
  );

  assert.ok(view.getByRole('header', { name: 'No plans yet' }));
  assert.ok(view.getByText('Pick a plan to start.'));

  const [icon] = view.queryAllByType('Icon');
  assert.equal(icon.props.name, 'book-outline');
  assert.equal(isHiddenFromAccessibility(icon), true, 'the icon repeats the title');

  await view.press(view.getByRole('button', { name: 'Browse plans' }));
  assert.equal(started, 1);
});

test('EmptyState without a body or call to action renders only the heading', async () => {
  const { EmptyState } = await import('./EmptyState');
  const view = await harness.render(<EmptyState icon="book-outline" title="Nothing here" />);

  assert.equal(view.queryAllByType('Text').length, 1);
  assert.equal(view.queryByRole('button'), null);
});

test('a static AppCard with a label is an accessibility element, so the label is not dropped', async () => {
  const { AppCard } = await import('./AppCard');
  const { Text } = harness.rn;
  const view = await harness.render(
    <AppCard accessibilityLabel="Day 3 of 30">
      <Text>Genesis 5</Text>
    </AppCard>
  );

  const card = view.getByLabelText('Day 3 of 30');
  assert.equal(card.props.accessible, true);

  const unlabelled = await harness.render(
    <AppCard>
      <Text>Genesis 6</Text>
    </AppCard>
  );
  assert.equal(
    unlabelled.queryAllByType('View').some((node) => node.props.accessible),
    false
  );
});

test('a pressable AppCard is a button that runs its handler', async () => {
  const { AppCard } = await import('./AppCard');
  const { Text } = harness.rn;
  let opened = 0;
  const view = await harness.render(
    <AppCard onPress={() => (opened += 1)} accessibilityLabel="Open plan">
      <Text>Genesis 5</Text>
    </AppCard>
  );

  await view.press(view.getByRole('button', { name: 'Open plan' }));
  assert.equal(opened, 1);
});

// Alte Haas covers Latin-1 only. SectionHeader's eyebrow and title and ListRow's
// trailing value carry translated text, so in a language the face cannot draw
// they must drop to the platform font and its natural tracking, or every
// section header and settings value renders as tofu.
test('SectionHeader and ListRow fall back from the display face in a language it cannot draw', async () => {
  const { SectionHeader } = await import('./SectionHeader');
  const { ListRow } = await import('./ListRow');
  const { displayFamily } = await import('../../design/fonts');
  const surfaces = (
    <>
      <SectionHeader title="Планы" eyebrow="2 ПЛАНА" />
      <ListRow title="Язык" value="Русский" onPress={() => {}} />
    </>
  );
  const slots = (view: Awaited<ReturnType<typeof harness.render>>) => ({
    title: flattenStyle(view.getByText('Планы').props.style),
    eyebrow: flattenStyle(view.getByText('2 ПЛАНА').props.style),
    value: flattenStyle(view.getByText('Русский').props.style),
  });

  // Each view unmounts before the language changes, so no mounted tree re-renders
  // outside act().
  const latinView = await harness.render(surfaces);
  const latin = slots(latinView);
  await latinView.unmount();
  assert.equal(latin.title.fontFamily, displayFamily(700));
  assert.equal(latin.eyebrow.fontFamily, displayFamily(400));
  assert.equal(latin.value.fontFamily, displayFamily(400));
  assert.notEqual(latin.eyebrow.letterSpacing, 0, 'Latin keeps the EL eyebrow tracking');

  await harness.i18n.changeLanguage('ru');
  try {
    const cyrillicView = await harness.render(surfaces);
    const cyrillic = slots(cyrillicView);
    await cyrillicView.unmount();
    for (const [slot, style] of Object.entries(cyrillic)) {
      assert.equal(style.fontFamily, undefined, `${slot} must fall back to the platform face`);
      assert.equal(style.letterSpacing, 0, `${slot} must drop the display tracking`);
      assert.equal(style.lineHeight, undefined, `${slot} must not clip tall scripts`);
    }
  } finally {
    await harness.i18n.changeLanguage('en');
  }
});

test('ListRow announces its value and subtitle along with its title', async () => {
  const { ListRow } = await import('./ListRow');
  const view = await harness.render(
    <ListRow title="Text size" value="Large" subtitle="Applies to the reader" onPress={() => {}} />
  );

  const row = view.getByRole('button', { name: 'Text size, Large, Applies to the reader' });
  assert.equal(row.props.hitSlop, 8, 'the separator gap is not dead space');

  // Settings relies on the 52pt floor and a single-line value column.
  const [content] = within(row).queryAllByType('View');
  assert.equal(flattenStyle(content.props.style)?.minHeight, 52);
  assert.equal(view.getByText('Large').props.numberOfLines, 1);
});

test('a disabled ListRow is announced as disabled and ignores presses', async () => {
  const { ListRow } = await import('./ListRow');
  let pressed = 0;
  const view = await harness.render(
    <ListRow title="Download" disabled onPress={() => (pressed += 1)} />
  );

  const row = view.getByRole('button', { name: 'Download', disabled: true });
  await view.press(row);
  assert.equal(pressed, 0);
  assert.deepEqual(harness.haptics, [], 'a disabled row does not buzz either');
});

// The 0.45 dimming alone falls below AA, so disabled must also be announced
// (WCAG 1.4.1 — state is not carried by colour alone). contrastAudit.test.ts
// records why the dimming itself is exempt.
test('a disabled IconButton is dimmed, announced as disabled, and ignores presses', async () => {
  const { IconButton } = await import('./IconButton');
  const Glyph = (() => null) as unknown as import('lucide-react-native').LucideIcon;
  let pressed = 0;
  const view = await harness.render(
    <IconButton icon={Glyph} accessibilityLabel="Share" disabled onPress={() => (pressed += 1)} />
  );

  const button = view.getByRole('button', { name: 'Share', disabled: true });
  assert.equal(button.props.accessibilityState?.disabled, true);
  assert.equal(flattenStyle(button.props.style).opacity, 0.45);
  await view.press(button);
  assert.equal(pressed, 0);
  assert.deepEqual(harness.haptics, []);

  await view.rerender(
    <IconButton icon={Glyph} accessibilityLabel="Share" onPress={() => (pressed += 1)} />
  );
  const enabled = view.getByRole('button', { name: 'Share', disabled: false });
  assert.equal(flattenStyle(enabled.props.style).opacity, undefined);
  await view.press(enabled);
  assert.equal(pressed, 1);
});

test('ListRow passes accessible={false} through so a trailing Switch stays its own focus stop', async () => {
  const { ListRow } = await import('./ListRow');
  const { Switch } = harness.rn;
  const view = await harness.render(
    <ListRow
      title="Reminders"
      accessible={false}
      trailing={<Switch value accessibilityLabel="Reminders" />}
      onPress={() => {}}
    />
  );

  assert.equal(view.getByRole('button').props.accessible, false);
  assert.equal(view.queryAllByType('Switch').length, 1);
});

test('Sheet is a named, iOS-modal dialog whose backdrop closes it and whose title is announced', async () => {
  const { Sheet } = await import('./Sheet');
  const { Text } = harness.rn;
  let closed = 0;
  const view = await harness.render(
    <Sheet visible title="Share verse" onClose={() => (closed += 1)}>
      <Text>Body</Text>
    </Sheet>
  );

  const [modal] = view.queryAllByType('Modal');
  assert.equal(modal.props.statusBarTranslucent, true);
  assert.equal(modal.props.navigationBarTranslucent, true);
  assert.equal(modal.props.onRequestClose !== undefined, true, 'Android back closes the sheet');

  const [avoider] = view.queryAllByType('KeyboardAvoidingView');
  assert.equal(avoider.props.behavior, 'padding');
  assert.ok(view.queryAllByType('View').some((node) => node.props.accessibilityViewIsModal));

  await view.press(view.getByRole('button', { name: 'Close' }));
  assert.equal(closed, 1);
  assert.deepEqual(harness.rn.__recorded.announcements, ['Share verse']);
});

test('a hidden Sheet renders nothing', async () => {
  const { Sheet } = await import('./Sheet');
  const { Text } = harness.rn;
  const view = await harness.render(
    <Sheet visible={false} onClose={() => {}}>
      <Text>Body</Text>
    </Sheet>
  );

  assert.equal(view.queryAllByType('Modal').length, 0);
  assert.equal(view.queryByText('Body'), null);
});

test('Sheet uses the caller close label when one is given', async () => {
  const { Sheet } = await import('./Sheet');
  const view = await harness.render(
    <Sheet visible onClose={() => {}} closeLabel="Dismiss picker">
      {null}
    </Sheet>
  );

  assert.ok(view.getByRole('button', { name: 'Dismiss picker' }));
});

test('ProgressBar announces a named progress bar', async () => {
  const { ProgressBar } = await import('./ProgressBar');
  const view = await harness.render(<ProgressBar progress={0.4} accessibilityLabel="Download" />);

  const bar = view.getByRole('progressbar', { name: 'Download' });
  assert.equal(bar.props.accessibilityValue?.now, 40);
});

test('an Avatar reads as its name, and an unnamed one is decorative', async () => {
  const { Avatar } = await import('./Avatar');
  const named = await harness.render(<Avatar name="Ruth Miller" />);

  const avatar = named.getByRole('image', { name: 'Ruth Miller' });
  assert.equal(avatar.props.accessible, true);
  const initials = named.getByText('RM');
  assert.equal(initials.props.accessible, false, 'the container carries the whole label');

  const unnamed = await harness.render(<Avatar />);
  const [gradient] = unnamed.queryAllByType('LinearGradient');
  assert.equal(isHiddenFromAccessibility(gradient), true);
  assert.equal(unnamed.queryByRole('image'), null);
});

test('AppButton labels wrap to two lines and cap Dynamic Type growth', async () => {
  const { AppButton } = await import('./AppButton');
  let saved = 0;
  const view = await harness.render(
    <AppButton label="Save changes" onPress={() => (saved += 1)} />
  );

  const label = view.getByText('Save changes');
  assert.equal(label.props.numberOfLines, 2);
  assert.equal(label.props.maxFontSizeMultiplier, 1.6);

  const button = view.getByRole('button', { name: 'Save changes' });
  const style = flattenStyle(button.props.style);
  assert.ok(style?.minHeight, 'the pill grows with a wrapped label');
  assert.equal(style?.height, undefined, 'a fixed height would clip the second line');

  await view.press(button);
  assert.equal(saved, 1);
});

test('PressableScale is typed as a button only when it takes a press', async () => {
  const { PressableScale } = await import('./PressableScale');
  const { Text } = harness.rn;
  const tappable = await harness.render(
    <PressableScale onPress={() => {}} haptic="light">
      <Text>Tap</Text>
    </PressableScale>
  );
  await tappable.press(tappable.getByRole('button'));
  assert.deepEqual(harness.haptics, [{ kind: 'impact', style: 'light' }]);

  const inert = await harness.render(
    <PressableScale>
      <Text>Static</Text>
    </PressableScale>
  );
  assert.equal(inert.queryByRole('button'), null);
});
