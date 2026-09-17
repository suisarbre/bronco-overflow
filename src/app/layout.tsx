import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { adminLogout } from "./actions";
import { isAdmin } from "@/lib/identity";
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
  title: {
    default: "CPP CS Q&A",
    template: "%s · CPP CS Q&A",
  },
  description: "Ask and answer computer science questions with Cal Poly Pomona CS students and tutors.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e4d2b" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1411" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const admin = await isAdmin();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="bg-brand text-on-brand dark:border-b dark:border-line dark:bg-card dark:text-fg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-brand-strong dark:text-on-brand">
                {"</>"}
              </span>
              CPP CS Q&amp;A
            </Link>
            {admin && (
              <form action={adminLogout} className="flex items-center gap-2 text-xs">
                <span className="rounded bg-accent px-1.5 py-0.5 font-semibold text-brand-strong">ADMIN</span>
                <button className="underline underline-offset-2 opacity-80 hover:opacity-100">Log out</button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-center text-xs text-muted">
          <p>Run by CS tutors at Cal Poly Pomona. Be kind, don&apos;t post exam answers or personal info.</p>
          <p className="mt-1">
            <Link href="/recover" className="underline-offset-2 hover:underline">
              Recover a post with your code
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
