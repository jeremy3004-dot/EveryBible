const path = require('node:path');

const expoPackageRoot = path.dirname(require.resolve('expo/package.json'));
const expoBabelPreset = require.resolve('babel-preset-expo', {
  paths: [expoPackageRoot],
});

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [expoBabelPreset],
    // Reanimated's plugin must stay last.
    plugins: ['./plugins/babel-icon-deep-imports', 'react-native-reanimated/plugin'],
  };
};
