// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// During local development this workspace is a git worktree of /Users/dev/Projects/EveryBible,
// so Metro can follow the base checkout for shared node_modules.
// In EAS local build archives that base checkout does not exist, so keep Metro self-contained.
const baseProjectRoot = path.resolve(__dirname, '../../../../Projects/EveryBible');

if (fs.existsSync(baseProjectRoot)) {
  config.watchFolders = [
    ...(config.watchFolders || []),
    baseProjectRoot,
  ];

  config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths || []),
    path.join(baseProjectRoot, 'node_modules'),
  ];
}

// Add WebP support for book icons
// WebP should already be in assetExts by default in newer Expo versions,
// but we ensure it's present
if (!config.resolver.assetExts.includes('webp')) {
  config.resolver.assetExts.push('webp');
}

module.exports = config;
