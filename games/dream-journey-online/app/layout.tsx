import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Dream Journey Online',
  description: 'A four-player online co-op side-scrolling action game prototype.',
  openGraph: {
    title: '西行战记',
    description: '四人联机动作闯关',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: '西行战记四人小队' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '西行战记',
    description: '四人联机动作闯关',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
