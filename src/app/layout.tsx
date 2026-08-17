import type { Metadata, Viewport } from 'next';
import { Manrope, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'vanish — conversations without a trace',
  description:
    'Anonymous, ephemeral conversations with strangers — built around consent, curiosity, and a clean exit.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0A0A12',
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} dark bg-background`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-violet selection:text-white">
        {children}
      </body>
    </html>
  );
}
