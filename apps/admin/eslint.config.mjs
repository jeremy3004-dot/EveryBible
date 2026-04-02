import next from '@next/eslint-plugin-next';
import rootConfig from '../../eslint.config.js';

export default [
  {
    files: ['eslint.config.mjs'],
    plugins: {
      '@next/next': next,
    },
    settings: {
      next: {
        rootDir: '.',
      },
    },
  },
  ...rootConfig,
];
