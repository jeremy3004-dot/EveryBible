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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap" />
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
