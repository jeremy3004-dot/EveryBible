import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './neo-swiss.css';
// The Every Language "Field" layer loads last: it applies the design-system
// decisions (paper surfaces, type, interaction states, geometry) on top of the
// shell structure the two stylesheets above provide.
import './el-field.css';
import './analytics-atlas.css';
import './language-atlas.css';

import Script from 'next/script';
import type { Viewport } from 'next';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { getAdminThemeScript } from '@/lib/theme';

export const metadata = {
  title: 'EveryBible Admin',
  description: 'Internal admin shell for EveryBible distribution, content, and reporting.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'hsl(40 26% 92%)' },
    { media: '(prefers-color-scheme: dark)', color: 'hsl(48 14% 6%)' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The three Every Language families: Bricolage Grotesque for display,
            Archivo for all reading and UI, JetBrains Mono for eyebrows,
            timestamps and technical metadata. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Script id="admin-theme-bootstrap" strategy="beforeInteractive">
          {getAdminThemeScript()}
        </Script>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
