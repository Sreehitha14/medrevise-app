import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "MedRevise — Textbook to Revision PDF",
  description: "Turn photographed textbook pages into handwritten-style revision notes.",
};

// Explicit viewport (rather than relying on Next's default) so the app
// scales correctly on phones and doesn't zoom in when an input is focused
// (a common iOS Safari annoyance when font-size < 16px on inputs).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#12171f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
