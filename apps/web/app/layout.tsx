import type { Metadata, Viewport } from 'next';
import { Courier_Prime, Special_Elite } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

/**
 * Two faces, both self-hosted by next/font at build time (no runtime request
 * to Google): Special Elite for display type and stamps only, Courier Prime
 * for everything a player has to read quickly — it was drawn as a more
 * legible Courier. Exposed as CSS variables that `--font-display` /
 * `--font-type` in globals.css resolve through.
 */
const specialElite = Special_Elite({
  weight: '400',
  subsets: ['latin', 'latin-ext'],
  variable: '--font-special-elite',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin', 'latin-ext'],
  variable: '--font-courier-prime',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Berlin 1988',
  description: 'A Cold War hidden-movement game for 1-4 players.',
};

export const viewport: Viewport = {
  themeColor: '#1b1915',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${specialElite.variable} ${courierPrime.variable}`}>
      <body>{children}</body>
    </html>
  );
}
