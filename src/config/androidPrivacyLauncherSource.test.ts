import test from 'node:test';
import assert from 'node:assert/strict';
import privacyPlugin from '../../plugins/withBrandedSplashAsset';

const pluginExports = privacyPlugin as unknown as {
  ANDROID_DISCREET_APP_LABEL_NAME: string;
  ANDROID_DISCREET_APP_LABEL: string;
  ensureAndroidLauncherAliases: (manifest: string) => string;
  ensureAndroidDiscreetLabelString: (stringsXml: string) => string;
  ensureAndroidPrivacyPackageRegistration: (mainApplicationSource: string) => string;
  getAndroidPrivacyModuleSource: (packageName: string) => string;
  getAndroidPrivacyPackageSource: (packageName: string) => string;
};

const {
  ANDROID_DISCREET_APP_LABEL_NAME,
  ANDROID_DISCREET_APP_LABEL,
  ensureAndroidLauncherAliases,
  ensureAndroidDiscreetLabelString,
  ensureAndroidPrivacyPackageRegistration,
  getAndroidPrivacyModuleSource,
  getAndroidPrivacyPackageSource,
} = pluginExports;

test('Android privacy plugin moves launcher entrypoints onto aliases', () => {
  const manifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
      </intent-filter>
    </activity>
  </application>
</manifest>`;

  const rewritten = ensureAndroidLauncherAliases(manifest);

  assert.equal(
    /android\.intent\.action\.MAIN[\s\S]*?android\.intent\.category\.LAUNCHER/.test(
      rewritten.match(/<activity android:name="\.MainActivity"[\s\S]*?<\/activity>/)?.[0] ?? ''
    ),
    false,
    'MainActivity should not keep its own launcher filter once aliases own the launcher entries'
  );
  assert.match(rewritten, /android:name="\.DefaultLauncherAlias"/);
  assert.match(rewritten, /android:name="\.DiscreetLauncherAlias"/);
  assert.match(rewritten, /android:label="@string\/app_name_discreet"/);
});

test('Android discreet launcher alias uses calculator disguise label', () => {
  const strings = `
<resources>
  <string name="app_name">Every Bible</string>
</resources>`;

  const rewritten = ensureAndroidDiscreetLabelString(strings);

  assert.match(
    rewritten,
    new RegExp(
      `<string name="${ANDROID_DISCREET_APP_LABEL_NAME}">${ANDROID_DISCREET_APP_LABEL}<\\/string>`
    ),
    'The Android discreet launcher label should read as Calculator'
  );
});

test('Android privacy plugin registers the native icon-switch package', () => {
  const mainApplication = `
class MainApplication : Application(), ReactApplication {
  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
            }
      }
  )
}`;

  const rewritten = ensureAndroidPrivacyPackageRegistration(mainApplication);

  assert.match(rewritten, /add\(EveryBiblePrivacyPackage\(\)\)/);
});

test('Android privacy module switches launcher aliases in a safe order', () => {
  const source = getAndroidPrivacyModuleSource('com.everybible.app');

  assert.match(
    source,
    /if \(enableDiscreet\) \{\s*setLauncherAliasEnabled\(discreetAlias, true\)\s*setLauncherAliasEnabled\(defaultAlias, false\)/,
    'Switching to discreet mode should enable the calculator alias before disabling the default alias'
  );
  assert.match(
    source,
    /else \{\s*setLauncherAliasEnabled\(defaultAlias, true\)\s*setLauncherAliasEnabled\(discreetAlias, false\)/,
    'Switching back to standard mode should enable the default alias before disabling the calculator alias'
  );
});

test('Android privacy package exposes the native privacy module', () => {
  const source = getAndroidPrivacyPackageSource('com.everybible.app');

  assert.match(source, /class EveryBiblePrivacyPackage : ReactPackage/);
  assert.match(source, /return listOf\(EveryBiblePrivacyModule\(reactContext\)\)/);
});
