import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}
