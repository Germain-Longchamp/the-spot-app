import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served by the app: no request to Google when a
// guest opens the page. "swap" shows the system font until Inter arrives.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "The Spot",
  description: "Photobooth pour événements",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
