/* global Buffer, console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), '..');
const screenshotsRoot = path.join(projectRoot, 'store-metadata', 'screenshots');
const outputRoot = path.join(screenshotsRoot, 'google-play');

const canvas = { width: 1024, height: 500 };
const palette = {
  background: '#B93E2E',
  text: '#FFF7EF',
  subText: '#F6DDCE',
  deviceBody: '#141211',
  deviceEdge: '#2A2422',
  screenBorder: '#0B0908',
  shadow: '#4B1711',
};

const frontScreenPath = path.join(screenshotsRoot, 'ios', '2_home_screen.png');
const rearScreenPath = path.join(
  screenshotsRoot,
  'ios',
  'Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 13.34.54.png'
);

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

function buildPhoneMarkup({ x, y, width, height, rotation, screenImage, opacity = 1 }) {
  const bodyInset = Math.round(width * 0.014);
  const borderInset = Math.round(width * 0.032);
  const screenInset = Math.round(width * 0.045);
  const bodyRadius = Math.round(width * 0.125);
  const borderRadius = Math.round(width * 0.115);
  const screenRadius = Math.round(width * 0.108);
  const screenWidth = width - screenInset * 2;
  const screenHeight = height - screenInset * 2;
  const islandWidth = Math.round(width * 0.34);
  const islandHeight = Math.round(height * 0.03);
  const islandX = (width - islandWidth) / 2;
  const islandY = Math.round(height * 0.03);
  const sideButtonX = width - Math.round(width * 0.01);
  const sideButtonWidth = Math.round(width * 0.012);
  const sideButtonTop = Math.round(height * 0.18);
  const sideButtonMid = Math.round(height * 0.31);
  const sideButtonBottom = Math.round(height * 0.43);
  const leftButtonX = -Math.round(width * 0.003);
  const leftButtonWidth = Math.round(width * 0.012);
  const leftButtonTop = Math.round(height * 0.25);
  const leftButtonBottom = Math.round(height * 0.38);

  return `
    <g transform="translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})" opacity="${opacity}">
      <rect width="${width}" height="${height}" rx="${bodyRadius}" ry="${bodyRadius}" fill="url(#frameGloss)" />
      <rect
        x="${bodyInset}"
        y="${bodyInset}"
        width="${width - bodyInset * 2}"
        height="${height - bodyInset * 2}"
        rx="${borderRadius}"
        ry="${borderRadius}"
        fill="#050505"
      />
      <rect
        x="${borderInset}"
        y="${borderInset}"
        width="${width - borderInset * 2}"
        height="${height - borderInset * 2}"
        rx="${screenRadius}"
        ry="${screenRadius}"
        fill="${palette.screenBorder}"
      />
      <clipPath id="screenClip-${x}-${y}">
        <rect
          x="${screenInset}"
          y="${screenInset}"
          width="${screenWidth}"
          height="${screenHeight}"
          rx="${screenRadius - 4}"
          ry="${screenRadius - 4}"
        />
      </clipPath>
      <image
        href="${screenImage}"
        x="${screenInset}"
        y="${screenInset}"
        width="${screenWidth}"
        height="${screenHeight}"
        preserveAspectRatio="none"
        clip-path="url(#screenClip-${x}-${y})"
      />
      <rect
        x="${islandX}"
        y="${islandY}"
        width="${islandWidth}"
        height="${islandHeight}"
        rx="${islandHeight / 2}"
        ry="${islandHeight / 2}"
        fill="#090909"
        opacity="0.96"
      />
      <rect x="${sideButtonX}" y="${sideButtonTop}" width="${sideButtonWidth}" height="${Math.round(height * 0.14)}" rx="${sideButtonWidth / 2}" />
      <rect x="${sideButtonX}" y="${sideButtonMid}" width="${sideButtonWidth}" height="${Math.round(height * 0.08)}" rx="${sideButtonWidth / 2}" />
      <rect x="${sideButtonX}" y="${sideButtonBottom}" width="${sideButtonWidth}" height="${Math.round(height * 0.12)}" rx="${sideButtonWidth / 2}" />
      <rect x="${leftButtonX}" y="${leftButtonTop}" width="${leftButtonWidth}" height="${Math.round(height * 0.09)}" rx="${leftButtonWidth / 2}" />
      <rect x="${leftButtonX}" y="${leftButtonBottom}" width="${leftButtonWidth}" height="${Math.round(height * 0.17)}" rx="${leftButtonWidth / 2}" />
    </g>
  `;
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true });

  const frontScreen = await buildImageDataUri(frontScreenPath);
  const rearScreen = await buildImageDataUri(rearScreenPath);

  const svg = `
    <svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C24837" />
          <stop offset="100%" stop-color="${palette.background}" />
        </linearGradient>
        <linearGradient id="frameGloss" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#3E3834" />
          <stop offset="45%" stop-color="${palette.deviceBody}" />
          <stop offset="100%" stop-color="#1C1917" />
        </linearGradient>
        <filter id="shadowRear" x="-30%" y="-30%" width="180%" height="200%">
          <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="${palette.shadow}" flood-opacity="0.38" />
        </filter>
        <filter id="shadowFront" x="-30%" y="-30%" width="180%" height="200%">
          <feDropShadow dx="0" dy="30" stdDeviation="28" flood-color="${palette.shadow}" flood-opacity="0.44" />
          <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.22" />
        </filter>
      </defs>

      <rect width="${canvas.width}" height="${canvas.height}" fill="url(#bgGlow)" />
      <circle cx="880" cy="250" r="210" fill="#D4624E" opacity="0.15" />

      <text
        x="74"
        y="184"
        fill="${palette.text}"
        font-size="84"
        font-weight="900"
        font-family="Arial Black, Inter, Helvetica, Arial, sans-serif"
        letter-spacing="0.5"
      >${escapeXml('Every Bible')}</text>

      <text
        x="74"
        y="246"
        fill="${palette.subText}"
        font-size="34"
        font-weight="700"
        font-family="Inter, Helvetica, Arial, sans-serif"
        letter-spacing="0.2"
      >${escapeXml('Read. Listen. Grow.')}</text>

      <g filter="url(#shadowRear)">
        ${buildPhoneMarkup({
          x: 648,
          y: 92,
          width: 188,
          height: 404,
          rotation: -11,
          screenImage: rearScreen,
          opacity: 0.92,
        })}
      </g>

      <g filter="url(#shadowFront)">
        ${buildPhoneMarkup({
          x: 760,
          y: 46,
          width: 220,
          height: 472,
          rotation: 6,
          screenImage: frontScreen,
          opacity: 1,
        })}
      </g>
    </svg>
  `;

  const svgPath = path.join(outputRoot, 'feature-graphic.svg');
  const pngPath = path.join(outputRoot, 'feature-graphic.png');

  await fs.writeFile(svgPath, `${svg.trim()}\n`);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

  console.log(`Generated ${pngPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
