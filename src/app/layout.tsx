import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AlphaDesk — Pre-Market Intraday Strategist",
  description:
    "AI pre-market intelligence for Indian equities. Studies economics, charts and news before the opening bell, then suggests 5 sound intraday picks with full reasoning, risk management and technical foundation.",
  keywords: [
    "intraday trading",
    "NSE",
    "pre-market analysis",
    "stock picks",
    "technical analysis",
    "Indian stock market",
  ],
  authors: [{ name: "AlphaDesk" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
