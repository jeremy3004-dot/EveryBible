// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add WebP support for book icons
// WebP should already be in assetExts by default in newer Expo versions,
// but we ensure it's present
if (!config.resolver.assetExts.includes('webp')) {
  config.resolver.assetExts.push('webp');
}

module.exports = config;
