import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ErrorReporter } from "@/components/error-reporter";
import "./globals.css";

// Downloaded at build time and served by the app: no request to Google when a
// guest opens the page. "swap" shows the system font until Inter arrives.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "The Spot Memories",
  description: "Photobooth pour événements : prenez une photo, elle est imprimée sur place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="antialiased">
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
