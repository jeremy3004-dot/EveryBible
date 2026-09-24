import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { installRenderHarness, isHiddenFromAccessibility, within } from './render';

// The harness's own contract: what the fakes render and how the queries and
// actions behave. Component tests rely on these semantics matching RN.
const harness = installRenderHarness(mock, { os: 'android' });
const { Text, View, Pressable, TouchableOpacity, FlatList, Modal, TextInput } = harness.rn;

test('text queries match the whole text content and return the innermost nested Text', async () => {
  const view = await harness.render(
    <Text>
      Hello <Text>World</Text>
    </Text>
  );

  assert.ok(view.getByText('Hello World'));
  assert.equal(view.getByText('World').props.children, 'World');
  assert.ok(view.getByText(/^Hello/));
  assert.equal(view.queryByText('Hello'), null, 'a string matches exactly');
});

test('a failed getBy query prints the rendered tree', async () => {
  const view = await harness.render(<Text accessibilityRole="header">Plans</Text>);

  assert.throws(
    () => view.getByText('Missing'),
    /Unable to find an element for text Missing[\s\S]*Text accessibilityRole="header" "Plans"/
  );
});

test('role and label queries skip content hidden from assistive tech unless asked', async () => {
  const view = await harness.render(
    <View>
      <View importantForAccessibility="no-hide-descendants">
        <Text accessibilityRole="image" accessibilityLabel="Decoration" />
      </View>
      <Text accessibilityRole="header">Title</Text>
    </View>
  );

  assert.equal(view.queryByRole('image'), null);
  assert.equal(view.queryByLabelText('Decoration'), null);
  const hidden = view.getByRole('image', { includeHidden: true });
  assert.equal(isHiddenFromAccessibility(hidden), true);
  assert.equal(isHiddenFromAccessibility(view.getByRole('header', { name: 'Title' })), false);
});

test('press runs pressIn, press and pressOut, and a disabled touchable gets none of them', async () => {
  const events: string[] = [];
  const handlers = {
    onPressIn: () => events.push('in'),
    onPress: () => events.push('press'),
    onPressOut: () => events.push('out'),
  };
  const view = await harness.render(
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Live" {...handlers}>
        <Text>Live</Text>
      </Pressable>
      <TouchableOpacity accessibilityLabel="Off" disabled {...handlers} />
      <TouchableOpacity
        accessibilityLabel="State off"
        accessibilityState={{ disabled: true }}
        {...handlers}
      />
    </View>
  );

  await view.press(view.getByText('Live'));
  await view.press(view.getByLabelText('Off'));
  await view.press(view.getByLabelText('State off'));
  assert.deepEqual(events, ['in', 'press', 'out']);
});

test('Pressable resolves function children and styles with the resting state', async () => {
  const view = await harness.render(
    <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      {({ pressed }) => <Text>{pressed ? 'down' : 'up'}</Text>}
    </Pressable>
  );

  assert.ok(view.getByText('up'));
  assert.deepEqual(view.queryAllByType('Pressable')[0].props.style, { opacity: 1 });
});

test('FlatList renders every item with separators, or its empty slot', async () => {
  const Separator = () => <View testID="separator" />;
  const list = (data: string[]) => (
    <FlatList
      data={data}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={<Text>Header</Text>}
      ListEmptyComponent={<Text>Empty</Text>}
    />
  );

  const filled = await harness.render(list(['a', 'b', 'c']));
  assert.deepEqual(
    filled.queryAllByType('Text').map((node) => node.props.children),
    ['Header', 'a', 'b', 'c']
  );
  assert.equal(filled.queryAllByType('View').length, 2);

  const empty = await harness.render(list([]));
  assert.ok(empty.getByText('Empty'));
});

test('a hidden Modal renders nothing, and rerender shows it', async () => {
  const sheet = (visible: boolean) => (
    <Modal visible={visible}>
      <Text>Inside</Text>
    </Modal>
  );
  const view = await harness.render(sheet(false));
  assert.equal(view.queryByText('Inside'), null);

  await view.rerender(sheet(true));
  assert.ok(view.getByText('Inside'));
});

test('state updates from handlers and effects are flushed before assertions', async () => {
  function Counter() {
    const [count, setCount] = useState(0);
    const [ready, setReady] = useState(false);
    useEffect(() => {
      void Promise.resolve().then(() => setReady(true));
    }, []);
    return (
      <View>
        <Text>{ready ? 'ready' : 'loading'}</Text>
        <TextInput accessibilityLabel="Name" onChangeText={() => setCount((value) => value + 1)} />
        <Text>{`typed ${count}`}</Text>
      </View>
    );
  }
  const view = await harness.render(<Counter />);

  assert.ok(view.getByText('ready'));
  await view.changeText(view.getByLabelText('Name'), 'Ruth');
  assert.ok(view.getByText('typed 1'));
});

test('components translate with the real English locale', async () => {
  function Close() {
    const { t } = useTranslation();
    return <Text>{t('interface.close')}</Text>;
  }
  const view = await harness.render(<Close />);

  assert.ok(view.getByText('Close'));
});

test('within scopes queries to one subtree', async () => {
  const view = await harness.render(
    <View>
      <View testID="first">
        <Text>Row</Text>
      </View>
      <View testID="second">
        <Text>Row</Text>
      </View>
    </View>
  );

  assert.equal(view.getAllByText('Row').length, 2);
  assert.ok(within(view.getByTestId('second')).getByText('Row'));
});

test('the Android platform and hardware back button are driven from the harness', async () => {
  const { Platform } = harness.rn;
  assert.equal(Platform.OS, 'android');

  let handled = 0;
  const subscription = harness.rn.BackHandler.addEventListener('hardwareBackPress', () => {
    handled += 1;
    return true;
  });
  assert.equal(harness.rn.BackHandler.press(), true);
  subscription.remove();
  assert.equal(harness.rn.BackHandler.press(), false);
  assert.equal(handled, 1);
});

test('an assertion that fails on a found element reports promptly', { timeout: 5000 }, async () => {
  const view = await harness.render(
    <View>
      <Text accessibilityRole="header">Plans</Text>
    </View>
  );

  // Printing the element must not walk the whole React tree behind it.
  assert.throws(() => assert.equal(view.getByRole('header'), null), assert.AssertionError);
});

test('a reanimated list renders its items and its scroll handler runs the onScroll worklet', async () => {
  const reanimated = await import('react-native-reanimated');
  const offsets: number[] = [];
  function List() {
    const onScroll = reanimated.useAnimatedScrollHandler({
      onScroll: (event) => {
        offsets.push(event.contentOffset.y);
      },
    });
    return (
      <reanimated.default.FlatList
        data={['a', 'b']}
        renderItem={({ item }: { item: string }) => <Text>{item}</Text>}
        onScroll={onScroll}
      />
    );
  }
  const view = await harness.render(<List />);

  assert.ok(view.getByText('b'));
  await view.fire(view.queryAllByType('FlatList')[0], 'onScroll', {
    nativeEvent: { contentOffset: { x: 0, y: 120 } },
  });
  assert.deepEqual(offsets, [120]);
});

test('gesture builders chain any configuration', async () => {
  const { Gesture } = await import('react-native-gesture-handler');

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onEnd(() => {});
  assert.equal((pan as unknown as { __gesture: string }).__gesture, 'Pan');
});

test('imperative ref calls are recorded against their host element', async () => {
  function Jumper() {
    const ref = useRef<{ scrollToOffset: (options: unknown) => void } | null>(null);
    useEffect(() => {
      ref.current?.scrollToOffset({ offset: 40, animated: false });
    }, []);
    return <FlatList ref={ref as never} data={[]} renderItem={() => null} />;
  }
  await harness.render(<Jumper />);

  assert.deepEqual(
    harness.refCalls.map(({ type, method, args }) => ({ type, method, args })),
    [{ type: 'FlatList', method: 'scrollToOffset', args: [{ offset: 40, animated: false }] }]
  );
  assert.deepEqual(harness.refCalls[0].props.data, [], 'the call carries the host props');
});
