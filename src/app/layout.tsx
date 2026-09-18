import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { signOut } from "./actions";
import { MemberBadge } from "@/components/MemberBadge";
import { getStaffRole } from "@/lib/identity";
import { getMember } from "@/lib/members";
import { moderationCount } from "@/lib/queries";
import { getSettings } from "@/lib/settings-store";
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
    default: "Bronco Overflow",
    template: "%s · Bronco Overflow",
  },
  description: "Bronco Overflow — ask and answer CS questions with Cal Poly Pomona students and tutors.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1e4d2b" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1411" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [role, member, settings] = await Promise.all([getStaffRole(), getMember(), getSettings()]);
  // Only staff see the Moderation button, so only they pay for the count.
  const toReview = role ? await moderationCount() : 0;

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="bg-brand text-on-brand dark:border-b dark:border-line dark:bg-card dark:text-fg">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight whitespace-nowrap">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-on-accent">
                {"</>"}
              </span>
              Bronco Overflow
            </Link>
            {(role || member) && (
              <span className="flex items-center gap-2 text-xs whitespace-nowrap">
                {member && (
                  // A light chip behind the badge keeps its colors readable on the green header.
                  <span className="rounded-full bg-card p-0.5" title="You're posting with this badge">
                    <MemberBadge title={member.title} color={member.color} />
                  </span>
                )}
                {role === "admin" && (
                  <span className="rounded bg-accent px-1.5 py-0.5 font-semibold text-on-accent">ADMIN</span>
                )}
                {role === "tutor" && (
                  <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-brand dark:bg-brand dark:text-on-brand">
                    TUTOR
                  </span>
                )}
                {role && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 rounded-full border border-current/40 px-2 py-0.5 font-semibold hover:bg-white/10"
                    title={toReview ? `${toReview} post(s) need a look` : "Nothing waiting"}
                  >
                    <span className="sm:hidden">Mod</span>
                    <span className="hidden sm:inline">Moderation</span>
                    {toReview > 0 && (
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-none text-white">
                        {toReview > 99 ? "99+" : toReview}
                      </span>
                    )}
                  </Link>
                )}
                <form action={signOut}>
                  <button className="underline underline-offset-2 opacity-80 hover:opacity-100">Log out</button>
                </form>
              </span>
            )}
          </div>
        </header>
        {settings.readOnly && (
          <p className="bg-accent px-4 py-2 text-center text-sm font-medium text-on-accent">
            The board is paused right now — you can read, but posting is off.
          </p>
        )}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-center text-xs text-muted">
          <p>Run by CS tutors at Cal Poly Pomona. Be kind, don&apos;t post exam answers or personal info.</p>
          <p className="mt-1 space-x-3">
            <Link href="/recover" className="underline-offset-2 hover:underline">
              Recover a post with your code
            </Link>
            <Link href="/login" className="underline-offset-2 hover:underline">
              Staff sign in
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
