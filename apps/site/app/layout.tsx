import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { OperatorLauncher } from '../components/OperatorLauncher';
import { siteMetadata, siteViewport } from '../lib/site-metadata';
import './globals.css';

export const metadata: Metadata = siteMetadata;
export const viewport: Viewport = siteViewport;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-theme="dark">
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
