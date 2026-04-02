const js = require('@eslint/js');
const next = require('@next/eslint-plugin-next');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
      },
    },
    plugins: {
      '@next/next': next,
    },
    settings: {
      next: {
        rootDir: ['apps/admin/', 'apps/site/'],
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
  js.configs.recommended,
  {
    files: [
      'apps/admin/**/*.{js,jsx,ts,tsx,mjs}',
      'apps/site/**/*.{js,jsx,ts,tsx,mjs}',
      'app/**/*.{js,jsx,ts,tsx,mjs}',
      'components/**/*.{js,jsx,ts,tsx,mjs}',
      'lib/**/*.{js,jsx,ts,tsx,mjs}',
      'next.config.mjs',
    ],
    plugins: {
      '@next/next': next,
    },
    settings: {
      next: {
        rootDir: ['apps/admin/', 'apps/site/'],
      },
    },
    rules: {
      ...next.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        localStorage: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-undef': 'off',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  prettier,
  {
    ignores: [
      'node_modules/',
      'ios/',
      'android/',
      '.expo/',
      'dist/',
      'build/',
      'scripts/',
      'docs/plans/',
      '.eslintrc.js',
      'metro.config.js',
      'babel.config.js',
      '.claude/',
      '.gsd/',
      'apps/',
      'packages/',
      'supabase/functions/',
    ],
  },
];
