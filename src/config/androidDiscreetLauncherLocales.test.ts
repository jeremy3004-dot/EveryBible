// Non-TypeScript artefact check: reads app.json and the generated native locale JSON, then runs
// Expo's own Android locale mod against a scratch project to see the resource files it writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AndroidConfig } from 'expo/config-plugins';
import { getResolvedLocalesAsync } from '@expo/config-plugins/build/utils/locales';
import privacyPlugin from '../../plugins/withBrandedSplashAsset';
import { SUPPORTED_LANGUAGES } from '../constants/languages';

const { ANDROID_DISCREET_APP_LABEL_NAME, ensureAndroidLauncherAliases } =
  privacyPlugin as unknown as {
    ANDROID_DISCREET_APP_LABEL_NAME: string;
    ensureAndroidLauncherAliases: (manifest: string) => string;
  };

const requireFromHere = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appLocales = (
  JSON.parse(readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')) as {
    expo: { locales: Record<string, string> };
  }
).expo.locales;

// The launcher name a phone's own calculator app shows in each interface language. In discreet
// mode an English "Calculator" beside native-language app names would stand out.
const EXPECTED_LABELS: Record<string, string> = {
  en: 'Calculator',
  zh: '计算器',
  hi: 'कैलकुलेटर',
  es: 'Calculadora',
  ar: 'الآلة الحاسبة',
  fr: 'Calculatrice',
  bn: 'ক্যালকুলেটর',
  pt: 'Calculadora',
  ru: 'Калькулятор',
  ur: 'کیلکولیٹر',
  id: 'Kalkulator',
  de: 'Rechner',
  ja: '電卓',
  pa: 'ਕੈਲਕੁਲੇਟਰ',
  mr: 'कॅल्क्युलेटर',
  te: 'కాలిక్యులేటర్',
  tr: 'Hesap Makinesi',
  ta: 'கால்குலேட்டர்',
  vi: 'Máy tính',
  ko: '계산기',
  ne: 'क्याल्कुलेटर',
};

const nativeCodeFor = (code: string) => (code === 'zh' ? 'zh-Hans' : code);

interface LauncherLocale {
  interface: { nativeLauncher: { discreetAppName: string } };
  privacy: { iconSwitchCloseToCalculator: string };
}

const loadLocale = async (code: string): Promise<LauncherLocale> => {
  const module = (await import(
    pathToFileURL(path.join(REPO_ROOT, 'src/i18n/locales', `${code}.ts`)).href
  )) as Record<string, LauncherLocale | undefined>;
  const locale = module[code];
  assert.ok(locale, `${code}.ts exports ${code}`);
  return locale;
};

test('the discreet launcher alias takes its label from a string resource', () => {
  const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity android:name=".MainActivity" android:exported="true"></activity>
  </application>
</manifest>`;
  const alias = ensureAndroidLauncherAliases(manifest).match(
    /<activity-alias android:name="\.DiscreetLauncherAlias"[^>]*>/
  )?.[0];

  assert.match(
    alias ?? '',
    new RegExp(`android:label="@string/${ANDROID_DISCREET_APP_LABEL_NAME}"`)
  );
});

test('every interface language gives Android the native calculator name for the disguise', async () => {
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map(({ code }) => code).sort(),
    Object.keys(EXPECTED_LABELS).sort()
  );
  const android = await getResolvedLocalesAsync(REPO_ROOT, appLocales, 'android');

  for (const { code } of SUPPORTED_LANGUAGES) {
    const locale = await loadLocale(code);
    assert.equal(locale.interface.nativeLauncher.discreetAppName, EXPECTED_LABELS[code], code);
    assert.deepEqual(
      android[nativeCodeFor(code)],
      { [ANDROID_DISCREET_APP_LABEL_NAME]: EXPECTED_LABELS[code] },
      `${code}: app.json locale JSON must carry the Android launcher label`
    );
  }
});

test('the Android launcher label stays out of the iOS InfoPlist strings', async () => {
  const ios = await getResolvedLocalesAsync(REPO_ROOT, appLocales, 'ios');

  for (const [nativeCode, strings] of Object.entries(ios)) {
    assert.equal(ANDROID_DISCREET_APP_LABEL_NAME in strings, false, nativeCode);
  }
});

test("Expo's Android locale mod writes a localized launcher label for every language", async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'discreet-label-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, 'android'));
  const locales = Object.fromEntries(
    Object.entries(appLocales).map(([lang, file]) => [
      lang,
      path.relative(projectRoot, path.join(REPO_ROOT, file)),
    ])
  );

  // setLocalesAsync starts each strings.xml write without awaiting it. The writes start
  // synchronously inside its loop, so recording them lets the test await every file.
  const xml = requireFromHere('@expo/config-plugins/build/utils/XML') as {
    writeXMLAsync: (options: { path: string; xml: unknown }) => Promise<void>;
  };
  const writeXMLAsync = xml.writeXMLAsync;
  const writes: Array<Promise<void>> = [];
  t.mock.method(xml, 'writeXMLAsync', (options: { path: string; xml: unknown }) => {
    const write = writeXMLAsync(options);
    writes.push(write);
    return write;
  });

  await AndroidConfig.Locales.setLocalesAsync({ locales }, { projectRoot });
  await Promise.all(writes);
  assert.equal(writes.length, SUPPORTED_LANGUAGES.length);

  for (const { code } of SUPPORTED_LANGUAGES) {
    const qualifier = `values-b+${nativeCodeFor(code).replaceAll('-', '+')}`;
    const stringsXml = fs.readFileSync(
      path.join(projectRoot, 'android/app/src/main/res', qualifier, 'strings.xml'),
      'utf8'
    );
    assert.ok(
      stringsXml.includes(
        `<string name="${ANDROID_DISCREET_APP_LABEL_NAME}">"${EXPECTED_LABELS[code]}"</string>`
      ),
      `${qualifier}/strings.xml:\n${stringsXml}`
    );
  }
});

test('the Android icon-switch warning names the icon by its localized launcher label', async () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    const locale = await loadLocale(code);
    const label = locale.interface.nativeLauncher.discreetAppName;

    assert.ok(
      locale.privacy.iconSwitchCloseToCalculator.includes(label),
      `${code}: "${locale.privacy.iconSwitchCloseToCalculator}" should mention "${label}"`
    );
  }
});
