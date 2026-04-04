import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { siteMetadata } from '../lib/site-metadata';
import './globals.css';
import './neo-swiss.css';

export const metadata: Metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://web-assets.youversion.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/wfn2tts.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
