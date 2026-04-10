import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_TAGLINE } from "@owez/shared";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} — Who Still Owez You?`,
  description:
    "Snap a receipt, send one link, get paid. Split the bill without the awkward group-chat math.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: `${APP_NAME} — Who Still Owez You?`,
    description: APP_TAGLINE,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0D0C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Inlined so the script runs before first paint and prevents the flash of
// light theme on a dark-mode reload. Respects the user's saved choice first,
// falls back to the OS preference.
const themeInit = `try { const t = localStorage.getItem('owez-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); if (t === 'dark') document.documentElement.classList.add('dark'); } catch (e) {}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {process.env.NEXT_PUBLIC_ADSENSE_PUB_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_PUB_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body suppressHydrationWarning className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
