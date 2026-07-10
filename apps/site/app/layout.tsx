import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { OperatorLauncher } from '../components/OperatorLauncher';
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
      <body>
        {children}
        {/* Global AI helper launcher — self-hides unless
            NEXT_PUBLIC_EVERYBIBLE_OPERATOR_CHAT_URL is configured. */}
        <OperatorLauncher />
      </body>
    </html>
  );
}
