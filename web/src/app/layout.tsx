import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guvnor - Cleaning Round Management Made Simple",
  description: "Manage your cleaning rounds, clients, and payments effortlessly. Start free with up to 20 clients, upgrade for unlimited growth at £18/month.",
  keywords: "cleaning business, round management, client management, cleaning software, business management",
  icons: {
    // Cache-bust to ensure browsers refresh the favicon after deployments.
    icon: [{ url: "/icon.png?v=2026-01-08", type: "image/png" }],
    shortcut: [{ url: "/icon.png?v=2026-01-08", type: "image/png" }],
    apple: [{ url: "/icon.png?v=2026-01-08", type: "image/png" }],
  },
  openGraph: {
    title: "Guvnor - Cleaning Round Management Made Simple",
    description: "Manage your cleaning rounds, clients, and payments effortlessly. Start free with up to 20 clients.",
    url: "https://guvnor.app",
    siteName: "Guvnor",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Google Ads tag (gtag.js) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-17819223960"
          strategy="beforeInteractive"
        />
        <Script id="google-ads-gtag" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17819223960');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
