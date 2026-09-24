import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { OperatorLauncher } from '../components/OperatorLauncher';
import { siteMetadata, siteViewport } from '../lib/site-metadata';
import './globals.css';

/* The EL UI and label faces, self-hosted at build time. globals.css reads
   them through --font-archivo and --font-jetbrains-mono. Both are variable
   fonts, so one file covers every weight the site uses. */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});
/* Mono is only set at 400, 500 and 600. Naming those weights gets Google's
   variable file cut to that part of the weight axis: 31 KB instead of 40 KB
   for the full 100–800 range, with the same letterforms at these weights. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = siteMetadata;
export const viewport: Viewport = siteViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${archivo.variable} ${jetbrainsMono.variable}`}
      data-theme="dark"
    >
      <head>
        {/* The homepage headline (the LCP element) is set in the bold face;
            its basic-Latin subset covers every character in it. */}
        <link
          rel="preload"
          href="/fonts/AlteHaasGrotesk-Bold-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      {/* .grain is the kit's paper-noise overlay: 3.5% multiply in light,
          2.5% in dark, 0 in high contrast, removed in print. */}
      <body className="grain">
        {children}
        {/* Global AI helper launcher — self-hides unless
            NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL is configured. */}
        <OperatorLauncher />
      </body>
    </html>
  );
}
