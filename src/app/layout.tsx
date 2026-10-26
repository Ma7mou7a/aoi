import type { Metadata } from "next";
import { Bebas_Neue, Geist_Mono, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import { LogoMark, SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const display = Bebas_Neue({
  variable: "--font-display-face",
  weight: "400",
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
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

/** Apply the saved theme before first paint (dark by default). */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${body.variable} ${geistMono.variable} antialiased`}>
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10">
          <div className="glass rounded-2xl p-6 text-sm text-slate-500 dark:text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/" className="flex items-center gap-2">
                <LogoMark className="h-6 w-6" />
                <span className="font-display text-lg tracking-wide text-foreground"><span className="text-brand">AI4</span>BRAIN</span>
              </Link>
              <nav className="flex flex-wrap gap-x-5 gap-y-2">
                <Link className="hover:text-brand" href="/skills">How each skill is measured</Link>
                <Link className="hover:text-brand" href="/try">Try the tasks</Link>
                <Link className="hover:text-brand" href="/validation">Validation study</Link>
                <Link className="hover:text-brand" href="/profile">Brain Twin details</Link>
                <a className="hover:text-brand" href="https://github.com/ChaimaGhazali/aoi">Source code</a>
              </nav>
            </div>
            <p className="mt-4 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
              AI4Brain is a non-clinical learning tool. It does not diagnose or assess any health condition. Built for CISTAC 1.0, the AI4Brain challenge.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
