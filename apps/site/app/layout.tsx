import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { OperatorLauncher } from '../components/OperatorLauncher';
import { siteMetadata } from '../lib/site-metadata';

export const metadata: Metadata = siteMetadata;

const globalStyles = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8');

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
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>
        {children}
        <OperatorLauncher />
      </body>
    </html>
  );
}
