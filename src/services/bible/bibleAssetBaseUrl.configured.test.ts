import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';

// The asset base comes from the runtime config module, so a configured build is its own
// mock configuration and therefore its own file (see docs/testing.md).
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_BIBLE_ASSET_BASE_URL: '  https://cdn.example.test/assets/  ',
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  },
});

const loadModule = () => import('./bibleAssetBaseUrl');

test('a configured asset base url replaces the EveryBible media default', async () => {
  const { getBibleAssetBaseUrl } = await loadModule();

  assert.equal(getBibleAssetBaseUrl(), 'https://cdn.example.test/assets');
});

test('relative asset paths resolve against the configured base url by default', async () => {
  const { resolveBibleAssetUrl, resolveBibleAssetBaseUrl } = await loadModule();

  assert.equal(
    resolveBibleAssetUrl('/text/bsb.sqlite'),
    'https://cdn.example.test/assets/text/bsb.sqlite'
  );
  assert.equal(
    resolveBibleAssetBaseUrl('timing/bsb/'),
    'https://cdn.example.test/assets/timing/bsb'
  );
});

test('audio assets live under the configured base url', async () => {
  const { getBibleAudioAssetBaseUrl } = await loadModule();

  assert.equal(getBibleAudioAssetBaseUrl(), 'https://cdn.example.test/assets/audio');
});
