/* global require, module */

// The small icon on the Android "Now playing" notification (status bar, lock screen,
// notification shade) comes from expo-media-control's MediaPlaybackService. It reads
// one icon name from the manifest meta-data below; without it the service falls
// through its list of standard names to `notification_icon`, the reminder icon
// expo-notifications generates (then the book-and-cross glyph, now a bell; see
// src/config/notificationIconConfig.test.ts). That glyph sat in the status bar for
// every chapter, discreet mode included.
//
// The service resolves the icon once per notification from static resources, and
// JS has no option to change it, so it cannot switch with discreet mode without a
// native change. It is therefore neutral for everyone: an audio-level glyph that
// says "audio is playing" and nothing about what. The notification header still
// shows the app label ("Every Bible"); Android draws that from the application
// label and offers no per-notification override to ordinary apps.
//
// Reminder and push notifications use expo-notifications' single icon, which is a
// neutral bell for everyone for the same reason (app.json).

const fs = require('fs/promises');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const MEDIA_NOTIFICATION_ICON_NAME = 'media_notification_icon';
const MEDIA_NOTIFICATION_ICON_META_DATA = 'expo.modules.mediacontrol.NOTIFICATION_ICON';

// Material "graphic_eq" (Apache 2.0): level bars, white on transparent.
const MEDIA_NOTIFICATION_ICON_XML = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="@android:color/white"
        android:pathData="M7,18h2V6H7v12zM11,22h2V2h-2v20zM3,14h2v-4H3v4zM15,18h2V6h-2v12zM19,10v4h2v-4h-2z"/>
</vector>
`;

// expo-media-control looks the icon up with getIdentifier(name) at runtime, which the
// release resource shrinker cannot trace, so the drawable is kept explicitly.
const MEDIA_NOTIFICATION_ICON_KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@drawable/${MEDIA_NOTIFICATION_ICON_NAME}" />
`;

const applyMediaNotificationIconMetaData = (manifest) => {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    application,
    MEDIA_NOTIFICATION_ICON_META_DATA,
    MEDIA_NOTIFICATION_ICON_NAME
  );
  return manifest;
};

const writeMediaNotificationIconResources = async (androidRoot) => {
  const resRoot = path.join(androidRoot, 'app', 'src', 'main', 'res');
  const drawableRoot = path.join(resRoot, 'drawable');
  const rawRoot = path.join(resRoot, 'raw');

  await fs.mkdir(drawableRoot, { recursive: true });
  await fs.mkdir(rawRoot, { recursive: true });
  await fs.writeFile(
    path.join(drawableRoot, `${MEDIA_NOTIFICATION_ICON_NAME}.xml`),
    MEDIA_NOTIFICATION_ICON_XML
  );
  await fs.writeFile(
    path.join(rawRoot, `${MEDIA_NOTIFICATION_ICON_NAME}_keep.xml`),
    MEDIA_NOTIFICATION_ICON_KEEP_XML
  );
};

const withMediaNotificationIcon = (config) =>
  withDangerousMod(
    withAndroidManifest(config, (nextConfig) => {
      nextConfig.modResults = applyMediaNotificationIconMetaData(nextConfig.modResults);
      return nextConfig;
    }),
    [
      'android',
      async (nextConfig) => {
        await writeMediaNotificationIconResources(nextConfig.modRequest.platformProjectRoot);
        return nextConfig;
      },
    ]
  );

module.exports = withMediaNotificationIcon;
module.exports.MEDIA_NOTIFICATION_ICON_NAME = MEDIA_NOTIFICATION_ICON_NAME;
module.exports.MEDIA_NOTIFICATION_ICON_META_DATA = MEDIA_NOTIFICATION_ICON_META_DATA;
module.exports.applyMediaNotificationIconMetaData = applyMediaNotificationIconMetaData;
module.exports.writeMediaNotificationIconResources = writeMediaNotificationIconResources;
