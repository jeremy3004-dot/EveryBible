/* global require, module */

const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const LEGACY_SPLASH_ASSET_NAME = 'SplashScreenLegacy';
const BRANDED_SPLASH_ASSET_NAME = 'SplashScreenBrand';

const rewriteSplashStoryboardAssetName = (contents) =>
  contents.replaceAll(LEGACY_SPLASH_ASSET_NAME, BRANDED_SPLASH_ASSET_NAME);

const ensureBrandedSplashAsset = async (iosRoot, projectName) => {
  const storyboardPath = path.join(iosRoot, projectName, 'SplashScreen.storyboard');
  const imagesRoot = path.join(iosRoot, projectName, 'Images.xcassets');
  const legacyImagesetPath = path.join(imagesRoot, `${LEGACY_SPLASH_ASSET_NAME}.imageset`);
  const brandedImagesetPath = path.join(imagesRoot, `${BRANDED_SPLASH_ASSET_NAME}.imageset`);

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

const withBrandedSplashAsset = (config) =>
  withDangerousMod(config, [
    'ios',
    async (nextConfig) => {
      const iosRoot = nextConfig.modRequest.platformProjectRoot;
      const projectName = nextConfig.modRequest.projectName;

      await ensureBrandedSplashAsset(iosRoot, projectName);

      return nextConfig;
    },
  ]);

module.exports = withBrandedSplashAsset;
module.exports.BRANDED_SPLASH_ASSET_NAME = BRANDED_SPLASH_ASSET_NAME;
module.exports.rewriteSplashStoryboardAssetName = rewriteSplashStoryboardAssetName;
