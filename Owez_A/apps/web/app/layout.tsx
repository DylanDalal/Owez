import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: 'Owez — Who Still Owez You?',
  description:
    'Snap a receipt, send one link, get paid. Split the bill without the awkward group chat math.',
  openGraph: {
    title: 'Owez — Who Still Owez You?',
    description:
      'Snap a receipt, send one link, get paid. Split the bill without the awkward group chat math.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const t = localStorage.getItem('owez-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); if (t === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
