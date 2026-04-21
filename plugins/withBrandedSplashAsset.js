/* global require, module, __dirname */

const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const LEGACY_SPLASH_ASSET_NAME = 'SplashScreenLegacy';
const BRANDED_SPLASH_ASSET_NAME = 'SplashScreenBrand';
const DEFAULT_LAUNCH_STORYBOARD_NAME = 'SplashScreen';
const BRANDED_LAUNCH_STORYBOARD_NAME = 'EveryBibleLaunchScreen';
const DISCREET_APP_ICON_NAME = 'DiscreetAppIcon';
const ANDROID_DISCREET_APP_LABEL_NAME = 'app_name_discreet';
const ANDROID_DISCREET_APP_LABEL = 'Calculator';
const ANDROID_PRIVACY_MODULE_NAME = 'EveryBiblePrivacyModule';
const ANDROID_PRIVACY_PACKAGE_NAME = 'EveryBiblePrivacyPackage';
const ANDROID_ICON_SPECS = [
  { density: 'mdpi' },
  { density: 'hdpi' },
  { density: 'xhdpi' },
  { density: 'xxhdpi' },
  { density: 'xxxhdpi' },
];
const DISCREET_APP_ICON_SPECS = [
  { filename: `${DISCREET_APP_ICON_NAME}-60x60@2x.png`, idiom: 'iphone', size: '60x60', scale: '2x' },
  { filename: `${DISCREET_APP_ICON_NAME}-60x60@3x.png`, idiom: 'iphone', size: '60x60', scale: '3x' },
  { filename: `${DISCREET_APP_ICON_NAME}-76x76@1x.png`, idiom: 'ipad', size: '76x76', scale: '1x' },
  { filename: `${DISCREET_APP_ICON_NAME}-76x76@2x.png`, idiom: 'ipad', size: '76x76', scale: '2x' },
  {
    filename: `${DISCREET_APP_ICON_NAME}-83.5x83.5@2x.png`,
    idiom: 'ipad',
    size: '83.5x83.5',
    scale: '2x',
  },
  {
    filename: `${DISCREET_APP_ICON_NAME}-1024x1024@1x.png`,
    idiom: 'ios-marketing',
    size: '1024x1024',
    scale: '1x',
  },
];
const DISCREET_APP_ICON_CONTENTS = {
  images: DISCREET_APP_ICON_SPECS.map((spec) => ({
    filename: spec.filename,
    idiom: spec.idiom,
    size: spec.size,
    scale: spec.scale,
  })),
  info: {
    version: 1,
    author: 'codex',
  },
};

const rewriteSplashStoryboardAssetName = (contents) =>
  contents.replaceAll(LEGACY_SPLASH_ASSET_NAME, BRANDED_SPLASH_ASSET_NAME);

const rewriteLaunchStoryboardFilename = (contents) =>
  contents.replaceAll(
    `${DEFAULT_LAUNCH_STORYBOARD_NAME}.storyboard`,
    `${BRANDED_LAUNCH_STORYBOARD_NAME}.storyboard`
  );

const applyAlternateAppIconBuildSetting = (projectFile) =>
  projectFile.replaceAll(
    /(\bASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n)(?!\s*ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = DiscreetAppIcon;)/g,
    `$1\t\t\t\tASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ${DISCREET_APP_ICON_NAME};\n`
  );

const applyLaunchStoryboardName = (infoPlist) => ({
  ...infoPlist,
  UILaunchStoryboardName: BRANDED_LAUNCH_STORYBOARD_NAME,
});

const applyAlternateAppIconInfoPlist = (infoPlist) => infoPlist;

const getAndroidPrivacyModuleSource = (packageName) => `package ${packageName}

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ${ANDROID_PRIVACY_MODULE_NAME}(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val defaultAlias by lazy {
    ComponentName(reactApplicationContext.packageName, "\${reactApplicationContext.packageName}.DefaultLauncherAlias")
  }

  private val discreetAlias by lazy {
    ComponentName(reactApplicationContext.packageName, "\${reactApplicationContext.packageName}.DiscreetLauncherAlias")
  }

  override fun getName(): String = "${ANDROID_PRIVACY_MODULE_NAME}"

  @ReactMethod
  fun getCurrentAppIcon(promise: Promise) {
    val packageManager = reactApplicationContext.packageManager
    val discreetEnabled = packageManager.getComponentEnabledSetting(discreetAlias) ==
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED

    promise.resolve(if (discreetEnabled) "discreet" else "standard")
  }

  @ReactMethod
  fun setAppIcon(mode: String, promise: Promise) {
    val enableDiscreet = mode == "discreet"

    try {
      if (enableDiscreet) {
        setLauncherAliasEnabled(discreetAlias, true)
        setLauncherAliasEnabled(defaultAlias, false)
      } else {
        setLauncherAliasEnabled(defaultAlias, true)
        setLauncherAliasEnabled(discreetAlias, false)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ICON_CHANGE_FAILED", "Unable to change the Android app icon.", error)
    }
  }

  private fun setLauncherAliasEnabled(componentName: ComponentName, enabled: Boolean) {
    reactApplicationContext.packageManager.setComponentEnabledSetting(
      componentName,
      if (enabled) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      } else {
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED
      },
      PackageManager.DONT_KILL_APP
    )
  }
}
`;

const getAndroidPrivacyPackageSource = (packageName) => `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ${ANDROID_PRIVACY_PACKAGE_NAME} : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(${ANDROID_PRIVACY_MODULE_NAME}(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

const removeMainLauncherIntentFilters = (activityBody) =>
  activityBody.replace(
    /\n?\s*<intent-filter>[\s\S]*?android\.intent\.action\.MAIN[\s\S]*?android\.intent\.category\.LAUNCHER[\s\S]*?<\/intent-filter>/g,
    ''
  );

const ensureAndroidLauncherAliases = (manifest) => {
  let nextManifest = manifest.replace(
    /(<activity\b(?=[^>]*android:name="\.MainActivity")[\s\S]*?>)([\s\S]*?)(<\/activity>)/,
    (_match, openTag, body, closeTag) =>
      `${openTag}${removeMainLauncherIntentFilters(body)}${closeTag}`
  );

  const aliases = `
    <activity-alias android:name=".DefaultLauncherAlias" android:enabled="true" android:exported="true" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" android:label="@string/app_name" android:targetActivity=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>
    <activity-alias android:name=".DiscreetLauncherAlias" android:enabled="false" android:exported="true" android:icon="@mipmap/ic_launcher_discreet" android:roundIcon="@mipmap/ic_launcher_discreet_round" android:label="@string/${ANDROID_DISCREET_APP_LABEL_NAME}" android:targetActivity=".MainActivity">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity-alias>`;

  if (!nextManifest.includes('android:name=".DefaultLauncherAlias"')) {
    nextManifest = nextManifest.replace(
      /(<activity\b(?=[^>]*android:name="\.MainActivity")[\s\S]*?<\/activity>)/,
      `$1${aliases}`
    );
  }

  nextManifest = nextManifest.replace(
    /(<activity-alias\b(?=[^>]*android:name="\.DefaultLauncherAlias")[^>]*android:label=")[^"]+(")/,
    '$1@string/app_name$2'
  );
  nextManifest = nextManifest.replace(
    /(<activity-alias\b(?=[^>]*android:name="\.DiscreetLauncherAlias")[^>]*android:label=")[^"]+(")/,
    `$1@string/${ANDROID_DISCREET_APP_LABEL_NAME}$2`
  );

  return nextManifest;
};

const ensureAndroidDiscreetLabelString = (stringsXml) => {
  const discreetLabelString = `<string name="${ANDROID_DISCREET_APP_LABEL_NAME}">${ANDROID_DISCREET_APP_LABEL}</string>`;

  if (stringsXml.includes(`name="${ANDROID_DISCREET_APP_LABEL_NAME}"`)) {
    return stringsXml.replace(
      new RegExp(`<string name="${ANDROID_DISCREET_APP_LABEL_NAME}">[^<]*<\\/string>`),
      discreetLabelString
    );
  }

  return stringsXml.replace(
    /(<string name="app_name">[^<]*<\/string>)/,
    `$1\n  ${discreetLabelString}`
  );
};

const ensureAndroidPrivacyPackageRegistration = (mainApplicationSource) => {
  if (mainApplicationSource.includes(`${ANDROID_PRIVACY_PACKAGE_NAME}()`)) {
    return mainApplicationSource;
  }

  return mainApplicationSource.replace(
    /(PackageList\(this\)\.packages\.apply\s*\{)/,
    `$1\n              add(${ANDROID_PRIVACY_PACKAGE_NAME}())`
  );
};

const ensureDiscreetAppIconAssets = async (iosRoot, projectName) => {
  const discreetIconSetPath = path.join(
    iosRoot,
    projectName,
    'Images.xcassets',
    `${DISCREET_APP_ICON_NAME}.appiconset`
  );
  const sourceDiscreetIconRoot = path.join(__dirname, '..', 'assets', 'discreet-icons', 'ios');

  await fs.mkdir(discreetIconSetPath, { recursive: true });

  for (const spec of DISCREET_APP_ICON_SPECS) {
    await fs.copyFile(
      path.join(sourceDiscreetIconRoot, spec.filename),
      path.join(discreetIconSetPath, spec.filename)
    );
  }

  await fs.writeFile(
    path.join(discreetIconSetPath, 'Contents.json'),
    JSON.stringify(DISCREET_APP_ICON_CONTENTS, null, 2)
  );
};

const ensureAndroidDiscreetIconAssets = async (androidRoot) => {
  const sourceIconPath = path.join(__dirname, '..', 'assets', 'icon-discreet.png');
  const resRoot = path.join(androidRoot, 'app', 'src', 'main', 'res');

  for (const spec of ANDROID_ICON_SPECS) {
    const targetRoot = path.join(resRoot, `mipmap-${spec.density}`);
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.copyFile(sourceIconPath, path.join(targetRoot, 'ic_launcher_discreet.png'));
    await fs.copyFile(sourceIconPath, path.join(targetRoot, 'ic_launcher_discreet_round.png'));
  }
};

const ensureAndroidPrivacyLauncher = async (androidRoot, packageName) => {
  const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
  const stringsPath = path.join(androidRoot, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  const javaRoot = path.join(androidRoot, 'app', 'src', 'main', 'java', ...packageName.split('.'));
  const modulePath = path.join(javaRoot, `${ANDROID_PRIVACY_MODULE_NAME}.kt`);
  const packagePath = path.join(javaRoot, `${ANDROID_PRIVACY_PACKAGE_NAME}.kt`);
  const mainApplicationPath = path.join(javaRoot, 'MainApplication.kt');

  const manifest = await fs.readFile(manifestPath, 'utf8');
  const stringsXml = await fs.readFile(stringsPath, 'utf8');
  const mainApplicationSource = await fs.readFile(mainApplicationPath, 'utf8');

  const nextManifest = ensureAndroidLauncherAliases(manifest);
  if (nextManifest !== manifest) {
    await fs.writeFile(manifestPath, nextManifest);
  }

  const nextStringsXml = ensureAndroidDiscreetLabelString(stringsXml);
  if (nextStringsXml !== stringsXml) {
    await fs.writeFile(stringsPath, nextStringsXml);
  }

  await fs.mkdir(javaRoot, { recursive: true });
  await fs.writeFile(modulePath, getAndroidPrivacyModuleSource(packageName));
  await fs.writeFile(packagePath, getAndroidPrivacyPackageSource(packageName));

  const nextMainApplicationSource = ensureAndroidPrivacyPackageRegistration(mainApplicationSource);
  if (nextMainApplicationSource !== mainApplicationSource) {
    await fs.writeFile(mainApplicationPath, nextMainApplicationSource);
  }

  await ensureAndroidDiscreetIconAssets(androidRoot);
};

const ensureBrandedLaunchStoryboard = async (iosRoot, projectName) => {
  const projectFilePath = path.join(iosRoot, `${projectName}.xcodeproj`, 'project.pbxproj');
  const legacyStoryboardPath = path.join(
    iosRoot,
    projectName,
    `${DEFAULT_LAUNCH_STORYBOARD_NAME}.storyboard`
  );
  const brandedStoryboardPath = path.join(
    iosRoot,
    projectName,
    `${BRANDED_LAUNCH_STORYBOARD_NAME}.storyboard`
  );

  try {
    await fs.access(legacyStoryboardPath);

    try {
      await fs.access(brandedStoryboardPath);
      await fs.rm(legacyStoryboardPath, { force: true });
    } catch {
      await fs.rename(legacyStoryboardPath, brandedStoryboardPath);
    }
  } catch {
    // Already renamed or not yet generated.
  }

  const projectFile = await fs.readFile(projectFilePath, 'utf8');
  const rewrittenProjectFile = applyAlternateAppIconBuildSetting(
    rewriteLaunchStoryboardFilename(projectFile)
  );
  if (rewrittenProjectFile !== projectFile) {
    await fs.writeFile(projectFilePath, rewrittenProjectFile);
  }
};

const ensureBrandedSplashAsset = async (iosRoot, projectName) => {
  const brandedStoryboardPath = path.join(
    iosRoot,
    projectName,
    `${BRANDED_LAUNCH_STORYBOARD_NAME}.storyboard`
  );
  const legacyStoryboardPath = path.join(
    iosRoot,
    projectName,
    `${DEFAULT_LAUNCH_STORYBOARD_NAME}.storyboard`
  );
  const imagesRoot = path.join(iosRoot, projectName, 'Images.xcassets');
  const legacyImagesetPath = path.join(imagesRoot, `${LEGACY_SPLASH_ASSET_NAME}.imageset`);
  const brandedImagesetPath = path.join(imagesRoot, `${BRANDED_SPLASH_ASSET_NAME}.imageset`);
  let storyboardPath = brandedStoryboardPath;

  try {
    await fs.access(storyboardPath);
  } catch {
    storyboardPath = legacyStoryboardPath;
  }

  const storyboard = await fs.readFile(storyboardPath, 'utf8');
  const rewrittenStoryboard = rewriteSplashStoryboardAssetName(storyboard);
  if (rewrittenStoryboard !== storyboard) {
    await fs.writeFile(storyboardPath, rewrittenStoryboard);
  }

  try {
    await fs.access(legacyImagesetPath);

    try {
      await fs.access(brandedImagesetPath);
      await fs.rm(legacyImagesetPath, { recursive: true, force: true });
    } catch {
      await fs.rename(legacyImagesetPath, brandedImagesetPath);
    }
  } catch {
    // Already branded or not yet generated.
  }
};

const withBrandedLaunchInfoPlist = (config) =>
  withInfoPlist(config, (nextConfig) => {
    nextConfig.modResults = applyAlternateAppIconInfoPlist(
      applyLaunchStoryboardName(nextConfig.modResults)
    );
    return nextConfig;
  });

const withAndroidPrivacyLauncher = (config) =>
  withDangerousMod(config, [
    'android',
    async (nextConfig) => {
      const androidRoot = nextConfig.modRequest.platformProjectRoot;
      const packageName = nextConfig.android?.package ?? 'com.everybible.app';

      await ensureAndroidPrivacyLauncher(androidRoot, packageName);

      return nextConfig;
    },
  ]);

const withBrandedSplashAsset = (config) =>
  withAndroidPrivacyLauncher(
    withDangerousMod(withBrandedLaunchInfoPlist(config), [
      'ios',
      async (nextConfig) => {
        const iosRoot = nextConfig.modRequest.platformProjectRoot;
        const projectName = nextConfig.modRequest.projectName;

        await ensureBrandedLaunchStoryboard(iosRoot, projectName);
        await ensureBrandedSplashAsset(iosRoot, projectName);
        await ensureDiscreetAppIconAssets(iosRoot, projectName);

        return nextConfig;
      },
    ])
  );

module.exports = withBrandedSplashAsset;
module.exports.BRANDED_SPLASH_ASSET_NAME = BRANDED_SPLASH_ASSET_NAME;
module.exports.BRANDED_LAUNCH_STORYBOARD_NAME = BRANDED_LAUNCH_STORYBOARD_NAME;
module.exports.DISCREET_APP_ICON_NAME = DISCREET_APP_ICON_NAME;
module.exports.rewriteSplashStoryboardAssetName = rewriteSplashStoryboardAssetName;
module.exports.rewriteLaunchStoryboardFilename = rewriteLaunchStoryboardFilename;
module.exports.applyAlternateAppIconBuildSetting = applyAlternateAppIconBuildSetting;
module.exports.applyAlternateAppIconInfoPlist = applyAlternateAppIconInfoPlist;
module.exports.ensureDiscreetAppIconAssets = ensureDiscreetAppIconAssets;
module.exports.applyLaunchStoryboardName = applyLaunchStoryboardName;
module.exports.ANDROID_DISCREET_APP_LABEL_NAME = ANDROID_DISCREET_APP_LABEL_NAME;
module.exports.ANDROID_DISCREET_APP_LABEL = ANDROID_DISCREET_APP_LABEL;
module.exports.ensureAndroidLauncherAliases = ensureAndroidLauncherAliases;
module.exports.ensureAndroidDiscreetLabelString = ensureAndroidDiscreetLabelString;
module.exports.ensureAndroidPrivacyPackageRegistration = ensureAndroidPrivacyPackageRegistration;
module.exports.getAndroidPrivacyModuleSource = getAndroidPrivacyModuleSource;
module.exports.getAndroidPrivacyPackageSource = getAndroidPrivacyPackageSource;
module.exports.ensureAndroidPrivacyLauncher = ensureAndroidPrivacyLauncher;
