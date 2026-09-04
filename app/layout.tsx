import type { Metadata } from 'next';
import { Noto_Sans_JP, Sora } from 'next/font/google';
import './globals.css';

const notoSansJP = Noto_Sans_JP({ variable: '--font-jp', subsets: ['latin'] });
const sora = Sora({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '3試合保証トーナメント | Tournament Desk',
  description: '8チーム・全12試合で1位から8位まで決定する大会運営アプリ',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body className={`${notoSansJP.variable} ${sora.variable}`}>{children}</body></html>;
}

