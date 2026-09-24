import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import { SHARE_IMAGE } from '../lib/site-metadata';

/* Link-preview card (Open Graph + Twitter). Rendered once at build time from
   the homepage headline, in the site's default dark theme tokens (see the
   `.dark` scope in globals.css) and the self-hosted Alte Haas Grotesk face.
   Satori reads TTF, not WOFF2, so this uses the TTF binaries. */

export const alt = SHARE_IMAGE.alt;
export const size = { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height };
export const contentType = 'image/png';

const BACKGROUND = 'hsl(48 14% 6%)';
const FOREGROUND = 'hsl(44 30% 91%)';
const MUTED = 'hsl(40 12% 65%)';
const PRIMARY = 'hsl(202 80% 56%)';
const BORDER = 'hsl(40 14% 21%)';
/* Scripture status colours from the atlas legend: Bible, NT, portions, none. */
const SCRIPTURE = ['hsl(171 58% 50%)', 'hsl(40 84% 61%)', 'hsl(23 60% 60%)', 'hsl(355 73% 60%)'];

const fontPath = (file: string) => path.join(process.cwd(), 'public/fonts', file);

export default async function OpenGraphImage() {
  const [regular, bold] = await Promise.all([
    readFile(fontPath('AlteHaasGrotesk-Regular.ttf')),
    readFile(fontPath('AlteHaasGrotesk-Bold.ttf')),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: BACKGROUND,
        color: FOREGROUND,
        fontFamily: 'Alte Haas Grotesk',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>EveryBible</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {SCRIPTURE.map((color) => (
            <div
              key={color}
              style={{ width: 14, height: 14, borderRadius: 7, background: color }}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 92,
          fontWeight: 700,
          lineHeight: 0.95,
          letterSpacing: '-0.03em',
        }}
      >
        <div>God’s Word.</div>
        <div style={{ color: PRIMARY }}>In your heart language.</div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 28,
          borderTop: `1px solid ${BORDER}`,
          fontSize: 28,
          color: MUTED,
        }}
      >
        <div>Read and listen to Scripture in your language. Free.</div>
        <div>An Every Language project</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Alte Haas Grotesk', data: regular, weight: 400, style: 'normal' },
        { name: 'Alte Haas Grotesk', data: bold, weight: 700, style: 'normal' },
      ],
    }
  );
}
