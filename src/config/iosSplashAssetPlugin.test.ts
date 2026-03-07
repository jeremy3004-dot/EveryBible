import test from 'node:test';
import assert from 'node:assert/strict';
import splashPlugin from '../../plugins/withBrandedSplashAsset';

const pluginExports = splashPlugin as unknown as {
  BRANDED_SPLASH_ASSET_NAME: string;
  BRANDED_LAUNCH_STORYBOARD_NAME: string;
  rewriteSplashStoryboardAssetName: (contents: string) => string;
  rewriteLaunchStoryboardFilename: (contents: string) => string;
  applyLaunchStoryboardName: (infoPlist: Record<string, string>) => Record<string, string>;
};
const {
  BRANDED_SPLASH_ASSET_NAME,
  BRANDED_LAUNCH_STORYBOARD_NAME,
  rewriteSplashStoryboardAssetName,
  rewriteLaunchStoryboardFilename,
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
