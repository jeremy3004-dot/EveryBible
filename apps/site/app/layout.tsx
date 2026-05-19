import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { siteMetadata } from '../lib/site-metadata';
import './globals.css';

export const metadata: Metadata = siteMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
