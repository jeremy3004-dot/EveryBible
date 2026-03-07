#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const sourceIconPath = path.join(assetsDir, 'icon-source.jpg');
const generatedIconPath = path.join(assetsDir, 'icon.png');
const generatedAdaptivePath = path.join(assetsDir, 'adaptive-icon.png');
const generatedMonochromePath = path.join(assetsDir, 'monochrome-icon.png');
const generatedFaviconPath = path.join(assetsDir, 'favicon.png');
const generatedSplashPath = path.join(assetsDir, 'splash-icon.png');
const iosIconPath = path.join(
  projectRoot,
  'ios',
  'EveryBible',
  'Images.xcassets',
  'AppIcon.appiconset',
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
const splashBackground = '#101113';
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

const monochromeIconSvg = `
<svg width="432" height="432" viewBox="0 0 432 432" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M120 90C146 90 172 93 198 100V332C174 325 147 322 120 322C101 322 83 324 66 328V132C82 104 99 90 120 90Z"
    fill="#121212"
  />
  <path
    d="M312 90C286 90 260 93 234 100V332C258 325 285 322 312 322C331 322 349 324 366 328V132C350 104 333 90 312 90Z"
    fill="#121212"
  />
  <rect x="205" y="80" width="22" height="250" rx="11" fill="#121212"/>
  <rect x="166" y="188" width="100" height="22" rx="11" fill="#121212"/>
</svg>
`;

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

const createRoundedMask = (size, radius) => Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
</svg>
`);

const createRoundedIconBuffer = async (size, radius) =>
  sharp(sourceIconPath)
    .resize(size, size, {
      fit: 'cover',
      position: 'center',
    })
    .composite([{ input: createRoundedMask(size, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();

const writeSplashPortraitOutput = async (outputPath) => {
  await ensureDirectory(path.dirname(outputPath));

  const iconSize = 428;
  const iconRadius = 86;
  const iconBuffer = await createRoundedIconBuffer(iconSize, iconRadius);
  const iconLeft = Math.round((splashPortraitSize.width - iconSize) / 2);
  const iconTop = Math.round((splashPortraitSize.height - iconSize) / 2);

  await sharp({
    create: {
      width: splashPortraitSize.width,
      height: splashPortraitSize.height,
      channels: 4,
      background: splashBackground,
    },
  })
    .composite([
      {
        input: iconBuffer,
        left: iconLeft,
        top: iconTop,
      },
    ])
    .png()
    .toFile(outputPath);
};

const writeAndroidSplashOutput = async (outputPath, size) => {
  await ensureDirectory(path.dirname(outputPath));

  const iconSize = Math.round(size * 0.68);
  const iconRadius = Math.round(iconSize * 0.2);
  const iconBuffer = await createRoundedIconBuffer(iconSize, iconRadius);
  const iconOffset = Math.round((size - iconSize) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: iconBuffer,
        left: iconOffset,
        top: iconOffset,
      },
    ])
    .png()
    .toFile(outputPath);
};

const writeMonochromeOutput = async () => {
  await sharp(Buffer.from(monochromeIconSvg)).resize(432, 432).png().toFile(generatedMonochromePath);
};

async function generateIcons() {
  await ensureSourceIconExists();

  console.log('Generating Every Bible brand icons from assets/icon-source.jpg...\n');

  await writeRasterOutput(generatedIconPath, 1024, 'png');
  await writeRasterOutput(generatedAdaptivePath, 432, 'png');
  await writeMonochromeOutput();
  await writeRasterOutput(generatedFaviconPath, 64, 'png');
  await writeSplashPortraitOutput(generatedSplashPath);
  await writeRasterOutput(iosIconPath, 1024, 'png');
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image.png'));
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image@2x.png'));
  await writeSplashPortraitOutput(path.join(iosSplashDir, 'image@3x.png'));

  for (const [density, size] of launcherSizes) {
    const densityDir = path.join(androidResDir, `mipmap-${density}`);
    await writeRasterOutput(path.join(densityDir, 'ic_launcher.webp'), size, 'webp');
    await writeRasterOutput(path.join(densityDir, 'ic_launcher_round.webp'), size, 'webp');
  }

  for (const [density, size] of adaptiveSizes) {
    const densityDir = path.join(androidResDir, `mipmap-${density}`);
    await writeRasterOutput(path.join(densityDir, 'ic_launcher_foreground.webp'), size, 'webp');
    await sharp(Buffer.from(monochromeIconSvg))
      .resize(size, size)
      .webp({ lossless: true })
      .toFile(path.join(densityDir, 'ic_launcher_monochrome.webp'));
  }

  for (const [density, size] of androidSplashSizes) {
    const densityDir = path.join(androidResDir, `drawable-${density}`);
    await writeAndroidSplashOutput(path.join(densityDir, 'splashscreen_logo.png'), size);
  }

  console.log('Updated icon assets from the approved source image:');
  console.log('- assets/icon-source.jpg');
  console.log('- assets/icon.png');
  console.log('- assets/adaptive-icon.png');
  console.log('- assets/monochrome-icon.png');
  console.log('- assets/favicon.png');
  console.log('- assets/splash-icon.png');
  console.log('- ios/EveryBible/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png');
  console.log('- ios/EveryBible/Images.xcassets/SplashScreenBrand.imageset/image*.png');
  console.log('- android/app/src/main/res/drawable-*/splashscreen_logo.png');
  console.log('- android/app/src/main/res/mipmap-*/ic_launcher*.webp');
}

generateIcons().catch((error) => {
  console.error('Failed to generate icon assets:', error);
  process.exit(1);
});
