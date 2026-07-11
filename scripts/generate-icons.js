#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const sourceIconPath = path.join(assetsDir, 'icon-source.png');
const generatedIconPath = path.join(assetsDir, 'icon.png');
const generatedAdaptivePath = path.join(assetsDir, 'adaptive-icon.png');
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

const monochromeIconSvg = `
<svg width="432" height="432" viewBox="0 0 432 432" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M66 164C113 166 157 177 204 198V330C160 305 116 295 66 298V164Z" fill="#121212"/>
  <path d="M366 164C319 166 275 177 228 198V330C272 305 316 295 366 298V164Z" fill="#121212"/>
  <path d="M207 196H225V330H207V196Z" fill="#121212"/>
  <path d="M205 40H227L220 124H212L205 40Z" fill="#121212"/>
  <path d="M98 68L114 58L178 130L171 138L98 68Z" fill="#121212"/>
  <path d="M334 68L318 58L254 130L261 138L334 68Z" fill="#121212"/>
  <path d="M34 186L42 170L130 196L130 205L34 186Z" fill="#121212"/>
  <path d="M398 186L390 170L302 196L302 205L398 186Z" fill="#121212"/>
  <path d="M92 362L106 374L172 302L165 295L92 362Z" fill="#121212"/>
  <path d="M340 362L326 374L260 302L267 295L340 362Z" fill="#121212"/>
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

const writeMonochromeOutput = async () => {
  await sharp(Buffer.from(monochromeIconSvg)).resize(432, 432).png().toFile(generatedMonochromePath);
};

async function generateIcons() {
  await ensureSourceIconExists();

  console.log('Generating Every Bible brand icons from assets/icon-source.png...\n');

  await writeRasterOutput(generatedIconPath, 1024, 'png');
  await writeRasterOutput(generatedAdaptivePath, 432, 'png');
  await writeMonochromeOutput();
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
  console.log('- assets/icon-source.png');
  console.log('- assets/icon.png');
  console.log('- assets/adaptive-icon.png');
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
