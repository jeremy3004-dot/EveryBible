#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const sourceIconPath = path.join(assetsDir, 'icon-source.png');
const generatedIconPath = path.join(assetsDir, 'icon.png');
const generatedAdaptivePath = path.join(assetsDir, 'adaptive-icon.png');
const generatedAdaptiveBackgroundPath = path.join(assetsDir, 'adaptive-background.png');
const generatedMonochromePath = path.join(assetsDir, 'monochrome-icon.png');
const generatedFaviconPath = path.join(assetsDir, 'favicon.png');
const generatedSplashPath = path.join(assetsDir, 'splash-icon.png');
const siteAppIconPath = path.join(
  projectRoot,
  'apps',
  'site',
  'public',
  'everybible',
  'app-icon.png'
);
const iosIconPath = path.join(
  projectRoot,
  'ios',
  'EveryBible',
  'Images.xcassets',
  'AppIcon.appiconset',
  'App-Icon-1024x1024@1x.png'
);
const iosNowPlayingIconPath = path.join(
  projectRoot,
  'ios',
  'EveryBible',
  'Images.xcassets',
  'NowPlayingAppIcon.imageset',
  'App-Icon-1024x1024@1x.png'
);
const iosSplashDir = path.join(
  projectRoot,
  'ios',
  'EveryBible',
  'Images.xcassets',
  'SplashScreenBrand.imageset'
);
const androidResDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
const splashBackground = '#161412';
const splashPortraitSize = { width: 1284, height: 2778 };

const launcherSizes = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const adaptiveSizes = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

const androidSplashSizes = [
  ['mdpi', 288],
  ['hdpi', 432],
  ['xhdpi', 576],
  ['xxhdpi', 864],
  ['xxxhdpi', 1152],
];

const adaptiveForegroundScale = 0.78;

// The selected square artwork contains both the launcher background and the
// ivory cross/page mark. Android adaptive icons need those as separate layers
// so the mark remains inside the launcher mask's safe area.
const adaptiveBackgroundSvg = `
<svg width="432" height="432" viewBox="0 0 432 432" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#24A5ED"/>
      <stop offset="0.42" stop-color="#0D9BE0"/>
      <stop offset="1" stop-color="#066EAD"/>
    </linearGradient>
  </defs>
  <rect width="432" height="432" fill="url(#blue)"/>
</svg>
`;

const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>`;

const ensureDirectory = async (directoryPath) => {
  await fs.mkdir(directoryPath, { recursive: true });
};

const ensureSourceIconExists = async () => {
  try {
    await fs.access(sourceIconPath);
  } catch {
    throw new Error(
      `Missing source icon at ${sourceIconPath}. Place the approved square icon there before running this script.`
    );
  }
};

const writeRasterOutput = async (outputPath, size, format) => {
  await ensureDirectory(path.dirname(outputPath));

  let pipeline = sharp(sourceIconPath)
    .resize(size, size, {
      fit: 'cover',
      position: 'center',
    })
    .flatten({ background: '#1a1410' });

  if (format === 'png') {
    pipeline = pipeline.png();
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ lossless: true });
  } else {
    throw new Error(`Unsupported raster format: ${format}`);
  }

  await pipeline.toFile(outputPath);
};

const createSelectedForegroundBuffer = async () => {
  const { data, info } = await sharp(sourceIconPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const sourceOffset = (y * info.width + x) * 4;
      const red = data[sourceOffset];
      const green = data[sourceOffset + 1];
      const blue = data[sourceOffset + 2];
      let alpha = 0;

      // The ivory mark is deliberately separated by its warm, high-value
      // palette. A proportional score retains anti-aliased edges.
      if (red > 40 && green > 125 && blue > 145) {
        const ivoryScore = Math.min(
          (red - 40) / 202,
          (green - 125) / 113,
          (blue - 145) / 83
        );
        alpha = Math.max(alpha, Math.min(1, ivoryScore));
      }

      // Preserve the deep-blue bookmark as a distinct foreground shape. Its
      // source geometry is a rectangle with a centered V-shaped cut-out.
      const inBookmarkBounds = x >= 255 && x <= 435 && y >= 952 && y <= 1095;
      const bookmarkTipY = 1049 + Math.abs(x - 345) * (45 / 88);
      if (
        inBookmarkBounds &&
        x >= 257 &&
        x <= 433 &&
        y >= 954 &&
        y <= 1094 &&
        (x <= 345 || y <= bookmarkTipY) &&
        red < 40 &&
        green < 130 &&
        blue < 190
      ) {
        alpha = Math.max(alpha, 1);
      }

      output[sourceOffset] = red;
      output[sourceOffset + 1] = green;
      output[sourceOffset + 2] = blue;
      output[sourceOffset + 3] = Math.round(alpha * 255);
    }
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
};

const writeAdaptiveForegroundOutput = async (
  outputPath,
  size,
  monochrome = false,
  format = 'png'
) => {
  await ensureDirectory(path.dirname(outputPath));
  const sourceBuffer = await createSelectedForegroundBuffer();
  const scaledSize = Math.round(size * adaptiveForegroundScale);
  const scaled = await sharp(sourceBuffer)
    .resize(scaledSize, scaledSize, { fit: 'contain' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(size * size * 4);
  const offset = Math.floor((size - scaledSize) / 2);

  for (let y = 0; y < scaled.info.height; y += 1) {
    for (let x = 0; x < scaled.info.width; x += 1) {
      const sourceOffset = (y * scaled.info.width + x) * 4;
      const targetOffset = ((y + offset) * size + x + offset) * 4;
      output[targetOffset] = monochrome ? 0 : scaled.data[sourceOffset];
      output[targetOffset + 1] = monochrome ? 0 : scaled.data[sourceOffset + 1];
      output[targetOffset + 2] = monochrome ? 0 : scaled.data[sourceOffset + 2];
      output[targetOffset + 3] = scaled.data[sourceOffset + 3];
    }
  }

  let pipeline = sharp(output, {
    raw: {
      width: size,
      height: size,
      channels: 4,
    },
  });

  if (format === 'webp') {
    pipeline = pipeline.webp({ lossless: true });
  } else {
    pipeline = pipeline.png();
  }

  await pipeline.toFile(outputPath);
};

const writeAdaptiveBackgroundOutput = async (outputPath, size, format = 'png') => {
  await ensureDirectory(path.dirname(outputPath));
  let pipeline = sharp(Buffer.from(adaptiveBackgroundSvg)).resize(size, size).removeAlpha();
  if (format === 'webp') {
    pipeline = pipeline.webp({ lossless: true });
  } else {
    pipeline = pipeline.png();
  }
  await pipeline.toFile(outputPath);
};

const writeAdaptiveLegacyOutput = async (outputPath, size, round = false) => {
  await ensureDirectory(path.dirname(outputPath));
  const foreground = await sharp(generatedAdaptivePath)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toBuffer();
  let pipeline = sharp(generatedAdaptiveBackgroundPath)
    .resize(size, size)
    .ensureAlpha()
    .composite([{ input: foreground }]);

  if (round) {
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
    );
    pipeline = pipeline.composite([{ input: circleMask, blend: 'dest-in' }]);
  }

  await pipeline.webp({ lossless: true }).toFile(outputPath);
};

const writeSplashPortraitOutput = async (outputPath) => {
  await ensureDirectory(path.dirname(outputPath));

  // Neutral cold-load splash: a solid brand-background image with no logo.
  // The splash intentionally shows no Bible imagery on launch (supports the
  // discreet "Calculator" icon mode); the dark fill matches `splashBackground`.
  await sharp({
    create: {
      width: splashPortraitSize.width,
      height: splashPortraitSize.height,
      channels: 4,
      background: splashBackground,
    },
  })
    .png()
    .toFile(outputPath);
};

const writeAndroidSplashOutput = async (outputPath, size) => {
  await ensureDirectory(path.dirname(outputPath));

  // Neutral cold-load splash: a fully transparent logo so only the splash
  // background (#101113) shows on launch — no Bible imagery, see
  // writeSplashPortraitOutput.
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toFile(outputPath);
};

async function generateIcons() {
  await ensureSourceIconExists();

  console.log('Generating Every Bible brand icons from assets/icon-source.png...\n');

  await writeRasterOutput(generatedIconPath, 1024, 'png');
  await writeAdaptiveForegroundOutput(generatedAdaptivePath, 432);
  await writeAdaptiveBackgroundOutput(generatedAdaptiveBackgroundPath, 432);
  await writeAdaptiveForegroundOutput(generatedMonochromePath, 432, true);
  await writeRasterOutput(generatedFaviconPath, 64, 'png');
  await writeRasterOutput(siteAppIconPath, 1024, 'png');
  await writeSplashPortraitOutput(generatedSplashPath);
  await writeRasterOutput(iosIconPath, 1024, 'png');
  await fs.copyFile(iosIconPath, iosNowPlayingIconPath);
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image.png'));
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image@2x.png'));
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image@3x.png'));

  for (const [density, size] of launcherSizes) {
    const densityDir = path.join(androidResDir, `mipmap-${density}`);
    await writeAdaptiveLegacyOutput(path.join(densityDir, 'ic_launcher.webp'), size);
    await writeAdaptiveLegacyOutput(
      path.join(densityDir, 'ic_launcher_round.webp'),
      size,
      true
    );
  }

  for (const [density, size] of adaptiveSizes) {
    const densityDir = path.join(androidResDir, `mipmap-${density}`);
    await writeAdaptiveForegroundOutput(
      path.join(densityDir, 'ic_launcher_foreground.webp'),
      size,
      false,
      'webp'
    );
    await writeAdaptiveBackgroundOutput(
      path.join(densityDir, 'ic_launcher_background.webp'),
      size,
      'webp'
    );
    await writeAdaptiveForegroundOutput(
      path.join(densityDir, 'ic_launcher_monochrome.webp'),
      size,
      true,
      'webp'
    );
  }

  for (const launcherXmlName of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    await fs.writeFile(
      path.join(androidResDir, 'mipmap-anydpi-v26', launcherXmlName),
      adaptiveIconXml
    );
  }

  for (const [density, size] of androidSplashSizes) {
    const densityDir = path.join(androidResDir, `drawable-${density}`);
    await writeAndroidSplashOutput(path.join(densityDir, 'splashscreen_logo.png'), size);
  }

  console.log('Updated icon assets from the approved source image:');
  console.log('- assets/icon-source.png');
  console.log('- assets/icon.png');
  console.log('- assets/adaptive-icon.png');
  console.log('- assets/adaptive-background.png');
  console.log('- assets/monochrome-icon.png');
  console.log('- assets/favicon.png');
  console.log('- apps/site/public/everybible/app-icon.png');
  console.log('- assets/splash-icon.png');
  console.log('- ios/EveryBible/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png');
  console.log('- ios/EveryBible/Images.xcassets/NowPlayingAppIcon.imageset/App-Icon-1024x1024@1x.png');
  console.log('- ios/EveryBible/Images.xcassets/SplashScreenBrand.imageset/image*.png');
  console.log('- android/app/src/main/res/drawable-*/splashscreen_logo.png');
  console.log('- android/app/src/main/res/mipmap-*/ic_launcher*.webp');
}

generateIcons().catch((error) => {
  console.error('Failed to generate icon assets:', error);
  process.exit(1);
});
