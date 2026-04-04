import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './neo-swiss.css';

import Script from 'next/script';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { getAdminThemeScript } from '@/lib/theme';

export const metadata = {
  title: 'EveryBible Admin',
  description: 'Internal admin shell for EveryBible distribution, content, and reporting.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/wfn2tts.css" />
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
