import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import splashPlugin from '../../plugins/withBrandedSplashAsset';

const pluginExports = splashPlugin as unknown as {
  BRANDED_SPLASH_ASSET_NAME: string;
  BRANDED_LAUNCH_STORYBOARD_NAME: string;
  DISCREET_APP_ICON_NAME: string;
  rewriteSplashStoryboardAssetName: (contents: string) => string;
  rewriteLaunchStoryboardFilename: (contents: string) => string;
  applyAlternateAppIconBuildSetting: (projectFile: string) => string;
  applyAlternateAppIconInfoPlist: (
    infoPlist: Record<string, unknown>
  ) => Record<string, unknown>;
  ensureDiscreetAppIconAssets: (iosRoot: string, projectName: string) => Promise<void>;
  applyLaunchStoryboardName: (infoPlist: Record<string, string>) => Record<string, string>;
};
const {
  BRANDED_SPLASH_ASSET_NAME,
  BRANDED_LAUNCH_STORYBOARD_NAME,
  DISCREET_APP_ICON_NAME,
  rewriteSplashStoryboardAssetName,
  rewriteLaunchStoryboardFilename,
  applyAlternateAppIconBuildSetting,
  applyAlternateAppIconInfoPlist,
  ensureDiscreetAppIconAssets,
  applyLaunchStoryboardName,
} = pluginExports;

test('rewrites the generated splash storyboard to a branded asset name', () => {
  const storyboard = `
    <imageView image="SplashScreenLegacy" userLabel="SplashScreenLegacy" />
    <image name="SplashScreenLegacy" width="414" height="736"/>
  `;

  const rewritten = rewriteSplashStoryboardAssetName(storyboard);

  assert.match(rewritten, new RegExp(`image="${BRANDED_SPLASH_ASSET_NAME}"`));
  assert.match(rewritten, new RegExp(`userLabel="${BRANDED_SPLASH_ASSET_NAME}"`));
  assert.match(rewritten, new RegExp(`image name="${BRANDED_SPLASH_ASSET_NAME}"`));
  assert.equal(rewritten.includes('SplashScreenLegacy'), false);
});

test('rewrites the generated launch storyboard filename to a branded name', () => {
  const projectFile = `
    path = EveryBible/SplashScreen.storyboard;
    name = SplashScreen.storyboard;
  `;

  const rewritten = rewriteLaunchStoryboardFilename(projectFile);

  assert.match(rewritten, new RegExp(`${BRANDED_LAUNCH_STORYBOARD_NAME}\\.storyboard`));
  assert.equal(rewritten.includes('SplashScreen.storyboard'), false);
});

test('applies the branded launch storyboard name to Info.plist data', () => {
  const infoPlist = {
    UILaunchStoryboardName: 'SplashScreen',
  };

  const rewritten = applyLaunchStoryboardName(infoPlist);

  assert.equal(rewritten.UILaunchStoryboardName, BRANDED_LAUNCH_STORYBOARD_NAME);
});

test('keeps alternate icon metadata out of Info.plist so iOS uses asset catalogs only', () => {
  const infoPlist = {
    CFBundleIcons: {
      CFBundlePrimaryIcon: {
        CFBundleIconFiles: ['AppIcon'],
      },
    },
    'CFBundleIcons~ipad': {
      CFBundlePrimaryIcon: {
        CFBundleIconFiles: ['AppIcon'],
      },
    },
  };

  const rewritten = applyAlternateAppIconInfoPlist(infoPlist);

  assert.deepEqual(rewritten, infoPlist);
});

test('adds the alternate app icon build setting to Xcode configs', () => {
  const projectFile = `
      buildSettings = {
        ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
        PRODUCT_BUNDLE_IDENTIFIER = com.everybible.app;
      };
      buildSettings = {
        ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
        PRODUCT_BUNDLE_IDENTIFIER = com.everybible.app;
      };
  `;

  const rewritten = applyAlternateAppIconBuildSetting(projectFile);

  assert.match(
    rewritten,
    new RegExp(
      `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\\s+ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ${DISCREET_APP_ICON_NAME};`
    )
  );
  assert.equal(
    rewritten.match(
      new RegExp(
        `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ${DISCREET_APP_ICON_NAME};`,
        'g'
      )
    )?.length,
    2
  );
});

test('recreates the discreet alternate icon asset set during prebuild', async () => {
  const iosRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'everybible-plugin-test-'));
  const projectName = 'EveryBible';
  const imagesRoot = path.join(iosRoot, projectName, 'Images.xcassets');
  const discreetIconSetPath = path.join(imagesRoot, `${DISCREET_APP_ICON_NAME}.appiconset`);

  await fs.mkdir(imagesRoot, { recursive: true });

  await ensureDiscreetAppIconAssets(iosRoot, projectName);

  const iconContents = JSON.parse(
    await fs.readFile(path.join(discreetIconSetPath, 'Contents.json'), 'utf8')
  ) as {
    images: Array<{ filename?: string; idiom: string; size: string; scale?: string }>;
  };

  const expectedIconFiles = [
    'DiscreetAppIcon-60x60@2x.png',
    'DiscreetAppIcon-60x60@3x.png',
    'DiscreetAppIcon-76x76@1x.png',
    'DiscreetAppIcon-76x76@2x.png',
    'DiscreetAppIcon-83.5x83.5@2x.png',
    'DiscreetAppIcon-1024x1024@1x.png',
  ];

  for (const filename of expectedIconFiles) {
    await fs.access(path.join(discreetIconSetPath, filename));
  }

  const listedFiles = iconContents.images
    .map((entry) => entry.filename)
    .filter((entry): entry is string => typeof entry === 'string');
  assert.deepEqual(listedFiles.sort(), [...expectedIconFiles].sort());

  await fs.rm(iosRoot, { recursive: true, force: true });
});
