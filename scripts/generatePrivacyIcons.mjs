import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const masterOutputPath = path.join(projectRoot, 'assets', 'icon-discreet.png');
const iosGeneratedAssetsRoot = path.join(projectRoot, 'assets', 'discreet-icons', 'ios');
const iosIconSetPath = path.join(
  projectRoot,
  'ios',
  'EveryBible',
  'Images.xcassets',
  'DiscreetAppIcon.appiconset'
);
const androidResPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

const androidIconSizes = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const iosIconSpecs = [
  { filename: 'DiscreetAppIcon-60x60@2x.png', size: 120, idiom: 'iphone', logicalSize: '60x60', scale: '2x' },
  { filename: 'DiscreetAppIcon-60x60@3x.png', size: 180, idiom: 'iphone', logicalSize: '60x60', scale: '3x' },
  { filename: 'DiscreetAppIcon-76x76@1x.png', size: 76, idiom: 'ipad', logicalSize: '76x76', scale: '1x' },
  { filename: 'DiscreetAppIcon-76x76@2x.png', size: 152, idiom: 'ipad', logicalSize: '76x76', scale: '2x' },
  {
    filename: 'DiscreetAppIcon-83.5x83.5@2x.png',
    size: 167,
    idiom: 'ipad',
    logicalSize: '83.5x83.5',
    scale: '2x',
  },
  {
    filename: 'DiscreetAppIcon-1024x1024@1x.png',
    size: 1024,
    idiom: 'ios-marketing',
    logicalSize: '1024x1024',
    scale: '1x',
  },
];

const masterSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="232" fill="#121317"/>
  <rect x="216" y="152" width="592" height="720" rx="116" fill="#1B1D23"/>
  <rect x="272" y="228" width="480" height="136" rx="42" fill="#0E1014"/>
  <rect x="324" y="272" width="196" height="52" rx="16" fill="#232731"/>
  <rect x="548" y="270" width="148" height="56" rx="20" fill="#E4DDD0" opacity="0.92"/>
  <g opacity="0.95">
    <rect x="284" y="424" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="458" y="424" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="632" y="424" width="108" height="96" rx="28" fill="#B24C4A"/>
    <rect x="284" y="554" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="458" y="554" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="632" y="554" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="284" y="684" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="458" y="684" width="108" height="96" rx="28" fill="#242934"/>
    <rect x="632" y="684" width="108" height="96" rx="28" fill="#242934"/>
  </g>
  <g fill="#F5F2EA" opacity="0.95">
    <circle cx="338" cy="472" r="14"/>
    <circle cx="512" cy="472" r="14"/>
    <path d="M685 458H703V472H717V490H703V504H685V490H671V472H685V458Z"/>
    <circle cx="338" cy="602" r="14"/>
    <circle cx="512" cy="602" r="14"/>
    <rect x="671" y="594" width="46" height="18" rx="9"/>
    <circle cx="338" cy="732" r="14"/>
    <circle cx="512" cy="732" r="14"/>
    <path d="M675 699L692.5 716.5L710 699L723 712L705.5 729.5L723 747L710 760L692.5 742.5L675 760L662 747L679.5 729.5L662 712L675 699Z"/>
  </g>
</svg>
`;

const iosContents = {
  images: iosIconSpecs.map((spec) => ({
    filename: spec.filename,
    idiom: spec.idiom,
    size: spec.logicalSize,
    scale: spec.scale,
  })),
  info: {
    version: 1,
    author: 'codex',
  },
};

const ensureDirectory = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const writePng = async (targetPath, size) => {
  await sharp(Buffer.from(masterSvg)).resize(size, size).png().toFile(targetPath);
};

await ensureDirectory(path.dirname(masterOutputPath));
await ensureDirectory(iosIconSetPath);
await ensureDirectory(iosGeneratedAssetsRoot);
await writePng(masterOutputPath, 1024);

for (const spec of iosIconSpecs) {
  const outputBuffer = await sharp(Buffer.from(masterSvg)).resize(spec.size, spec.size).png().toBuffer();
  await fs.writeFile(path.join(iosGeneratedAssetsRoot, spec.filename), outputBuffer);
  await fs.writeFile(path.join(iosIconSetPath, spec.filename), outputBuffer);
}

await fs.writeFile(path.join(iosIconSetPath, 'Contents.json'), JSON.stringify(iosContents, null, 2));

for (const [density, size] of androidIconSizes) {
  const directory = path.join(androidResPath, `mipmap-${density}`);
  await ensureDirectory(directory);
  await writePng(path.join(directory, 'ic_launcher_discreet.png'), size);
  await writePng(path.join(directory, 'ic_launcher_discreet_round.png'), size);
}

console.log('Generated discreet icon assets.');
