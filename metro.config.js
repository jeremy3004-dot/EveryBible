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

module.exports = config;
