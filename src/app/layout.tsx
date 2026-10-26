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
        <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4">
          <Link href="/" className="font-semibold tracking-tight">AI4Brain</Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/play">Assess</Link>
            <Link href="/play?mode=training">Train</Link>
            <Link href="/coach">Coach</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl border-t border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-800">
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/skills">How each skill is measured</Link>
            <Link href="/try">Try the tasks</Link>
            <Link href="/validation">Validation study</Link>
            <Link href="/profile">Brain Twin details</Link>
            <a href="https://github.com/ChaimaGhazali/aoi">Source code</a>
          </nav>
          <p className="mt-3 text-xs">AI4Brain is a non-clinical learning tool. It does not diagnose or assess any health condition.</p>
        </footer>
      </body>
    </html>
  );
}
