/* global require, module, __dirname */

const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const LEGACY_SPLASH_ASSET_NAME = 'SplashScreenLegacy';
const BRANDED_SPLASH_ASSET_NAME = 'SplashScreenBrand';
const DEFAULT_LAUNCH_STORYBOARD_NAME = 'SplashScreen';
const BRANDED_LAUNCH_STORYBOARD_NAME = 'EveryBibleLaunchScreen';
const DISCREET_APP_ICON_NAME = 'DiscreetAppIcon';
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

const withBrandedSplashAsset = (config) =>
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
  ]);

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
