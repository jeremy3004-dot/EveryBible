/* global Buffer, console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const sourceRoot = path.join(projectRoot, 'store-metadata', 'screenshots', 'ios');
const outputRoot = path.join(sourceRoot, 'iphone-67-2026-04-03');

const canvas = { width: 1290, height: 2796 };
const palette = {
  background: '#B93E2E',
  deviceBody: '#141211',
  deviceEdge: '#2A2422',
  screenBorder: '#0B0908',
  text: '#FFF7EF',
  subText: '#FFE8D9',
};

const slides = [
  {
    order: '01',
    slug: 'read_offline',
    fileName: '01-read-offline.png',
    action: 'READ',
    benefitLines: ['THE BIBLE', 'OFFLINE'],
    source: '1_bible_browser.png',
  },
  {
    order: '02',
    slug: 'track_habit',
    fileName: '02-track-habit.png',
    action: 'TRACK',
    benefitLines: ['YOUR READING', 'HABIT'],
    source: '2_home_screen.png',
  },
  {
    order: '03',
    slug: 'highlight_verses',
    fileName: '03-highlight-verses.png',
    action: 'HIGHLIGHT',
    benefitLines: ['KEY VERSES', 'FAST'],
    source: 'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.52.43.png',
  },
  {
    order: '04',
    slug: 'share_verse_cards',
    fileName: '04-share-verse-cards.png',
    action: 'SHARE',
    benefitLines: ['BEAUTIFUL', 'VERSE CARDS'],
    source: 'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.53.25.png',
  },
  {
    order: '05',
    slug: 'save_notes',
    fileName: '05-save-notes.png',
    action: 'SAVE',
    benefitLines: ['NOTES AS', 'YOU READ'],
    source: 'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.53.52.png',
  },
  {
    order: '06',
    slug: 'grow_foundations',
    fileName: '06-grow-foundations.png',
    action: 'GROW',
    benefitLines: ['WITH', 'FOUNDATIONS'],
    source: 'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 13.34.38.png',
  },
  {
    order: '07',
    slug: 'find_wisdom',
    fileName: '07-find-wisdom.png',
    action: 'FIND',
    benefitLines: ['WISDOM FOR', 'REAL LIFE'],
    source: 'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 13.34.54.png',
  },
];

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function buildImageDataUri(imagePath) {
  const data = await fs.readFile(imagePath);
  return `data:image/png;base64,${data.toString('base64')}`;
}

function buildSlideSvg({ action, benefitLines, screenImage }) {
  const benefitText = benefitLines
    .map(
      (line, index) =>
        `<tspan x="645" dy="${index === 0 ? 0 : 90}">${escapeXml(line)}</tspan>`
    )
    .join('');

  return `
    <svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="phoneShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="46" stdDeviation="40" flood-color="#4B1711" flood-opacity="0.4" />
          <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000000" flood-opacity="0.25" />
        </filter>
        <linearGradient id="frameGloss" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3E3834" />
          <stop offset="45%" stop-color="${palette.deviceBody}" />
          <stop offset="100%" stop-color="#1C1917" />
        </linearGradient>
        <clipPath id="screenClip">
          <rect x="189" y="553" width="912" height="1974" rx="110" ry="110" />
        </clipPath>
      </defs>

      <rect width="${canvas.width}" height="${canvas.height}" fill="${palette.background}" />

      <text
        x="645"
        y="250"
        text-anchor="middle"
        fill="${palette.text}"
        font-size="168"
        font-weight="900"
        font-family="Arial Black, Inter, Helvetica, Arial, sans-serif"
        letter-spacing="1"
      >${escapeXml(action)}</text>

      <text
        x="645"
        y="386"
        text-anchor="middle"
        fill="${palette.subText}"
        font-size="78"
        font-weight="900"
        font-family="Arial Black, Inter, Helvetica, Arial, sans-serif"
        letter-spacing="0.5"
      >${benefitText}</text>

      <g filter="url(#phoneShadow)">
        <rect x="145" y="505" width="1000" height="2085" rx="126" ry="126" fill="url(#frameGloss)" />
        <rect x="159" y="519" width="972" height="2057" rx="118" ry="118" fill="#050505" />
        <rect x="179" y="539" width="932" height="2017" rx="112" ry="112" fill="${palette.screenBorder}" />
      </g>

      <image
        href="${screenImage}"
        x="189"
        y="553"
        width="912"
        height="1974"
        preserveAspectRatio="none"
        clip-path="url(#screenClip)"
      />

      <rect x="470" y="584" width="350" height="66" rx="33" ry="33" fill="#090909" opacity="0.96" />
      <rect x="451" y="604" width="18" height="18" rx="9" ry="9" fill="#121212" opacity="0.85" />
      <rect x="830" y="604" width="18" height="18" rx="9" ry="9" fill="#121212" opacity="0.85" />

      <rect x="1119" y="870" width="8" height="290" rx="4" ry="4" fill="#3D3531" opacity="0.95" />
      <rect x="163" y="968" width="8" height="210" rx="4" ry="4" fill="#2E2825" opacity="0.92" />
      <rect x="163" y="1214" width="8" height="384" rx="4" ry="4" fill="#2E2825" opacity="0.92" />
    </svg>
  `;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await ensureDir(outputRoot);

  const manifest = [];

  for (const slide of slides) {
    const sourcePath = path.join(sourceRoot, slide.source);
    const slideDir = path.join(outputRoot, `${slide.order}_${slide.slug}`);
    const scaffoldPath = path.join(slideDir, 'scaffold.png');
    const uploadPath = path.join(outputRoot, slide.fileName);
    const screenImage = await buildImageDataUri(sourcePath);

    await ensureDir(slideDir);

    const svg = buildSlideSvg({
      action: slide.action,
      benefitLines: slide.benefitLines,
      screenImage,
    });

    await sharp(Buffer.from(svg))
      .png()
      .toFile(scaffoldPath);

    manifest.push({
      ...slide,
      sourcePath,
      scaffoldPath,
      uploadPath,
    });
  }

  await fs.writeFile(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString(), slides: manifest }, null, 2)}\n`
  );

  console.log(`Generated ${slides.length} iOS App Store scaffolds in ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
