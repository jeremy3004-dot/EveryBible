import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness } from '../../testing/render';
import { mockModule } from '../../testing/mockModules';

const harness = installRenderHarness(mock);
// constants/index.ts reaches expo-constants through the runtime-config reader.
mockModule(mock, 'expo-constants', { default: { expoConfig: { extra: {} } } });

const t = (key: string, options?: Record<string, unknown>) => harness.i18n.t(key, options);

afterEach(() => {
  harness.rn.__recorded.openedUrls.length = 0;
});

async function renderAbout() {
  const { AboutScreen } = await import('./AboutScreen');
  return harness.render(<AboutScreen />);
}

test('the resources section links to the EveryBible website, support inbox, privacy and terms pages', async () => {
  const view = await renderAbout();

  assert.ok(view.getByText(t('about.resources')));
  const links = view.getAllByRole('link');
  assert.equal(links.length, 4);

  // The website and support rows show readable labels, never a raw translation key.
  await view.press(view.getByRole('link', { name: 'everybible.app' }));
  await view.press(view.getByRole('link', { name: 'hello@everybible.app' }));
  await view.press(view.getByRole('link', { name: t('about.privacyPolicy') }));
  await view.press(view.getByRole('link', { name: t('about.termsOfService') }));

  assert.deepEqual(harness.rn.__recorded.openedUrls, [
    'https://everybible.app',
    'mailto:hello@everybible.app',
    'https://everybible.app/privacy',
    'https://everybible.app/terms',
  ]);
});

test('the links go through the canonical EveryBible link constants', async () => {
  const links = await import('../../constants/links');
  const view = await renderAbout();

  for (const link of view.getAllByRole('link')) {
    await view.press(link);
  }
  assert.deepEqual(harness.rn.__recorded.openedUrls, [
    links.EVERYBIBLE_SITE_URL,
    links.EVERYBIBLE_SUPPORT_EMAIL_URL,
    links.EVERYBIBLE_PRIVACY_URL,
    links.EVERYBIBLE_TERMS_URL,
  ]);
  assert.ok(view.getByText(links.EVERYBIBLE_SUPPORT_EMAIL));
});

test('no About link points at the retired GitHub pages, the Berean site or the old support address', async () => {
  const view = await renderAbout();

  for (const link of view.getAllByRole('link')) {
    await view.press(link);
  }
  for (const url of harness.rn.__recorded.openedUrls) {
    assert.doesNotMatch(url, /github\.io|berean\.bible|support@everybible\.app/);
  }
  assert.equal(view.queryByText(/support@everybible\.app/), null);
  assert.equal(view.queryByText(/Berean/), null, 'the Berean Standard Bible card is gone');
  assert.equal(view.queryByText(t('about.bereanBible')), null);
  assert.equal(
    view.queryByText(t('about.bibleTranslation')),
    null,
    'the Bible translation section heading is gone'
  );
});

test('the About header shows the real app icon as decoration, the app name, version and footer line', async () => {
  const { config } = await import('../../constants');
  const view = await renderAbout();

  assert.ok(view.getByRole('header', { name: t('about.title') }));
  const [icon] = view.queryAllByType('Image');
  assert.ok(icon, 'the app icon renders as an image, not a generic glyph');
  assert.match(
    String((icon.props.source as { testUri?: string }).testUri),
    /\/assets\/icon\.png$/,
    'the image is the actual EveryBible app icon'
  );
  assert.equal(icon.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(
    view.queryAllByType('Icon').some((glyph) => glyph.props.name === 'book'),
    false,
    'the generic book glyph no longer stands in for the app icon'
  );
  assert.ok(view.getByText(config.appName));
  assert.ok(view.getByText(t('about.version', { version: config.version })));
  assert.ok(view.getByText(t('about.madeWithLove')));
});

test('the back button returns to the previous screen', async () => {
  const view = await renderAbout();

  await view.press(view.getByRole('button', { name: t('common.back') }));
  assert.deepEqual(
    harness.navigation.calls.map((call) => call.method),
    ['goBack']
  );
});

// A phone with no mail app (or no browser) rejects the open. The tap used to do nothing
// and leave an unhandled rejection; the reader needs the address to write to support.
test('when no app can open a link, the reader is shown where it points instead of nothing happening', async (context) => {
  const realOpenURL = harness.rn.Linking.openURL;
  harness.rn.Linking.openURL = async (url: string) => {
    throw new Error(`Could not open URL '${url}': No Activity found to handle Intent`);
  };
  context.after(() => {
    harness.rn.Linking.openURL = realOpenURL;
  });
  const view = await renderAbout();

  await view.press(view.getByRole('link', { name: 'hello@everybible.app' }));
  await view.press(view.getByRole('link', { name: t('about.privacyPolicy') }));
  await view.flush();

  assert.deepEqual(
    harness.rn.__recorded.alerts.map(({ title, message }) => ({ title, message })),
    [
      { title: t('common.somethingWentWrong'), message: 'hello@everybible.app' },
      { title: t('common.somethingWentWrong'), message: 'https://everybible.app/privacy' },
    ]
  );
});
