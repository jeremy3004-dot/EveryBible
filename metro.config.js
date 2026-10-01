// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Keep Expo's transform settings and defer unused module evaluation on the
// Android release startup path. Bare side-effect imports still run eagerly.
const getExpoTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = await getExpoTransformOptions(...args);
  return {
    ...options,
    transform: {
      ...options.transform,
      inlineRequires:
        args[1].platform === 'android' && !args[1].dev ? true : options.transform?.inlineRequires,
    },
  };
};

// Add WebP support for book icons
// WebP should already be in assetExts by default in newer Expo versions,
// but we ensure it's present
if (!config.resolver.assetExts.includes('webp')) {
  config.resolver.assetExts.push('webp');
}

// @ide/backoff (via expo-notifications) only calls `assert(condition, message)`, but
// Node's `assert` polyfill brings `util` and ~70 helper modules into the bundle.
// Other importers keep the real polyfill.
const path = require('path');
const assertShimPath = path.join(__dirname, 'src/utils/nodeAssertShim.ts');
const backoffPackage = `${path.sep}node_modules${path.sep}@ide${path.sep}backoff${path.sep}`;
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'assert' && context.originModulePath.includes(backoffPackage)) {
    return { type: 'sourceFile', filePath: assertShimPath };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
