import test from 'node:test';
import assert from 'node:assert/strict';
import splashPlugin from '../../plugins/withBrandedSplashAsset';

const pluginExports = splashPlugin as unknown as {
  BRANDED_SPLASH_ASSET_NAME: string;
  rewriteSplashStoryboardAssetName: (contents: string) => string;
};
const { BRANDED_SPLASH_ASSET_NAME, rewriteSplashStoryboardAssetName } = pluginExports;

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
