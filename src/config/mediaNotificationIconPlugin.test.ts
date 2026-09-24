// Non-TypeScript artefact check: loads the Expo config plugin (plain JS) and app.json; the
// plugin's output is Android resources and manifest XML, not a TypeScript module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AndroidConfig } from 'expo/config-plugins';
import mediaIconPlugin from '../../plugins/withMediaNotificationIcon';

type AndroidManifest = Parameters<typeof AndroidConfig.Manifest.getMainApplicationOrThrow>[0];

const {
  MEDIA_NOTIFICATION_ICON_NAME,
  MEDIA_NOTIFICATION_ICON_META_DATA,
  applyMediaNotificationIconMetaData,
  writeMediaNotificationIconResources,
} = mediaIconPlugin as unknown as {
  MEDIA_NOTIFICATION_ICON_NAME: string;
  MEDIA_NOTIFICATION_ICON_META_DATA: string;
  applyMediaNotificationIconMetaData: (manifest: AndroidManifest) => AndroidManifest;
  writeMediaNotificationIconResources: (androidRoot: string) => Promise<void>;
};

const REPO_ROOT = process.cwd();

const prebuildManifest = (): AndroidManifest => ({
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    application: [{ $: { 'android:name': '.MainApplication' } }],
    queries: [],
  },
});

const metaDataValues = (manifest: AndroidManifest): Record<string, string | undefined> => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  return Object.fromEntries(
    (application['meta-data'] ?? []).map((item) => [
      item.$['android:name'],
      item.$['android:value'],
    ])
  );
};

test('app.json runs the media notification icon plugin', () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'app.json'), 'utf8')) as {
    expo: { plugins: unknown[] };
  };
  assert.ok(appJson.expo.plugins.includes('./plugins/withMediaNotificationIcon'));
});

// Without this meta-data expo-media-control falls through its list of standard names
// to `notification_icon`, the book-and-cross glyph expo-notifications generates, which
// sits in the status bar during every chapter, discreet mode included.
test('the manifest points expo-media-control at the neutral glyph, not the book icon', () => {
  assert.equal(MEDIA_NOTIFICATION_ICON_META_DATA, 'expo.modules.mediacontrol.NOTIFICATION_ICON');
  assert.notEqual(MEDIA_NOTIFICATION_ICON_NAME, 'notification_icon');

  const manifest = applyMediaNotificationIconMetaData(prebuildManifest());
  assert.equal(
    metaDataValues(manifest)[MEDIA_NOTIFICATION_ICON_META_DATA],
    MEDIA_NOTIFICATION_ICON_NAME
  );

  // Running prebuild again does not duplicate the entry.
  const again = applyMediaNotificationIconMetaData(manifest);
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(again);
  assert.equal(
    (application['meta-data'] ?? []).filter(
      (item) => item.$['android:name'] === MEDIA_NOTIFICATION_ICON_META_DATA
    ).length,
    1
  );
});

test('prebuild writes a white-only vector drawable and keeps it through resource shrinking', async () => {
  const androidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-icon-'));
  try {
    await writeMediaNotificationIconResources(androidRoot);
    const res = path.join(androidRoot, 'app/src/main/res');

    const drawable = fs.readFileSync(
      path.join(res, 'drawable', `${MEDIA_NOTIFICATION_ICON_NAME}.xml`),
      'utf8'
    );
    assert.match(drawable, /^<vector\b/);
    // Status-bar icons must be monochrome; any colour renders as a white blob.
    const colors = [...drawable.matchAll(/android:(?:fillColor|tint|strokeColor)="([^"]+)"/g)].map(
      (match) => match[1]
    );
    assert.ok(colors.length > 0);
    assert.deepEqual([...new Set(colors)], ['@android:color/white']);

    // The library finds the icon with getIdentifier(name) at runtime, which R8's resource
    // shrinker cannot see; release builds shrink resources, so keep it explicitly.
    const keep = fs.readFileSync(path.join(res, 'raw', 'media_notification_icon_keep.xml'), 'utf8');
    assert.match(keep, new RegExp(`tools:keep="@drawable/${MEDIA_NOTIFICATION_ICON_NAME}"`));
  } finally {
    fs.rmSync(androidRoot, { recursive: true, force: true });
  }
});
