/* global require, module */

const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const LEGACY_SPLASH_ASSET_NAME = 'SplashScreenLegacy';
const BRANDED_SPLASH_ASSET_NAME = 'SplashScreenBrand';
const DEFAULT_LAUNCH_STORYBOARD_NAME = 'SplashScreen';
const BRANDED_LAUNCH_STORYBOARD_NAME = 'EveryBibleLaunchScreen';

const rewriteSplashStoryboardAssetName = (contents) =>
  contents.replaceAll(LEGACY_SPLASH_ASSET_NAME, BRANDED_SPLASH_ASSET_NAME);

const rewriteLaunchStoryboardFilename = (contents) =>
  contents.replaceAll(
    `${DEFAULT_LAUNCH_STORYBOARD_NAME}.storyboard`,
    `${BRANDED_LAUNCH_STORYBOARD_NAME}.storyboard`
  );

const applyLaunchStoryboardName = (infoPlist) => ({
  ...infoPlist,
  UILaunchStoryboardName: BRANDED_LAUNCH_STORYBOARD_NAME,
});

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
  const rewrittenProjectFile = rewriteLaunchStoryboardFilename(projectFile);
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
    nextConfig.modResults = applyLaunchStoryboardName(nextConfig.modResults);
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

      return nextConfig;
    },
  ]);

module.exports = withBrandedSplashAsset;
module.exports.BRANDED_SPLASH_ASSET_NAME = BRANDED_SPLASH_ASSET_NAME;
module.exports.BRANDED_LAUNCH_STORYBOARD_NAME = BRANDED_LAUNCH_STORYBOARD_NAME;
module.exports.rewriteSplashStoryboardAssetName = rewriteSplashStoryboardAssetName;
module.exports.rewriteLaunchStoryboardFilename = rewriteLaunchStoryboardFilename;
module.exports.applyLaunchStoryboardName = applyLaunchStoryboardName;
