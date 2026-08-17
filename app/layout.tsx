import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { APP_URL } from '@/lib/env';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'SkyTonight — is tonight’s sky worth going outside for?',
  description:
    'Tonight’s sky score for any location: cloud cover, golden and blue hour, moon phase and aurora chance. No signup.',
  openGraph: {
    type: 'website',
    siteName: 'SkyTonight',
    url: APP_URL,
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: '#06070d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
