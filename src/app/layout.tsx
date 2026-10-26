import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "AI4Brain: Cognitive Growth Agent",
  description: "Adaptive, explainable, non-clinical cognitive profiling and coaching.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold tracking-tight">AI4Brain</Link>
          <nav className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
            <Link href="/play">Assess</Link>
            <Link href="/profile">Brain Twin</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
